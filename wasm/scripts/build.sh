#!/usr/bin/env bash
# Build hledger-bindings, generate its JSFFI glue, and shrink the module.
#
#   build.sh   -> out/hledger-bindings.wasm, out/hledger-bindings.jsffi.mjs
set -euo pipefail

WASM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WASM_DIR"
# shellcheck disable=SC1091
. "$HOME/.ghc-wasm/env"

TARGET=hledger-bindings
POST_LINK="$HOME/.ghc-wasm/wasm32-wasi-ghc/lib/post-link.mjs"
STRIP="$HOME/.ghc-wasm/wasi-sdk/bin/llvm-strip"

mkdir -p out
wasm32-wasi-cabal build "$TARGET"
linked="$(wasm32-wasi-cabal list-bin "$TARGET")"

# The glue is generated from the unstripped module; it is a separate JS file,
# so shrinking the wasm afterwards cannot invalidate it.
node "$POST_LINK" -i "$linked" -o "out/$TARGET.jsffi.mjs"
"$STRIP" --strip-all -o "out/$TARGET.stripped.wasm" "$linked"
wasm-opt -Oz --strip-debug --strip-dwarf --strip-producers "out/$TARGET.stripped.wasm" -o "out/$TARGET.wasm"
rm "out/$TARGET.stripped.wasm"
ls -l "out/$TARGET.wasm" "out/$TARGET.jsffi.mjs"
node "$(dirname "$0")/collect-licenses.mjs"
