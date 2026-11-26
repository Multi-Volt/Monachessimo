"""Converts Maia-2's rapid model into the compact form the app reads.

Maia-2 (CSSLab, MIT, https://github.com/CSSLab/maia2) predicts the move a
player of a given rating makes, from one network conditioned on both
players' ratings. Only the move head is kept. Batch norm is folded into the
convolutions, and every weight matrix is stored as 8-bit integers with one
float scale per output row; vectors stay 32-bit floats.

  PYTHONPATH=$DRIVE/pylib:$DRIVE/maia2/pylib-chess:$DRIVE/maia2/src \\
    python3 scripts/convert-maia2.py $DRIVE/maia2/rapid_model.pt \\
    --out $DRIVE/maia2/out --reference tests/fixtures/maia2-reference.json

Writes maia2-rapid.bin (a 4-byte header length, a JSON header listing each
tensor's name, shape, kind and byte offset, then the data) and moves.json
(the 1880 moves of the policy, from White's side, in Maia-2's order). The
reference file holds Maia-2's own top moves and logits for a few positions,
computed here with its PyTorch code, for the app's tests to match.
"""

import argparse
import json
import os
import struct

import chess
import torch
from maia2.main import MAIA2Model
from maia2.utils import create_elo_dict, get_all_possible_moves

EPS = 1e-5


class Cfg:
    input_channels = 18
    dim_cnn = 256
    dim_vit = 1024
    num_blocks_cnn = 5
    num_blocks_vit = 2
    vit_length = 8
    elo_dim = 128


def fold(sd, conv, bn):
    w = sd[f"{conv}.weight"]
    s = sd[f"{bn}.weight"] / torch.sqrt(sd[f"{bn}.running_var"] + EPS)
    b = sd[f"{bn}.bias"] - sd[f"{bn}.running_mean"] * s
    return w * s[:, None, None, None], b


