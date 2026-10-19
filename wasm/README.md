# hledger-bindings

hledger-lib compiled to wasm32-wasi as a reactor module with three exports:

- `hledgerLoad(path, key)` — read a journal from the WASI filesystem, with
  hledger's strict checks, and keep it under `key` (a digest of its files),
  beside those read lately, up to 15,000 transactions between them.
- `hledgerSelect(key)` — ask of the journal kept under `key` again, with no
  parse; no journal where none is.
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
never edited by hand: anything wasm32 needs is a constraint in `cabal.project`
or a shim under `shims/`.

## Patches to hledger: a last resort

A patch to hledger itself is the last resort, taken only when nothing in the
bindings, the queries or the journal's own shape can get what is needed, and
only when what it gains is large and measured. Every patch is a fork of
hledger to be carried through each upgrade, and a source of figures that
differ from the hledger a person runs on the same book; so before writing one,
the way through `Bindings.hs`, a request, or the shape of what the app writes
is tried first and shown not to work.

A patch that is taken:

- is a file under `patches/`, never an edit left in the clone; `setup.sh`
  applies each one to `vendor/hledger` once, so a fresh clone builds the same
  binary;
- changes how fast hledger is or what wasm32 needs, never what it answers: a
  book gives the same figures with and without it, and native
  `hledger check --strict` on the same book still agrees with the app;
- is written to be offered upstream, in hledger's own style, and is dropped
  when hledger takes it or the version moved to no longer needs it;
- is listed below, with why it exists, what it was measured to gain, how it
  was checked, and when it can go;
- is part of the Corresponding Source of the shipped `hledger.wasm` (GPL), so
  it stays in this repository for as long as a build carries it.

On moving to another hledger version (`HLEDGER_TAG` in `setup.sh`), each patch
is applied again or found to be no longer needed; one that no longer applies is
rewritten against the new version or dropped, never forced.

### `fast-path-quoted-commodities.patch`

- **Why.** hledger 1.99.5's journal parser has a fast path
  (`fasttransactionp`, `fastmarketpricedirectivep` in
  `hledger-lib/Hledger/Read/JournalReader.hs`) that scans the commonest shapes
  of entry directly and declines anything else to the general parser. It
  declined every quoted commodity symbol, and every token commodity a book
  holds is quoted (`"玉(4円・店)"`, `"枚(20円・店)"`: digits and brackets
  are not allowed unquoted). So the fast path took none of a book's entries
  or prices (`--debug=1`: "fast path was used for 0% … declined: quoted
  commodity symbol"). Renaming the commodities would have been a change to
  every book already written, for the same gain.
- **What.** `scanCommoditySymbol` reads a symbol as `commoditysymbolp` does,
  quoted (as `quotedcommoditysymbolp`) or simple (as
  `simplecommoditysymbolp`), and `scanSimpleAmount` and `scanSimplePrice` use
  it where they declined a quote. An unterminated quote still declines, so
  the general parser reports it as before.
- **Gain.** Opening 10,000 entries in the app's wasm: 4.7s without the fast
  path (as before the patch), 2.6s with it — the same as the same journal
  with its commodities unquoted. Every book, personal or consolidated, is
  read through it, so it speeds every open and every trial of a write.
- **Checked.** `HLEDGER_FASTPATH=check` (an environment variable of the WASI
  instance) parses each fast-path entry with the general parser too and fails
  on any difference: none on the 10,000 entries, nor on `tests/hledger`.
- **When it goes.** When upstream hledger's fast path takes quoted symbols.
