"""Fine-tunes the small phrasing model on the merged targets.

The model reads a record's notes, the fact sheet, and writes the coach's
text. There is no system prompt: the phone pays for every token it reads.

PyTorch for ROCm and transformers are installed with pip --target into a
folder on the data drive, since exFAT refuses the symlinks a venv needs:

  PYTHONPATH=$DRIVE/pylib python3 training/finetune.py --data training/data/set \
    --base HuggingFaceTB/SmolLM2-360M-Instruct --out training/data/runs/r1

Then generate for the held-out records and check them:

  PYTHONPATH=$DRIVE/pylib python3 training/finetune.py --generate training/data/runs/r1 \
    --data training/data/set --out training/data/runs/r1/heldout.jsonl
  node ... training/check-texts.ts training/data/runs/r1/heldout.jsonl
"""

import argparse
import json
import math
import random
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


def rows(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def prompt_ids(tok, sheet):
    # SmolLM2's chat form without its default system prompt, which would
    # cost the phone some 20 tokens a request for nothing.
    text = f"<|im_start|>user\n{sheet}<|im_end|>\n<|im_start|>assistant\n"
    return tok(text, add_special_tokens=False)["input_ids"]


def encode(tok, row, max_len):
    """Prompt and answer tokens; only the answer is learned."""
    p = prompt_ids(tok, row["sheet"])
    a = tok(row["text"] + "<|im_end|>", add_special_tokens=False)["input_ids"]
    ids = (p + a)[:max_len]
    labels = ([-100] * len(p) + a)[:max_len]
    return ids, labels


def batches(examples, size, rng):
    # Similar lengths together, so little of each batch is padding.
    order = sorted(range(len(examples)), key=lambda i: len(examples[i][0]) + rng.random())
    chunks = [order[i : i + size] for i in range(0, len(order), size)]
    rng.shuffle(chunks)
    return chunks


def collate(examples, idx, pad, device):
    n = max(len(examples[i][0]) for i in idx)
    ids = torch.full((len(idx), n), pad)
    labels = torch.full((len(idx), n), -100)
    mask = torch.zeros((len(idx), n), dtype=torch.long)
    for j, i in enumerate(idx):
        a, b = examples[i]
        ids[j, : len(a)] = torch.tensor(a)
        labels[j, : len(b)] = torch.tensor(b)
        mask[j, : len(a)] = 1
    return ids.to(device), labels.to(device), mask.to(device)


def train(o):
    rng = random.Random(o.seed)
    torch.manual_seed(o.seed)
    tok = AutoTokenizer.from_pretrained(o.base)
    model = AutoModelForCausalLM.from_pretrained(o.base, torch_dtype=torch.bfloat16).cuda()
    model.gradient_checkpointing_enable()
    data = rows(f"{o.data}/train.jsonl")
    # A small slice of the training set shows the loss on unseen texts.
    rng.shuffle(data)
    val, data = data[: o.val], data[o.val :]
    ex = [encode(tok, r, o.max_len) for r in data]
    vex = [encode(tok, r, o.max_len) for r in val]
    pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    steps = o.epochs * math.ceil(len(ex) / o.batch)
    opt = torch.optim.AdamW(model.parameters(), lr=o.lr, weight_decay=0.0, fused=True)
    warm = max(1, steps // 30)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt,
        lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))),
    )
    print(f"{len(ex)} examples, {len(vex)} for validation, {steps} steps", flush=True)

    def validate():
        model.eval()
        total, count = 0.0, 0
        with torch.no_grad():
            for idx in batches(vex, o.batch, random.Random(0)):
                ids, labels, mask = collate(vex, idx, pad, "cuda")
                n = (labels[:, 1:] != -100).sum().item()
                total += model(input_ids=ids, attention_mask=mask, labels=labels).loss.item() * n
                count += n
        model.train()
        return total / count

    model.train()
    step, started = 0, time.time()
    for epoch in range(o.epochs):
        for idx in batches(ex, o.batch, rng):
            ids, labels, mask = collate(ex, idx, pad, "cuda")
            loss = model(input_ids=ids, attention_mask=mask, labels=labels).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            step += 1
            if step % 50 == 0:
                rate = step / (time.time() - started)
                print(
                    f"step {step}/{steps} loss {loss.item():.3f} "
                    f"lr {sched.get_last_lr()[0]:.2e} {rate:.2f} steps/s",
                    flush=True,
                )
        print(f"epoch {epoch + 1} validation loss {validate():.3f}", flush=True)
    model.save_pretrained(o.out)
    tok.save_pretrained(o.out)
    print(f"Saved to {o.out} after {(time.time() - started) / 60:.1f} min", flush=True)


def generate(o):
    tok = AutoTokenizer.from_pretrained(o.generate, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(o.generate, torch_dtype=torch.bfloat16).cuda()
    model.eval()
    held = rows(f"{o.data}/heldout.jsonl")
    pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    started = time.time()
    with open(o.out, "w") as f:
        for i in range(0, len(held), o.batch):
            part = held[i : i + o.batch]
            enc = [prompt_ids(tok, r["sheet"]) for r in part]
            n = max(map(len, enc))
            ids = torch.tensor([[pad] * (n - len(e)) + e for e in enc]).cuda()
            mask = torch.tensor([[0] * (n - len(e)) + [1] * len(e) for e in enc]).cuda()
            with torch.no_grad():
                out = model.generate(
                    input_ids=ids,
                    attention_mask=mask,
                    max_new_tokens=200,
                    do_sample=False,
                    pad_token_id=pad,
                )
            for r, seq in zip(part, out[:, n:]):
                text = tok.decode(seq, skip_special_tokens=True).strip()
                f.write(json.dumps({"id": r["id"], "sheet": r["sheet"], "text": text}) + "\n")
            print(f"{i + len(part)}/{len(held)} in {time.time() - started:.0f} s", flush=True)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--data", default="training/data/set")
    a.add_argument("--base", default="HuggingFaceTB/SmolLM2-360M-Instruct")
    a.add_argument("--out", required=True)
    a.add_argument("--generate", help="a trained model's folder: write texts for held-out records")
    a.add_argument("--epochs", type=int, default=3)
    a.add_argument("--batch", type=int, default=32)
    a.add_argument("--lr", type=float, default=1e-4)
    a.add_argument("--max-len", type=int, default=640)
    a.add_argument("--val", type=int, default=500)
    a.add_argument("--seed", type=int, default=1)
    o = a.parse_args()
    generate(o) if o.generate else train(o)


if __name__ == "__main__":
    main()