def main():
    a = argparse.ArgumentParser()
    a.add_argument("checkpoint")
    a.add_argument("--out", required=True)
    a.add_argument("--reference", required=True)
    o = a.parse_args()
    os.makedirs(o.out, exist_ok=True)

    ck = torch.load(o.checkpoint, map_location="cpu", weights_only=False)
    sd = {k.removeprefix("module."): v.float() for k, v in ck["model_state_dict"].items()}
    moves = get_all_possible_moves()
    elo_dict = create_elo_dict()

    tensors = []
    c = "chess_cnn"
    tensors += [("cnn.in", *fold(sd, f"{c}.conv1", f"{c}.bn1"))]
    for i in range(Cfg.num_blocks_cnn):
        for j in (1, 2):
            tensors += [(f"cnn.{i}.{j}", *fold(sd, f"{c}.layers.{i}.conv{j}", f"{c}.layers.{i}.bn{j}"))]
    tensors += [("cnn.last", *fold(sd, f"{c}.conv_last", f"{c}.bn_last"))]
    out = []
    for name, w, b in tensors:
        out += [(f"{name}.w", w), (f"{name}.b", b)]
    vec = lambda k: sd[k]
    out += [
        ("patch.w", vec("to_patch_embedding.0.weight")),
        ("patch.b", vec("to_patch_embedding.0.bias")),
        ("patch.ln.w", vec("to_patch_embedding.1.weight")),
        ("patch.ln.b", vec("to_patch_embedding.1.bias")),
        ("pos", vec("pos_embedding")[0]),
        ("elo", vec("elo_embedding.weight")),
    ]
    for L in range(Cfg.num_blocks_vit):
        p = f"transformer.elo_layers.{L}"
        out += [
            (f"t{L}.ln.w", vec(f"{p}.0.norm.weight")),
            (f"t{L}.ln.b", vec(f"{p}.0.norm.bias")),
            (f"t{L}.qkv.w", vec(f"{p}.0.to_qkv.weight")),
            (f"t{L}.eloq.w", vec(f"{p}.0.elo_query.weight")),
            (f"t{L}.out.w", vec(f"{p}.0.to_out.0.weight")),
            (f"t{L}.out.b", vec(f"{p}.0.to_out.0.bias")),
            (f"t{L}.ff.ln.w", vec(f"{p}.1.net.0.weight")),
            (f"t{L}.ff.ln.b", vec(f"{p}.1.net.0.bias")),
            (f"t{L}.ff1.w", vec(f"{p}.1.net.1.weight")),
            (f"t{L}.ff1.b", vec(f"{p}.1.net.1.bias")),
            (f"t{L}.ff2.w", vec(f"{p}.1.net.4.weight")),
            (f"t{L}.ff2.b", vec(f"{p}.1.net.4.bias")),
        ]
    out += [
        ("tnorm.w", vec("transformer.norm.weight")),
        ("tnorm.b", vec("transformer.norm.bias")),
        ("last.w", vec("last_ln.weight")),
        ("last.b", vec("last_ln.bias")),
        ("fc.w", vec("fc_1.weight")),
        ("fc.b", vec("fc_1.bias")),
    ]

    header, blobs, offset = [], [], 0
    for name, t in out:
        t = t.contiguous()
        if t.dim() >= 2 and name != "pos" and name != "elo":
            rows = t.reshape(t.shape[0], -1)
            scale = rows.abs().amax(dim=1).clamp(min=1e-12) / 127
            q = torch.round(rows / scale[:, None]).clamp(-127, 127).to(torch.int8)
            data = scale.numpy().astype("<f4").tobytes() + q.numpy().tobytes()
            kind = "q8"
        else:
            data = t.numpy().astype("<f4").tobytes()
            kind = "f32"
        header.append({"name": name, "shape": list(t.shape), "kind": kind, "offset": offset})
        blobs.append(data)
        offset += len(data)
        # Keep every tensor 4-byte aligned for Float32Array views.
        pad = (-offset) % 4
        blobs.append(b"\0" * pad)
        offset += pad
    head = json.dumps({"tensors": header, "eloBuckets": len(elo_dict)}).encode()
    with open(os.path.join(o.out, "maia2-rapid.bin"), "wb") as f:
        f.write(struct.pack("<I", len(head)))
        f.write(head)
        f.write(b"\0" * ((-(4 + len(head))) % 4))
        for b in blobs:
            f.write(b)
    with open(os.path.join(o.out, "moves.json"), "w") as f:
        json.dump(moves, f, separators=(",", ":"))
    print(f"maia2-rapid.bin: {offset / 1e6:.1f} MB, {len(out)} tensors, {len(moves)} moves")

    # Maia-2's own predictions, for the app's tests.
    model = MAIA2Model(len(moves), elo_dict, Cfg)
    model.load_state_dict(sd, strict=False)
    model.eval()
    from maia2.utils import board_to_tensor, map_to_category, mirror_move

    cases = []
    for fen, self_elo, oppo_elo in [
        (chess.STARTING_FEN, 800, 800),
        (chess.STARTING_FEN, 1900, 1900),
        ("rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RN1QKBNR b KQkq - 1 2", 800, 800),
        ("r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", 1500, 1500),
        ("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", 2100, 1500),
    ]:
        board = chess.Board(fen)
        flip = board.turn == chess.BLACK
        b = board.mirror() if flip else board
        x = board_to_tensor(b).unsqueeze(0)
        es = torch.tensor([map_to_category(self_elo, elo_dict)])
        eo = torch.tensor([map_to_category(oppo_elo, elo_dict)])
        with torch.no_grad():
            logits = model(x, es, eo)[0][0]
        legal = {}
        for m in board.legal_moves:
            u = mirror_move(m.uci()) if flip else m.uci()
            if u in moves:
                legal[m.uci()] = float(logits[moves.index(u)])
        top = sorted(legal.items(), key=lambda kv: -kv[1])[:5]
        cases.append({"fen": fen, "self": self_elo, "oppo": oppo_elo, "top": top})
    with open(o.reference, "w") as f:
        json.dump(cases, f, indent=1)
    for c in cases:
        print(c["fen"].split(" ")[0][:20], c["self"], [m for m, _ in c["top"][:3]])


if __name__ == "__main__":
    main()
