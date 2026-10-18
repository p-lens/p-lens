#!/usr/bin/env bash
# Install the GHC WebAssembly toolchain and fetch the hledger sources.
# Idempotent: re-running skips anything that is already in place.
set -euo pipefail

WASM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.ghc-wasm}"
HLEDGER_TAG="${HLEDGER_TAG:-1.99.5}"
VENDOR="$WASM_DIR/vendor/hledger"

# ghc-wasm-meta's bootstrap starts with `rm -rf $PREFIX`, so it only runs when
# the toolchain is not already usable.
if [ -x "$PREFIX/wasm32-wasi-ghc/bin/wasm32-wasi-ghc" ]; then
  echo "toolchain: already present at $PREFIX"
else
  echo "toolchain: bootstrapping into $PREFIX (multi-GB download)"
  curl -f -L --retry 5 \
    https://gitlab.haskell.org/haskell-wasm/ghc-wasm-meta/-/raw/master/bootstrap.sh \
    | PREFIX="$PREFIX" sh
fi

if [ -d "$VENDOR/.git" ]; then
  echo "vendor: hledger already cloned at $VENDOR"
else
  echo "vendor: cloning hledger $HLEDGER_TAG"
  mkdir -p "$(dirname "$VENDOR")"
  git clone --depth 1 --branch "$HLEDGER_TAG" https://github.com/simonmichael/hledger.git "$VENDOR"
fi
echo "vendor: hledger at $(git -C "$VENDOR" describe --tags --always)"
