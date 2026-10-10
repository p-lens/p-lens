#!/usr/bin/env bash
# Build the pachinko engine for the browser.
#
#   scripts/build-pachinko.sh   -> packages/pachinko-engine/pachinko.js, pachinko_bg.wasm
#
# Needs the Rust toolchain with the wasm32-unknown-unknown target, and
# wasm-bindgen-cli at the version pachinko-wasm pins. The output is committed,
# so building the apps never needs Rust; it lands in the same commit as the
# crates it was built from. The web app's worker and the API both import it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"

OUT="packages/pachinko-engine"
PINNED="$(grep -E '^wasm-bindgen = ' crates/pachinko-wasm/Cargo.toml | sed -E 's/.*"=([0-9.]+)".*/\1/')"
INSTALLED="$(wasm-bindgen --version | awk '{print $2}')"
if [ "$PINNED" != "$INSTALLED" ]; then
  echo "wasm-bindgen-cli is $INSTALLED; pachinko-wasm pins $PINNED: cargo install wasm-bindgen-cli --version $PINNED" >&2
  exit 1
fi

# Panic locations carry source paths into the binary: name them from the
# registry and the repository, never from the machine that built them.
CARGO_DIR="${CARGO_HOME:-$HOME/.cargo}"
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$CARGO_DIR=/cargo --remap-path-prefix=$ROOT=."
cargo build --release --target wasm32-unknown-unknown -p pachinko-wasm
wasm-bindgen --target web --no-typescript --out-dir "$OUT" --out-name pachinko \
  target/wasm32-unknown-unknown/release/pachinko_wasm.wasm
ls -l "$OUT"
node scripts/collect-crate-licenses.mjs
