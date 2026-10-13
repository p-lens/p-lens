# P-Lens (Pレンズ)

> **日本語版が原本です。** [README.ja.md](README.ja.md) is the original; this English text is a translation, and where the two differ the Japanese holds.

A local-first PWA that keeps pachinko and pachislot results, the balls and
medals saved at each parlor, exchange rates and theoretical values (期待値) as
**one hledger book**.

- The book of record is the journal files on your device. If P-Lens
  disappears, `hledger -f main.journal` still reads them as they are.
- The accounting is done by hledger, compiled to WebAssembly and run in the
  browser.
- The book is never sent to a server. It works offline.
- The theoretical value and the break-even line (ボーダー) come from each
  machine's formula (算出条件). A formula is typed in by hand, or made on the
  device by an exact calculation in Rust/WebAssembly from the machine's spec.
- A formula's grounds (計算根拠) are built on the device as a proof tree by
  Trealla Prolog (WebAssembly) from rules, and shown checked against the
  engine's answer.
- Machines, formulas and setting-level distributions are delivered to the
  device from a catalog everyone shares (`apps/api`).

The design is in [ARCHITECTURE.md](ARCHITECTURE.md).

## The accounting model

A book is kept by double entry in hledger, in an account tree that is small on purpose.

```text
資産:現金                      cash
資産:貯玉:<parlor>:<rate>      balls saved at a parlor at a rate (e.g. 資産:貯玉:ホシゾラ梅田店:4円)
資産:貯メダル:<parlor>:<rate>  medals saved at a parlor at a rate
収益:遊技                      revenue of play
費用:遊技                      expenses of play
費用:貸玉差額                  the rental spread on balls
費用:貸メダル差額              the rental spread on medals
費用:再プレイ手数料            replay fees
純資産:開始残高                savings a person already had when the book began
純資産:残高調整                a count of savings put right to what the parlor says
純資産:特殊景品                what the special prizes of a prize exchange are worth
純資産:端玉景品                the general prizes the rest of a prize exchange was given as, in whole yen
純資産:換算調整勘定            the part of a yen a prize exchange leaves over
統計:期待値                    the theoretical value (virtual postings only)
```

Three things make the model what it is.

- **Equity is the terminal account.** The booking ends with the prize
  exchange: the prizes received are entered not as assets but in
  `純資産:特殊景品` (special prizes) and `純資産:端玉景品` (odd prizes), and the
  part of a yen left when balls or medals are restated in yen in
  `純資産:換算調整勘定` (the translation adjustment). The keeping, consumption,
  transfer or any other transaction of a prize after it is received is not
  booked.
- **Cash never rises.** No entry the app writes puts a positive amount to
  `資産:現金`. A loss is recorded as cash spent, and a gain as prizes taken
  home, in equity. There is no entry that turns special prizes into cash.
- **Balls and medals are a parlor's own currency.** Savings are held in a
  unit of their own for each parlor and rate (an hledger commodity), and are
  valued in yen by the day's exchange rate (`P`).

On a day when 4,800 saved balls at an exchange rate of 3.5 yen are exchanged
for special prizes worth 16,500 yen and odd prizes, for example, the entry is
this. Cash does not move.

```journal
2026-10-04 景品交換 ホシゾラ梅田店  ; parlor-id: hoshizora-umeda, savings: prize-exchange
    資産:貯玉:ホシゾラ梅田店:4円        -4800 "玉(4円・ホシゾラ梅田店)" @ 3.5 JPY
    純資産:特殊景品                     16500 JPY
    純資産:端玉景品                     300 JPY
```

The balls and medals were already counted in the revenue and expenses of the
day they were played for, so a prize exchange appears in no day's result.

Entering prizes in equity is a treatment of management accounting particular
to P-Lens, and does not replace general financial accounting or the treatment
of anything for tax. The formal provisions are in [docs/](docs/README.md);
the Japanese text is the original.

- [P-Lens Accounting Standards (PLAS)](docs/en/accounting-policy.md)
- [Appendix A — Official Interpretations](docs/en/accounting-faq.md)
- [Appendix B — An Important Declaration on the Accounting](docs/en/accounting-declaration.md)

## Running it locally

```sh
bun install
bun run dev      # http://localhost:8136
bun run test
```

That alone runs it as a book-keeping app. It needs neither the shared catalog
nor the parlor list; without them machines are simply not registered or
delivered.

To run the shared catalog locally as well:

