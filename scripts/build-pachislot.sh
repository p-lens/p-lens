#!/usr/bin/env bash
# Build the pachislot engine for the browser.
#   scripts/build-pachislot.sh   -> packages/pachislot-engine/pachislot.js, pachislot_bg.wasm
# (needs wasm32-unknown-unknown + wasm-bindgen-cli at the pinned version; output committed)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
OUT="packages/pachislot-engine"
PINNED="$(grep -E '^wasm-bindgen = ' crates/pachislot-wasm/Cargo.toml | sed -E 's/.*"=([0-9.]+)".*/\1/')"
INSTALLED="$(wasm-bindgen --version | awk '{print $2}')"
if [ "$PINNED" != "$INSTALLED" ]; then
  echo "wasm-bindgen-cli is $INSTALLED; pachislot-wasm pins $PINNED: cargo install wasm-bindgen-cli --version $PINNED" >&2
  exit 1
fi
# Panic locations carry source paths into the binary: name them from the
# registry and the repository, never from the machine that built them.
CARGO_DIR="${CARGO_HOME:-$HOME/.cargo}"
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$CARGO_DIR=/cargo --remap-path-prefix=$ROOT=."
cargo build --release --target wasm32-unknown-unknown -p pachislot-wasm
wasm-bindgen --target web --no-typescript --out-dir "$OUT" --out-name pachislot \
  target/wasm32-unknown-unknown/release/pachislot_wasm.wasm
ls -l "$OUT"
node scripts/collect-crate-licenses.mjs pachislot-wasm pachislot
