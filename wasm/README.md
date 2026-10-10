# hledger-bindings

hledger-lib compiled to wasm32-wasi as a reactor module with two exports:

- `hledgerLoad(path)` — read a journal from the WASI filesystem, with hledger's
  strict checks, and keep it.
- `hledgerQuery(json)` — answer a report about the journal kept: `entries`,
  `balance` and `incomestatement` (each optionally with
  `valuation: { at: "posting-date" | "period-end", commodity }`, with
  `pivot`, a tag whose values stand in place of accounts as `--pivot` puts
  them, and with `interval: "daily" | "monthly" | "yearly"`, a column a
  period), `prices`, `accounts`.

Derived from choai's bindings. `src/Bindings.hs` and
`apps/web/src/hledger/protocol/wire.ts` describe the same format and change
together.

```sh
./scripts/setup.sh    # ghc-wasm toolchain into ~/.ghc-wasm, hledger sources into vendor/
./scripts/build.sh    # -> out/hledger-bindings.wasm, out/hledger-bindings.jsffi.mjs
bun --cwd=../apps/web run sync-hledger
```

`vendor/`, `dist-newstyle/` and `out/` are not tracked. hledger's sources are
never edited: anything wasm32 needs is a constraint in `cabal.project` or a
shim under `shims/`.