```sh
bun --cwd=apps/api run migrate:local   # create the tables in wrangler's local D1
bun --cwd=apps/api run dev             # http://localhost:8787
```

Copy `apps/web/.env.example` to `apps/web/.env.local`, set
`VITE_CATALOG_URL=http://localhost:8787`, and run `bun run dev` again.

To try syncing between devices, run the relay too.

```sh
bun --cwd=apps/relay run migrate:local # create the tables in wrangler's local D1
bun --cwd=apps/relay run dev           # http://localhost:8788
```

Add `VITE_RELAY_URL=http://localhost:8788` to `.env.local`. The relay only
keeps sealed changes in order; it cannot read a book.

To try backing up to Google Drive, make an OAuth 2.0 client in Google Cloud
(type "Web application", with `http://localhost:8136` among its authorised
JavaScript origins), enable the Google Drive API in the same project, and add
`VITE_GOOGLE_CLIENT_ID=<the client id>` to `.env.local`. The app asks only for
the `drive.file` scope: the files it made itself. Without it, a book is still
backed up to a file.

## Hosting your own

You can run your own catalog and app, apart from the official app.p-lens.jp.
URLs and account values stay out of the repository, in files git ignores.

### 1. The shared catalog (Cloudflare Workers + D1)

The API sits under `/api` on the app's own origin (for example
`https://app.example.com/api/*`). It has no address of its own, so there is no
address to go looking for. `workers_dev` is off too, so no `*.workers.dev`
address comes into being.

```sh
cd apps/api
bunx wrangler login
bunx wrangler d1 create p-lens                                   # prints the database_id
cp wrangler.production.example.jsonc wrangler.production.jsonc   # not committed
```

Fill in the `<…>` in `wrangler.production.jsonc`.

| Item | Value |
|---|---|
| `routes` | `/api/*` on the app's host, and its zone (the domain managed in Cloudflare) |
| `database_id` | the id `wrangler d1 create` printed |
| `vars.ALLOWED_ORIGINS` | the origin of the page the app is served from (for example `https://app.example.com`); comma-separated if several |
| `vars.API_BASE_PATH` | the prefix of `routes`; leave it `/api` |
| `ratelimits` | the per-address limits per minute on writes and on new registrations; each `namespace_id` is a number unique within the account |

Secrets go into wrangler's secrets, not into the configuration file.

```sh
bunx wrangler secret put ADMIN_TOKEN --config wrangler.production.jsonc        # a long random value for administration
bunx wrangler secret put TURNSTILE_SECRET --config wrangler.production.jsonc   # the Turnstile secret key
```

Create the Turnstile widget in the Cloudflare dashboard and register the
app's host as its hostname. The site key goes to the app
(`VITE_TURNSTILE_SITE_KEY`), the secret key into the secret above.

```sh
bun run migrate:remote   # create the tables in the production D1
bun run deploy
```

Reads and writes are taken only from the pages named in `ALLOWED_ORIGINS`.
A copy of the app served from anywhere else, and a request that does not say
which page it comes from, are refused with 403. Left empty, anyone can use
it, so always set it when you publish.

### 2. The sync relay (Cloudflare Workers + D1)

The relay carries a book between one person's devices as sealed changes it
cannot read. It has a host of its own (for example
`https://relay.example.com`), and that address is written into every book
synced through it: once books are synced, it is not an address to change.
A pairing code is the book's secret alone and names no relay, so the devices
that share a book must run builds naming the same one.

```sh
cd apps/relay
bunx wrangler d1 create p-lens-relay                             # prints the database_id
cp wrangler.production.example.jsonc wrangler.production.jsonc   # not committed
```

Fill in the `<…>` in `wrangler.production.jsonc`.

| Item | Value |
|---|---|
| `routes` | the relay's own host, as a custom domain in a zone the account holds |
| `database_id` | the id `wrangler d1 create` printed |
| `vars.ALLOWED_ORIGINS` | the origin of the page the app is served from; comma-separated if several |
| `ratelimits` | the per-address limits per minute on readings, sendings and large sendings; each `namespace_id` is a number unique within the account |

```sh
bun run migrate:remote   # create the tables in the production D1
bun run deploy
```

A line is opened only by the token its devices work out from their shared
secret, and its commits only by their key, neither of which the relay ever
sees. What one address may ask is held to a limit per minute: readings,
sendings, and — more tightly — sendings with a body over 32 kB, which only
a book's first commits are. A commit is taken up to 2 MB and a request up
to 4 MB. The limits slow one address down; they do not stop someone with
many, and nothing caps what a line may come to hold. Cloudflare counts
them close to where a request lands and brings the counts together
afterwards, so a limit is roughly kept: requests spread over many
connections get somewhat more through than the figure says.

