"""Converts Maia's lc0 weight files into the compact form the app reads.

Maia (CSSLab, GPL-3.0, https://github.com/CSSLab/maia-chess) predicts the
move a human player of a given rating would make. Its networks are lc0
networks: 112 input planes, residual blocks with squeeze-excitation, and a
convolutional policy head. Only the policy is needed, so the value head is
dropped, batch norm is folded into the convolutions, and the weights are
stored as half floats.

  python3 scripts/convert-maia.py maia-1100.pb.gz ... --out public/maia
  python3 scripts/convert-maia.py --tables policy_index.py policy_map.h --out public/maia

Each output file is a 4-byte header length, a JSON header and the weights in
this order, each convolution as [out][in][3][3] then its bias: the input
convolution; per block conv1, conv2, then the SE layers w1 [hidden][C], b1,
w2 [2C][hidden], b2; the policy1 convolution; the policy convolution.
The tables file lists lc0's 1858 policy moves and, for each of the 73x64
policy outputs, the move it stands for or -1.
"""

import argparse
import gzip
import json
import math
import os
import re
import struct

EPS = 1e-5


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def fields(b):
    i = 0
    while i < len(b):
        k, i = varint(b, i)
        f, t = k >> 3, k & 7
        if t == 0:
            v, i = varint(b, i)
        elif t == 1:
            v = b[i : i + 8]
            i += 8
        elif t == 5:
            v = b[i : i + 4]
            i += 4
        elif t == 2:
            n, i = varint(b, i)
            v = b[i : i + n]
            i += n
        else:
            raise ValueError(f"wire type {t}")
        yield f, v


def message(b):
    out = {}
    for f, v in fields(b):
        out.setdefault(f, []).append(v)
    return out


def layer(b):
    """A LINEAR16 layer: 16-bit steps between its min and max."""
    m = message(b)
    lo = struct.unpack("<f", m[1][0])[0]
    hi = struct.unpack("<f", m[2][0])[0]
    raw = m[3][0]
    q = struct.unpack(f"<{len(raw) // 2}H", raw)
    return [lo + (hi - lo) * x / 65535 for x in q]


def conv(b, outputs):
    """A convolution with batch norm folded in: weights and bias."""
    m = message(b)
    w = layer(m[1][0])
    n = len(w) // outputs
    bias = layer(m[2][0]) if 2 in m else [0.0] * outputs
    if 3 not in m:
        return w, bias
    mean = layer(m[3][0])
    var = layer(m[4][0])
    gamma = layer(m[5][0]) if 5 in m else [1.0] * outputs
    beta = layer(m[6][0]) if 6 in m else [0.0] * outputs
    out_w, out_b = [], []
    for o in range(outputs):
        s = gamma[o] / math.sqrt(var[o] + EPS)
        out_w.extend(x * s for x in w[o * n : (o + 1) * n])
        out_b.append((bias[o] - mean[o]) * s + beta[o])
    return out_w, out_b


def convert(path, out_dir):
    net = message(gzip.decompress(open(path, "rb").read()))
    fmt = message(message(net[4][0])[2][0])
    # Classical 112-plane input, SE network, convolutional policy.
    if fmt[1][0] != 1 or fmt[4][0] != 2:
        raise ValueError(f"{path}: not a classical-input, convolutional-policy network")
    weights = message(net[10][0])
    filters = len(layer(message(weights[1][0])[3][0]))
    values = []
    w, b = conv(weights[1][0], filters)
    values += w + b
    blocks = weights[2]
    hidden = 0
    for block in blocks:
        r = message(block)
        for c in (r[1][0], r[2][0]):
            w, b = conv(c, filters)
            values += w + b
        se = message(r[3][0])
        b1 = layer(se[2][0])
        hidden = len(b1)
        values += layer(se[1][0]) + b1 + layer(se[3][0]) + layer(se[4][0])
    w, b = conv(weights[11][0], filters)
    values += w + b
    planes = len(layer(message(weights[3][0])[2][0]))
    w, b = conv(weights[3][0], planes)
    values += w + b
    header = json.dumps(
        {"filters": filters, "blocks": len(blocks), "seHidden": hidden, "policyPlanes": planes}
    ).encode()
    name = os.path.basename(path).replace(".pb.gz", ".bin")
    with open(os.path.join(out_dir, name), "wb") as f:
        f.write(struct.pack("<I", len(header)))
        f.write(header)
        f.write(struct.pack(f"<{len(values)}e", *values))
    print(f"{name}: {len(values)} weights, {len(blocks)} blocks of {filters}")


def tables(index_py, map_h, out_dir):
    moves = re.findall(r'"([a-h][1-8][a-h][1-8][qrb]?)"', open(index_py).read())
    h = open(map_h).read()
    body = h[h.index("{", h.index("kConvPolicyMap")) :]
    mapping = [int(x) for x in re.findall(r"-?\d+", body[: body.index("}")])]
    assert len(moves) == 1858 and len(mapping) == 73 * 64
    with open(os.path.join(out_dir, "tables.json"), "w") as f:
        json.dump({"moves": moves, "map": mapping}, f, separators=(",", ":"))
    print("tables.json: 1858 moves, 4672 policy outputs")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("nets", nargs="*")
    a.add_argument("--tables", nargs=2, metavar=("POLICY_INDEX_PY", "POLICY_MAP_H"))
    a.add_argument("--out", required=True)
    o = a.parse_args()
    os.makedirs(o.out, exist_ok=True)
    if o.tables:
        tables(*o.tables, o.out)
    for n in o.nets:
        convert(n, o.out)


if __name__ == "__main__":
    main()
