# hledger-bindings

hledger-lib compiled to wasm32-wasi as a reactor module with two exports:

- `hledgerLoad(path)` — read a journal from the WASI filesystem, with hledger's
  strict checks, and keep it.
- `hledgerQuery(json)` — answer a report about the journal kept: `entries`,
  `heads` (entries' dates and tags alone), `balance` and `incomestatement` (each optionally with
  `valuation: { at: "posting-date" | "period-end", commodity }`, with
  `pivot`, a tag whose values stand in place of accounts as `--pivot` puts
  them, with `interval: "daily" | "monthly" | "yearly"`, a column a
  period, and with `accumulation: "historical"`, each column the balance at
  its end as `--historical` gives it, and with `totalsOnly`, the totals row
  alone), `revaluation`, `prices`, `accounts`. A report valued at each
  posting's day is answered from the journal valued so once and kept.
  Answers are hledger's JSON with only what the app reads of a transaction,
  a posting and an amount.

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