### 3. The app (a static site)

Copy `apps/web/.env.example` to `apps/web/.env.production.local`, fill in the
values, and build.

| Variable | Value |
|---|---|
| `VITE_CATALOG_URL` | `/api` (when the API of step 1 is on the same origin) |
| `VITE_PARLORS_URL` | where the parlor list (JSONL) is published, ending in `/`; empty if there is none |
| `VITE_SURVEY_URL` | where a parlor is submitted; empty if there is none |
| `VITE_TURNSTILE_SITE_KEY` | the Turnstile site key |
| `VITE_RELAY_URL` | the address of the sync relay of step 2, with no slash at its end; empty if there is none, and then no book is synced or joined |
| `VITE_GOOGLE_CLIENT_ID` | the OAuth client id for backing up to Google Drive; empty if there is none (a book can still be backed up to a file) |

```sh
bun run build    # put apps/web/dist on static hosting (Cloudflare Pages and the like)
```

The host the app is served from must be the one written in `routes` and
`ALLOWED_ORIGINS` in step 1, and in `ALLOWED_ORIGINS` in step 2.

### Guarding against abuse

- **Writes are restricted**: taken only from the pages in `ALLOWED_ORIGINS`.
- **Turnstile**: registering a new machine, formula, setting-level
  distribution or tag needs a Turnstile token issued on the app's host. This
  stops mass registration from scripts and from other sites.
- **Rate limits**: writes and new registrations from one address are held to
  a limit per minute.
- **Quotas on registering**: a machine takes hours to look up and check, so
  a device may register one every twenty minutes and six in a day, and an
  address twelve in a day; an addition to a machine there already — a formula
  or a 設定配分 — one every five minutes, twelve and twenty-four in a day; a
  tag, twenty and forty in a day. The app says where the device stands before
  anything is typed, and what could not be sent is kept on the device to be
  sent again. Run `migrate:remote` before deploying: the count is kept in D1.
- **Nothing can be tampered with**: nobody can rewrite or delete what has
  been registered. A correction is made as a new entry.
- **Hidden by an administrator**: an administrator hides what was vandalised.
  It is not deleted, so it can always be brought back. A hidden machine is
  delivered to nobody and its name is freed, so the real one can be
  registered again.

The administration API can be used from anywhere, only by someone holding
`ADMIN_TOKEN` (without the token it answers 404).

```sh
API=https://app.example.com/api
AUTH="Authorization: Bearer $ADMIN_TOKEN"

curl -H "$AUTH" "$API/admin/recent?limit=50"                       # recent registrations, with device ids
curl -X PUT -H "$AUTH" -d '{"reason":"nonsense"}' "$API/admin/machine/<id>/hidden"   # hide one (formula / distribution likewise)
curl -X DELETE -H "$AUTH" "$API/admin/machine/<id>/hidden"         # show it again
curl -X PUT -H "$AUTH" -d '{"reason":"vandalism"}' "$API/admin/devices/<device id>/hidden"  # hide everything that device registered

# set right how a machine is described: its name, and — each left out is taken away — its model name, the words it is searched by, its 大当り確率
curl -X PUT -H "$AUTH" -d '{"name":"e星都幻鬼","modelName":"e星都幻鬼W","keywords":["ゲンキ"],"hitChance":"1/399.9"}' "$API/admin/machines/<id>/description"
```

### What it can and cannot do

- A browser always says which page a request was sent from, in `Origin` (or
  `Sec-Fetch-Site` on the same origin). The page cannot fake it, so an app
  served from another site can neither read nor write.
- Anything other than a browser (curl, a script on a server) can fake the
  headers, so the origin restriction alone does not stop it. Turnstile covers
  new registrations, and the rate limits cover repeated ratings.
- A device id can be made anew, so one person posing as many devices to
  inflate ratings can be slowed by the rate limits but not fully prevented.
- The catalog is delivered whole to users' devices. It is not a way to keep
  its contents secret.

## The play log's format

A play followed at the cabinet has its readings written into the book when it
is recorded: `pachinko-play/<play-id>.jsonl` for pachinko and
`pachislot-play/<play-id>.jsonl` for pachislot, one JSON object a line (JSON
Lines). No journal includes them, so hledger passes them by.

**Schema version: 1**

