# Maia

The networks in this folder are Maia 1100 to 1900 by the Computational Social
Science Lab at the University of Toronto (McIlroy-Young, Sen, Kleinberg and
Anderson, "Aligning Superhuman AI with Human Behavior: Chess as a Model
System", KDD 2020), from https://github.com/CSSLab/maia-chess, release v1.0.
License: GPL-3.0.

They were converted with `scripts/convert-maia.py`: the value head is dropped,
batch norm is folded into the convolutions, and the weights are stored as
half floats. `tables.json` holds the policy move list and map of Leela Chess
Zero (https://github.com/LeelaChessZero/lc0, `src/neural/tables/policy_map.h`,
and lczero-training `tf/policy_index.py`), GPL-3.0.