The schema version is the version of the play log's whole format, the header
line and the readings together. It is written in the header's `v`, and
goes up when a change would make a reader of the version
before misread the file. What follows describes version 1.

### The first line: the header

The first line alone is not a reading. It is the header, saying what the play
was. Only it has `"header": true`, so set it aside when reading the file as
columns.

```json
{"header":true,"about":"P-Lens play log. …","v":1,"playId":"…","gameKind":"pachinko","date":"2026-10-10","startedAt":"2026-10-10T03:12:00.000Z","parlor":{"name":"…","id":"…"},"terms":{"rental":{"yen":1000,"tokens":250},"exchange":{"yen":1000,"tokens":280},"replay":{"paidOut":125,"deducted":133}},"machine":"…","cabinetNumber":"123","formulaId":"…"}
```

| Field | What it is |
|---|---|
| `header` | Always `true`: the mark of the header line |
| `about` | A sentence saying this line is the header |
| `v` | The play log's schema version, `1` for now |
| `playId` | The play's id, the same as its entry's `play-id` tag |
| `gameKind` | `pachinko` or `slot` |
| `date` | The play's business day (`YYYY-MM-DD`) |
| `startedAt` | When the play began (ISO 8601) |
| `parlor` | The parlor: its `name`, and its `id` on the parlor list or the `submission` it waits on. Absent from a play at no parlor |
| `terms` | The corner's terms: `rental` and `exchange` each as `tokens` balls or medals for `yen` yen, and `replay` as what a replay pays out (`paidOut`) and takes off the savings (`deducted`). Absent from a play with none |
| `machine` | The machine's name |
| `cabinetNumber` | The cabinet number; the field is absent where there is none |
| `formulaId` | The id of the formula the theoretical value was worked out by; absent where none was used |
| `prior` | Pachislot only: the setting-level distribution, `{"type":"even"}`, `{"type":"distribution","id":"…"}` for one of the catalog's, or `{"type":"stock","key":"…"}` for one of the app's own |

A book keeps only the name of a savings account (`4円` and the like) and the
day's exchange rate, so the header is the one place the rental, the exchange
and the replay are kept together.

### The lines after it: readings

Every line is a **running total** since the play began. They are not
differences, so a line remembered afterwards is added without touching any
other. Order comes from `spins`, not from where a line sits. Everything but
`spins` is written only where it is known.

| Field | What it is |
|---|---|
| `spins` | Spins since the play began (games, for pachislot). Required |
| `outlay` | Yen spent since the play began |
| `at` | When the line was written (ISO 8601) |
| `counter` | The data counter as read: `spins` (since the last jackpot), `jackpots` (the day's), `total` (the day's games), `bonuses` (each bonus's count), and `sinceCz`, `misses`, `held` on an AT machine |
| `event` | What happened at that point: `{"kind":"jackpot"}` (`approximate` for one noticed afterwards, `bonus` with the `name`, `payout` and `spent` of the bonus won), `{"kind":"cz-missed"}`, `{"kind":"at-ended"}` (`completed`, `sets`, `medals`), `{"kind":"ended"}` (the end of the play, its last line) |
| `tally` | Pachislot only: running totals of the small wins and bonuses counted, by their id in the formula |
| `afterReset` | Pachislot only: `true` on the first line of a cabinet whose settings were changed |
| `phase` | Pachinko only: whether the spins since the line before were `regular`, `special` (確変) or `rapid` (時短). Absent, they were regular |
| `replay` | Tokens drawn from the parlor's savings since the play began |
| `support` | Pachinko only: the running gain or loss of the balls in hand on the 電サポ, below zero where they lost |
| `held` | The balls or medals in hand at that point, where they were counted |

A play still being played is on the device alone: nothing of it is written in
a book until it is recorded. Recording it again writes the header and the
readings anew.

## The calculation engines

Rebuilding them needs Rust (the wasm32 target and wasm-bindgen-cli). The built
engines are committed in `packages/pachinko-engine` and `packages/pachislot-engine`, so
building the app alone does not need it.

## License

GPL-3.0-or-later. `packages/solid-gathering-shell` is MIT.

What is in `apps/web/src/branding/` — the names "P-Lens" and "Pレンズ", the
logo and icons, the text of the terms of use and the privacy policy, and the
address the deployment is served at — is not the software. It belongs to the
operator of app.p-lens.jp and is not covered by the GPL. To serve a fork,
replace what is in that folder with your own. See
[`apps/web/src/branding/LICENSE`](apps/web/src/branding/LICENSE).
