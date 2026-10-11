# P-Lens architecture

P-Lens keeps a record of pachinko and pachislot play — cash, savings at each
parlor, exchange rates, theoretical value — as **one local-first hledger book**.
hledger, compiled to WebAssembly and run in a worker, is the accounting kernel.
P-Lens is the UI that puts hledger to work for this one purpose; it is not a
replacement for it.

## Invariants

These hold everywhere, and a change that breaks one is wrong whatever else it
fixes.

1. **The journal text is the only source of truth.** IndexedDB holds journal
   files; it is a container, never a second record. Nothing hledger can answer —
   a balance, a total, a count — is stored.
2. **A write is kept only if hledger reads it.** Every change is offered to
   hledger, with `--strict` checks, before it is stored. A refusal leaves the
   book exactly as it was.
3. **What hledger can express is not reimplemented.** Periods are query dates,
   valuation is `--value`, sums are balance reports. No figure a book comes
   to is worked out here.
4. **Each parlor's tokens at each rental rate are their own commodity.**
   `玉(4円・ホシゾラ梅田店)`, `玉(1円・ホシゾラ梅田店)` and `玉(4円・789松原店)`
   cannot be exchanged for each other, so they are different commodities,
   held as real assets.
5. **Exchange rates are only ever added.** A changed rate is a new `P` directive
   on a later day; past days keep the rate they had.
6. **A theoretical figure is never real.** The theoretical value (期待値) is
   an unbalanced virtual posting, `(統計:期待値)`, on an account with no
   type: hledger sums it when asked and leaves it out of every balanced
   report.
7. **Valuation at the posting date and at the period end are kept apart** —
   in the wire format (`posting-date` / `period-end`), in the domain
   (`Valuation`), and on screen (each figure says which it is).
8. **Views follow hledger queries, through the address, in one direction.**
   A control rewrites the URL's `q`; the view reads the URL and asks hledger.
   No view reads a signal a control set beside the address.
9. **Every change is a `JournalChange`**, so whatever keeps history can record
   it as one commit: who, when, why, and the lines it replaced in each file.
   The who, when and why are also a line of the book's own activity log,
   written by that same commit.
10. **There are no parent/child relations.** A book has members, each with a
    role: owner, editor, viewer. Editing someone's book is the editor role on it.
11. **Everything works offline.** The engine and the app shell are precached;
    no backend is needed to start, read or write.
12. **Expected failure is a value.** Anything that can fail returns
    `Result<T, E>` with a discriminated error. Only `ui/wording` turns an error
    into a sentence.
13. **Every address has a screen.** An unknown address is a 404; every list has
    words for being empty.

## The books

A book is four files, named in `core/journal/layout.ts`:

```text
main.journal          includes the other three by name, never by pattern
accounts.journal      commodity and account declarations; a parlor is declared here
prices.journal        P directives, only appended to
transactions.journal  one entry per play
pachinko-play/<play-id>.jsonl   a pachinko play's head line and checkpoints, written when a play followed live is recorded
pachislot-play/<play-id>.jsonl  a pachislot play's, the same
logs/activity.jsonl             what was done to the book: who, when, what, and the lines it changed, a line a change
logs/favorites.jsonl            the formulas and 設定配分 kept handy in the book, a line a press of the heart
logs/marks.jsonl                what the book's members marked in the shared catalog, a line a press
```

`logs/activity.jsonl` (`core/activity`) is the book saying what happened to
it, and the 操作履歴 screen is this file read newest first. A line is one
thing done, shaped so that nothing about it is fixed but what every line
has:

```json
{"v":1,"id":"…","at":"2026-10-08T14:22:13.186Z","by":"local","did":"play-recorded","play":{"id":"…","description":"…"},"theoretical":{"value":"38"},"changes":{"files":[{"path":"transactions.journal","created":false,"hunks":[{"at":44,"removed":[],"added":["2026-10-08 …"]}]}]}}
```

- `v` is the version of the line's own shape: what every line has, and how
  parts sit beside it. A new part or a new word is no new version; a line
  of another version is passed over, since its shape cannot be told.
- `id` points at the line, `at` and `by` say when and who, and `did` is
  what was done, as a word of its own. A word this version does not know
  is still read: something was done, and the screen says that much.
- Everything else is a **part** (`Parts`), there or not: `book`, `file`,
  `files`, `pool`, `parlors`, `play`, `theoretical`, `imported`,
  `changes`. A line is not one of a
  closed list of shapes; it carries the parts that apply. Whatever asks
  about a play looks for `play` and nothing else, whichever word the line
  has. A new part is added without touching the others, and a part a
  version does not know is passed over, its line read without it.

`BookSession` writes the line in the same commit as the change it tells of,
so neither is ever without the other; a book written before it kept a log
is given one on its next write, holding first what its history on that
device says was done until then, each line under its commit's id. Only
ever added to, so what two devices each added comes together as entries
appended to a journal do; a line whose id was already read is read once,
and a line that does not read is passed over. No journal includes it.

The log is the book's events, and the book can be made again from them.
`changes` is what the change did to every file it touched but the log
itself, as a commit holds it (`FilePatch`: the lines taken away and the
lines put in, and where). The lines made in order from nothing leave the
book's journals and play logs as they stand, and the lines up to any one
leave them as they stood then — the same making a device does of the
commits it takes from a line (`received`). The history a device keeps says
the same, but stays on the device and its line; the log goes wherever the
book's files go, into a backup too. Two things keep it true:

- A commit made again on a line that had moved on (`rebased`) does
  something else to the files than it first did, so its line is told what
  it does now (`retold`) — the activity is made again last of a commit's
  files for that — and only that part of the line is written over.
- What the log does not tell of is not made again from it: the log
  itself, and `logs/favorites.jsonl`, whose own lines are its events.

A book whose log was begun before its lines held changes is made again
only from where they do.

A play's id is a UUIDv7 that says when it was played, so plays sort by their
ids alone, and their logs by file name: a play followed live takes the moment it
began, and a play added by hand afterwards is placed in the day it is said to
have been played on — at that day's midnight in UTC, nine in the morning in
Japan, about when a parlor opens — not at the moment it was typed in.

A play's day is its **business day** (営業日), which turns over at an hour of
the morning rather than at midnight (`businessDayOf`): a play started at two
is the day before's, and 今日 and 今月 on a breakdown count the same way.
The hour is five (`DEFAULT_BUSINESS_DAY_TURN`) until a person sets another,
from midnight to nine (`BUSINESS_DAY_TURNS`; 設定 → 日付の区切り) — no later
than nine, where a play added by hand is placed. It is kept on the device
(`preferences/`) and changes no play already recorded. Only the calendar's
own questions — whether a machine's release date can be — ask for the
calendar day.

The account tree is deliberately small:

```text
資産:現金
資産:貯玉:<parlor>:<rate>      tagged parlor-id, e.g. 資産:貯玉:ホシゾラ梅田店:4円
資産:貯メダル:<parlor>:<rate>  tagged parlor-id
収益:遊技
費用:遊技
費用:貸玉差額
費用:貸メダル差額
費用:再プレイ手数料
純資産:開始残高             savings a person already had when the book began
純資産:残高調整             a pool's count put right to what the parlor says
統計:期待値                 no type, virtual postings only
```

Savings are set in two ways, both against equity so that neither is any
play's result: an opening balance, one entry tagged `savings: opening` kept
at the head of `transactions.journal`, and an adjustment, tagged
`savings: adjustment` and dated the day the count was put right. A book made
before either existed has the two accounts declared when it first needs them.

Every book's `main.journal` opens with comments saying what the book is,
that P-Lens made it and where its source is, that hledger reads it, what each
file holds, and that this document describes the rest: whoever is handed the
files alone, a program included, is told where to look.

A book's names are not its own. A parlor is named as the parlor list names
it and a machine as the catalog does, wherever one is written — a play
started, a play added by hand, savings registered, a file edited by hand. An
edit that brings in a name the lists lack is refused (`core/names`); a name a
book already held is left alone.

A parlor is not stored anywhere beside the journal: it is the savings
accounts declared with its `parlor-id`, read back by `parlorsFromDeclarations`
as pools — a kind of token at a rental rate. Its id is the shared directory's.

### Parlors and the terms of a corner

P-Lens (Pレンズ) is several sites, each its own repository and Cloudflare
deployment; this repository is the app. Parlors come from the **parlor
list**, kept apart from the app:

```text
p-lens.jp           the landing page: news and the product, a site of its own
survey.p-lens.jp    takes a parlor not on the list, judges it, gives it a submission id,
                    and sends the person back to app.p-lens.jp with it
GitHub (ODbL)       OpenStreetMap's parlors and the submissions taken, as JSONL
parlors.p-lens.jp   publishes that JSONL as static files, with a map to browse parlors
app.p-lens.jp       this app: reads them, like every other device, and keeps a copy
```

The app reads `parlors.jsonl` and `rejections.jsonl` from `VITE_PARLORS_URL`
(`createJsonlDirectory`), one item a line:

```jsonl
parlors.jsonl     {"id", "name", "officialName"?, "reading", "keywords"?, "prefecture", "address", "lat", "lon", "submissions"?}
rejections.jsonl  {"submission", "reason"?}
```

A parlor goes by its `officialName` — the operator's own — wherever the list
gives one, and is still found by its `name`, kept as a search word.

A line that is not an item is passed over rather than refuse the rest. The
copy last read is kept in IndexedDB (`ParlorCache`) and read back when the
list cannot be reached within eight seconds, so a hall's network never leaves
the app waiting. A build that names no list has no parlors
(`createAbsentDirectory`): someone setting P-Lens up for themselves needs
nothing more for it to work. Everyone reads the same files, so which
submission a device waits on never leaves the device.

A play chooses a listed parlor, nearest first once the device says where it
is (`nearestFirst`; the position is used on the device and sent nowhere), by
prefecture and name until then, and searched by name, reading or search word
with widths, case, spaces and marks set aside (`parlorMatches`). A parlor
chosen stands by its name with 「変更」 to search for another; nothing is
chosen for the person, where they are only ordering the list. Left empty,
or when the list cannot be read, the play has no parlor and is recorded by
its result in yen; the start screen says so and carries on.

A parlor not listed is submitted at survey.p-lens.jp (`VITE_SURVEY_URL`),
which returns to `/parlors/submitted?submission=…&name=…&prefecture=…&game=…`.
The app reads that whole or not at all (`returnedFrom`), keeps the submission
on the device (`SubmissionStore`) and chooses it. The submission's id is the
one the survey files the report under and a maintainer writes in the listed
parlor's `submissions`. A return that names no submission — a closing or a
correction was reported — shows the start again as it was left. Played at, its pool is
declared by its submission, `parlor-submission: <id>`, and the plays carry the
same tag. When the list publishes a parlor naming that submission, the book is
linked in one commit (`linkSubmissions`): `parlor-id: <id>` is written beside
every `parlor-submission: <id>`, and the parlor reads as listed from then on.
A submission in `rejections.jsonl` is shown as turned down.

A book keeps a parlor's savings under its name, so one name is one parlor.
Names are compared widths, case, spaces and marks aside (`sameParlorName`):
the list holds no two placed parlors of one name, a book refuses a second
parlor under a name it keeps (`name-taken`), and a submission that comes
back under a name the list already has is not kept (`takeSubmission`) — the
screen names the listed parlor, to be chosen if it is the same one, or the
submission made again with its branch if it is another.

What a play costs and pays depends on the corner, not the parlor — 4 yen and
1 yen differ, and two 1-yen corners may too — so each play is started with
its corner's terms (`PlayTerms`), three pairs as the board states them:
rental (1000円 / 250玉), exchange (1000円 / 280玉) and replay (払出 250玉 for
貯玉減 275玉). The start screen types the rental and the exchange as the
tokens for ¥1,000 alone — the sum is fixed (`TERMS_YEN`), so 250 and 280
cannot be typed where yen go — and a replay's counts only where the corner
is said to take a fee, which few do; with none, a replay takes what it pays
out. From them:

- the **rate** the pool is named by: the rental rounded down and the exchange
  rounded up to an advertised rate (4・2・1・0.5・0.25・0.2 yen a ball,
  20・10・5・2・1・0.5 yen a medal), `レート不明` when they disagree;
- the **exchange rate**, the ratio itself to six places (3.571429), since that
  is what is paid; screens show it to two places, rounded half up;
- the tokens an outlay rents (rounded down) and the savings a replay takes
  (rounded up).

Starting a play at a parlor opens its pool in the book (`openPool`, one commit
when anything is new): the commodity and savings account if the book does not
keep that pool, and the day's exchange rate as a `P` directive if the book's
rate for the day differs.

### One play, one entry

```hledger
2026-09-05 ホシゾラ梅田店 流星 123番台  ; play-id: …, parlor-id: hoshizora-umeda, game-kind: pachinko, machine: 流星, cabinet-number: 123
    資産:現金                         -12000 JPY
    費用:貸玉差額                       1290 JPY
    資産:貯玉:ホシゾラ梅田店:4円        3000 "玉(4円・ホシゾラ梅田店)" @ 3.57 JPY
    資産:貯玉:ホシゾラ梅田店:4円       -3000 "玉(4円・ホシゾラ梅田店)"
    費用:遊技                           3000 "玉(4円・ホシゾラ梅田店)"
    資産:貯玉:ホシゾラ梅田店:4円        4800 "玉(4円・ホシゾラ梅田店)"
    収益:遊技                          -4800 "玉(4円・ホシゾラ梅田店)"
    (統計:期待値)                       5500 JPY
```

- **Rental** splits the cash at that day's rate into tokens and a rental
  spread, a loss settled that day and never revalued.
- **Shooting** moves tokens from savings to `費用:遊技`, in tokens only; what
  they come to in yen is hledger's to say at whichever date it is asked about.
  A replay takes more off savings than it pays out; the difference is written
  to `費用:再プレイ手数料`, also in tokens.
- **Payout** is the tokens left at the end, earned and put back into savings.
- **Theoretical value** (期待値) is the virtual posting, written only when
  given: what the play was worth by its formula, whatever it came to.

A play can also be added afterwards by its totals in yen alone (`TalliedPlay`,
`composeTalliedEntry`): its result between `資産:現金` and `収益:遊技` or
`費用:遊技`, so the income statement counts it like any play, and no savings
move. A parlor is named only if chosen; an even result writes no real posting.

```hledger
2026-10-04 e風の剣豪  ; play-id: …, game-kind: pachinko, machine: e風の剣豪
    費用:遊技                          12000 JPY
    資産:現金                         -12000 JPY
    (統計:期待値)                       8000 JPY
```

A whole play is one entry so that it is one `JournalChange` and one commit,
and so that the play log of the same play sits beside exactly one entry.

### Play logs

A JSONL file per play, each line a `Checkpoint`: running totals since the play
began (`spins`, optionally `outlay`, `at`, the parlor's `counter`, an `event`).
Totals, not differences, so a forgotten line is appended later without touching
any other: order comes from `spins`, never from position. Appending only is
also what lets two edits of a log merge cleanly in Git. A log whose spending
goes backwards is reported, not corrected.

A recorded play's log begins with one line that is no checkpoint, its head
(`core/play-log/head.ts`): `{"header": true, "about": …, "v": 1, …}`,
saying itself that it is the header, where its format is described and which
version of that schema the file is written in, then
what the play was — its id, game, day and start, its parlor, the corner's
terms, its machine and cabinet, the formula it was weighed by and, for
pachislot, its prior. The book keeps a pool and a day's rate and nothing more
of a corner's terms; the head is where the rest is kept, and a play's detail
shows the rate it was on from there (`termsInHead`). The lines after it are all of one shape, to be read as
columns with the first set aside as a table's header is. It is written as
the play is recorded (`finishPlay`), from the play as its entry says it; a
play still being played has no head, saying all of it beside its log.

A pachislot play's `spins` are games, and its lines may carry more: the
counter's day (`counter.total`, the day's games, and `counter.bonuses`, each
bonus by its entity in the formula's spec) and a `tally` of what was counted
by hand — small wins, replays and bonuses part by part — running totals from
the first line that carries one. A tap on a counting tile is a line of its
own at the games last known; the next counter reading says how many games the
counting covered. Pachinko logs read as before.

### Plays followed live

A play is followed at the cabinet before it is recorded. While it is played it
is a `PlayDraft` — work in hand on the device, in IndexedDB's `drafts` store,
never in a book, and nothing of it is written in one until it is recorded:
starting a play asks for no book. The book it goes into is said as it is
recorded — the book in use, the first the member may write (`bookInUse`),
unless another is chosen there (`chooseBook`) — and its parlor's pool is
opened in that book then (`finishPlay`). A play sent by someone else is said
for the book it was sent to, and is as free to go into another. The terms a
play is on — what the corner rents and exchanges at, and what a replay takes
— are the play's until then too, and are set right while it is played
(`changeTerms`): everything counted from its readings is counted anew. Its `log` is the JSONL text itself.

The parlor's data counter is typed as it reads. Readings count from an anchor:
the play's first point, whose counter still shows the previous player's spins,
or the last jackpot, where the counter starts over (`core/play-log/live.ts`).
A reading below what the counter should show means a jackpot went unrecorded;
the person can add it, as an `approximate` jackpot at the last known point. A
counter jackpot count above the log's is pointed out.

Live figures stop at spin performance. `performanceAcross` takes any two points,
so performance between points the person picks can be offered later.

Recording turns the draft into one entry and its play log in one change,
then deletes the draft; a record the book refuses keeps it.

## Layers and dependency direction

```text
app/composition ──────────────► adapters (storage/browser, history/adapters, hledger/worker)
      │
      ▼
ui/features ──► ui/navigation, ui/wording, ui/primitives ──► solid-gathering-shell, Kobalte
      │
      ▼
application ──► ports (storage/port, history/port, sync/port, backup/port, hledger/client)
      │
      ▼
core ──► hledger/protocol/wire (types only)
```

| Directory | Holds | May import |
|---|---|---|
| `core/` | pure domain: decimal, calendar, commodity, text, result, parlor, play, play-log, live-play, valuation, theoretical, journal, report, book, access, change, backup, export, document, favorites, marks; the catalog's machine, catalog, formula (a formula's standing) and grounds (a proof read back); and each game's own, pachinko and pachislot | itself, `hledger/protocol/wire` types |
| `hledger/protocol/` | the wire format, mirroring `Bindings.hs`; worker messages | nothing |
| `hledger/query/` | hledger query terms and requests P-Lens writes | `core`, `hledger/protocol` |
| `hledger/client/` | the only way to the worker; one queue (`inTurn`) | `hledger/protocol`, `core/result` |
| `hledger/worker/` | the engine (WASI, one parsed journal) and the worker loop | `hledger/protocol` |
| `storage/`, `history/` | `port/` interfaces (books, drafts, history); `browser/` or `adapters/` implementations | `core` |
| `preferences/` | `port/` (what a person has set for this device), `local/` (kept in localStorage) | `core` |
| `sync/` | `port/` (the relay, the sealing, a book's link to its line), `http/` (a relay by URL), `web-crypto/` (sealing by the browser's cryptography), `local/` (links in IndexedDB) | `core`, contracts |
| `backup/` | `port/` (the archive, a store away from the device, a file handed over, a fingerprint, the receipts), `zip/` (archives as zip files), `google-drive/` (a store in a person's Google Drive, and its sign-in), `browser/` (a file handed over by the browser), `web-crypto/` (fingerprints by the browser's cryptography), `local/` (receipts in IndexedDB) | `core` |
| `application/` | use cases, the `BookSession`, `Services` | `core`, `hledger/query`, ports |
| `ui/` | screens, navigation, wording, theme, primitives | `application`, `core`, port types |
| `app/` | entry, `App`, composition (the only place naming adapters) | everything |
| `branding/` | what is the deployment's own and not the app's, and not under the app's licence (`LICENSE`): the documents it puts before people (`terms.md`, `privacy.md`), what it goes by, where it is and where its landing page is (`deployment.ts`), the drawing its icons are made from (`icon.png`) and the files served at its root as they are — its icons and the card a link to it is shown as (`served/`) | `core/document` |
| `pwa/` | service-worker registration and update state | — |
| `catalog/` | `port/` (the shared catalog as delivered, and the API it comes from), `delivered/` (the delivered catalog in IndexedDB, with the outbox), `http/` (the API by URL), `absent/` (no catalog), `local/` (the device id) | `core`, contracts |
| `parlors/` | `port/` (the parlor list and its cache), `jsonl/` (the list by URL), `absent/` (no list), `local/` (the IndexedDB cache) | `core` |
| `pachinko-engine/` | `protocol/`, `client/` (the only way to the pachinko engine), `worker/` (the only importer of `@p-lens/pachinko-engine`) | contracts |
| `reasoning/` | `protocol/`, `client/` (the only way to a reasoner), `worker/` (the reasoner itself, of no game, and the only importer of `trealla`), `pachinko/` and `pachislot/` (each game's grounds in Prolog, and the worker that serves them) | `core/result` |
| `pachislot-engine/` | `protocol/`, `client/` (the only way to the pachislot engine), `worker/` (the only importer of `@p-lens/pachislot-engine`) | contracts |

A game is a folder, and the folder is its package: `core/pachinko` and
`core/pachislot`, `application/pachinko` and `application/pachislot`,
`pachinko-engine/` and `pachislot-engine/`, `ui/features/pachinko` and
`ui/features/pachislot`, `ui/wording/pachinko` and `ui/wording/pachislot`,
`@p-lens/contracts/pachinko` and `/pachislot`. Inside one, nothing is named
for its game — a `Formula`, a `Basis`, a `FormulaView` — and neither game
imports the other. A file outside that needs a game's names takes the package
whole, as `Pachinko` or `Pachislot` (`PachinkoEngine`, `PachislotViews`, … by
layer), so both read side by side: `Pachinko.Formula | Pachislot.Formula`.
`core/` and `ui/features/` packages are entered through their `index.ts`.
What belongs to neither game — a machine, a formula's standing, the catalog,
the live space — has no game in its path.

`tsconfig.core.json` compiles `core/` with no DOM and no ambient types, so a
`window` or `fetch` there does not build. `tests/boundary.test.ts` holds the
rest of the table, including that `solid-gathering-shell` mentions no domain.

## hledger in the browser

`wasm/hledger-bindings` is hledger-lib behind two exports, `hledgerLoad` and
`hledgerQuery`, derived from choai's bindings. P-Lens adds `valuation`
(`--value=then|end,COMMODITY`) to balance reports and a `prices` report, and
reads journals with hledger's strict checks.

- The worker keeps one instance and one parsed journal alive; parsing is the
  expensive part, queries are cheap.
- `HledgerClient.inTurn` is the single queue: opening a candidate, asking
  about it and putting the old journal back is one turn.
- `BookSession` remembers which files hledger holds and reopens only when the
  stored files differ — another tab may have written.
- Nothing throws across the boundary: worker failures come back as `Trouble`.

## Screens

`solid-gathering-shell` (MIT, `packages/`) is a domain-free frame: `TopBar`,
`RailBar`, `SidePanel`, `MainContent`, `AuxPanel`. Wide windows show the panes
side by side; narrow ones show one at a time, chosen by `focus`. The top bar
says the app's name.

The rail is shaped like a server list: the live space at the top, where direct
messages would be; your own books below a divider, one icon each; the books
others let you into below another; then the books you may only send plays
to, each an outline with a paper plane, since nothing of such a book is on
the device, wearing the number of the day's plays that wait to be sent
there (`awaitsSending`); settings at the foot. A book's side panel
lists its plays first, with a ＋ beside them to add one by hand.

The place is read off the address (`ui/navigation/place.ts`):

| Address | Place | Narrow focus |
|---|---|---|
| `/play` | plays in progress on this device | selection |
| `/play/new/{pachinko,slot}` | starting a play of a game | content |
| `/play/:play` | a play in progress | content |
| `/play/:play/record` | recording it into its book | content |
| `/books/:book` | a book, no view chosen | selection |
| `/books/:book/{plays,holdings,activity,files}?q=` | a view | content |
| `/books/:book/breakdown/:by?q=` | a book's results grouped | content |
| `/books/:book/files/:path` | one of the book's files as kept, beside the list | detail |
| `/books/:book/plays/new` | adding a play by its totals (記録を追加) | content |
| `/books/:book/plays/:play?q=` | a play beside its list | detail |
| `/destinations/:line` | a book only sent to: the day's plays and how each stands with it (`deliveryOf`), in the side panel | selection |
| `/pachinko/machines?q=` | choosing a machine: a search bar over every machine, newest first | content |
| `/pachinko/machines/:machine` | a machine's formulas, ranked | content |
| `/pachinko/machines/:machine/formulas/:formula` | 算出条件: figures, marks, adopt, remake | content |
| `/pachinko/machines/:machine/formulas/:formula/grounds` | 計算根拠: the combo solved, the spread | content |
| `/pachinko/machines/:machine/formulas/:formula/basis` | 期待値基礎値: the spec values, verify | content |
| `/pachinko/formulas/new/{manual,simulator}` | making a formula (and its machine, if new) | content |
| `/settings`, `/settings/appearance` | settings | selection, content |
| `/terms`, `/privacy` | a document the deployment puts before people, where it supplies one | content |
| anything else | 404 | content |

### The deployment's documents

The terms a deployment is used under and its privacy policy are its own,
not the app's: whoever runs a copy — this one, or a fork — writes them. So
the app has a place for each (`core/document`: `terms`, `privacy`) and no
words of its own to put there. The words are the files in `branding/`,
`terms.md` and `privacy.md`, written plainly — `#` headings to three deep,
`-` lists, paragraphs, each set off by a blank line — and read into blocks
(`blocksOf`), so nobody writing one has a markup language to learn and the
app ships no renderer for one. Only the composition reads `branding/`; it
hands the texts to the screens as `Services.documents`. A document that
is there has an address of its own at the root, `/terms` or `/privacy` —
where anyone asked for a link to it would look — and is linked from the
foot of the top bar's question mark and from the settings list under the
licences. One that is not there has no link, and its address says so. A
fork replaces the two files, or takes them away, and touches nothing else.

The deployment's images are its own in the same way, and are kept in the
same place: `branding/icon.png` is the one drawing, and `bun run icons`
renders from it into `branding/served/` the icons and the card a link is
shown as. Those files are served at the site's root as they are — the build
puts them there (`vite.config.ts`), and they are not among the app's public
files, which hold only what is the app's. The deployment's name is its own
too: the page's title, the installed app's name, the top bar, the card and
every sentence that names the app read it from `branding/deployment.ts`
(`Services.name`), with who runs it, shown at the foot of the top bar's
question mark (`Services.operatorPage`), what the page says of itself, the address a shared
link needs and the landing page the top bar's question mark links where
there is one. A fork replaces the drawing and renders again, and gives its
own name and address.

What is in `branding/` is not the software and is not under its licence: the
names, the logo and the texts are the operator's, all rights reserved, and
the GPL's section 7(e) is used to grant no right to the marks
(`branding/LICENSE`). The names of the formats the software writes — a
P-Lens book's opening comment, a play log's header, the header a device is
named in — are the software's, and stay whatever a fork is called, so that
what one copy writes another reads.

Each step forward pushes an address, so a phone's back button walks detail →
content → selection. `/` is rewritten to `/play`, the top of the rail.

## Formulas and the engine

What a play is worth in theory (its theoretical value, 期待値) comes from a **算出条件 (formula)**: two
figures, 1Rトータル確率 (`roundChanceOneIn`) and 1R平均出玉
(`payoutPerRound`), with トータル確率 and an hourly spin count optional. With
the parlor's ball value and the play's spin performance they give everything:

```text
ballsPerSpin = payoutPerRound / roundChanceOneIn
border       = 1000 / (ballsPerSpin × ballValue)          spins per ¥1000
value / spin = ballsPerSpin × ballValue − 1000 / spinPerformance (core/pachinko/theoretical-value.ts)
```

A formula is made one of three ways — the tabs 手入力, 基礎値から計算 and
シミュレータ — and a machine is never stored without one:

- **manual**: the two figures typed in, checked elsewhere (semi-pros).
- **simulated**: a **期待値基礎値 (basis)** — the spec sheet's values and the
  payout conditions — run through the engine, which gives the figures exactly
  (pros). The basis keeps its normalised spec and schema version; its
  **計算根拠 (grounds)** are that stored combo solved again, with each state's
  contribution and the simulated spread.
- **sampled**: the same basis, its 1R トータル確率 estimated on the device by
  Monte Carlo (`estimateChunk`): so many cycles — regular play to a first
  jackpot and the combo after — from a seed, run in chunks in the engine's
  worker, counted as it goes and stoppable. The formula keeps the basis, the
  cycles, the seed and the 95% margin, so anyone can sample it again from the
  seed and must come to the same figure. Only a finished sampling is saved.
  For now the API takes manual and simulated formulas only.

Formulas are immutable. "Remake" makes a new one, `derivedFrom` the old.

### Choosing a machine

The side panel of the live space has two buttons, パチンコ開始 and スロット開始,
each opening the start screen for its game. After the book, each game has a
form of its own — `Start` in `ui/features/pachinko` and in
`ui/features/pachislot`, sharing nothing but
primitives, however alike they are today: the parlor from the list, the corner's six terms, the machine (with the formula, for
pachinko), then the cabinet and its counter. Only the machine is required; a
parlor's play also needs its terms. Nothing is said until the button is
pressed, and then what is missing only turns red.

The start screen's machine is a field that only opens the machine search, a
screen of its own: a search bar over the list of every machine, newest
registered first (release date, once machines carry one). The list says
"機種が1件も登録されていません" when the catalog is empty and
"該当する機種がありません" when nothing matches; choosing one goes back to the
start screen with it in the field. Beside the field are the formula select, the
icon saying why that formula was chosen, and a question mark that opens it.

### Choosing a formula

Picking a machine picks a formula (`core/formula/standing.ts`):

1. the formula a book keeps as a favourite for that machine, if any — the
   device's books asked from the top, the first to keep one of the machine's
   formulas having the say (`keptAmong`);
2. otherwise the best ranked, by score: how it was made, verifications
   less refutations, adoptions less rejections and uses, each by its
   weight, summed (`scoreOf`: a check is worth five adoptions, a hundred
   uses half of one; worked out from a basis sixteen points, sampled
   three, typed in none — a step is a point more than all a maker can
   give the formula below, their adoption and, where it has a basis,
   their check, so their own marks never lift a formula over the making
   above, and one more person's adoption does; uses weigh at most a
   hundredth short of sixteen points, however many they are).
   A favourite weighs nothing: it is its book's alone. Between two of
   the same score, the one that makes a play worth less comes first
   (`worthOf`: a pachinko formula's balls a spin, a pachislot one's 機械割
   over its setting levels) — where nobody has said which is right, the
   harsher figures are the safer to go by — and then the older, so a new
   formula rises only by being checked and adopted;
3. whichever you choose by hand overrides both for that play.

Six marks, each kept apart, never merged with anything else:

| Mark | Who presses it, where | Count |
|---|---|---|
| お気に入り (favourite) | anyone, on the card; kept in the book | per person per formula |
| イチオシ (adoption) | semi-pros, on the 算出条件 screen | one per person per machine; a new one replaces the old |
| 非推奨 (rejection) | anyone, on the 算出条件 screen; counts against adoptions | per person per formula; it and an adoption may stand together |
| 検証OK (verification) | pros, on the 期待値基礎値 screen; from a basis only | one per person per formula, never taken back |
| 検証NG (refutation) | pros, the same place; counts against verifications — a person's own too | one per person per formula, as above; it and a verification may stand together |
| 利用回数 (uses) | starting a play with it | every time |

What everyone has done arrives with the catalog's delivery; what a person
has done themselves shows at once, from their book.

A person's marks are kept in their book, not on a device (`core/marks`):
`logs/marks.jsonl`, a line a press, only ever added to —

```json
{"v":1,"id":"…","at":"2026-10-10T03:12:45.120Z","by":"local","did":"adoption-given","mark":{"target":"formula","id":"…","machine":"…"}}
```

— shaped as the activity's lines are, its `did` one of `adoption-given`,
`adoption-taken-back`, `rejection-given`, `rejection-taken-back`,
`verification-given` and `refutation-given`. What a member holds is their
lines made in the order they were pressed (`marksOf`): an adoption lets go
of their other one on the machine, a check stands. So a mark made on one
device is seen on every device the book reaches, and is not made again
there. Taking one back is one more line: the book's lines only grow, so
two devices' come together; the shared catalog keeps no such record, only
the mark, there or not, and its counts.

The catalog counts a mark under a voter, not a device (`VoterOf`): a name
made of a digest of the book and the member, the same wherever the book
is opened and telling nothing of either. A person's devices that hold the
book are one voter between them, so a mark set on one and cleared on
another is one mark set and cleared. A press tells the catalog first,
which may refuse it, and is then written in the book (`pressMark`); marks
read from a book that came from elsewhere are only read. Nothing here is
a guard against someone who means to count twice — another book, another
browser — and none is wanted: it keeps an honest person's devices from
doing so by accident.

A favourite is the book's own, whoever its member (`core/favorites`): `logs/favorites.jsonl`, a line a press of the heart,
only ever added to —

```json
{"v":1,"id":"…","at":"2026-10-10T03:12:45.120Z","by":"local","did":"favorite-kept","favorite":{"target":"formula","id":"…"}}
```

— a line shaped as the activity's are: `v`, `id`, `at`, `by`, a `did` of
`favorite-kept` or `favorite-let-go`, and the `favorite` it was done to.
Nothing else holds a book's favourites: what it keeps is, for each id,
what its latest press says (`favoritesOf`), so letting one go is one more
line, and what the book kept at any moment is the lines up to it read the
same way. The file is the whole record of what was done to its
favourites; the book's activity says nothing of them. The book is the one
in use (`bookInUse`): the one chosen for the play being started, or else the first the member may write. The
shared catalog is told of a press when it is made (`pressFavorite`), under
the same voter, and at no other time: favourites read from a book that came from another device,
a backup or its line are only read. Its count is one per person per
target, so pressing over and over adds nothing.

A formula's favourite is not the machine's favourite. When the favourite is
auto-selected over a better ranked formula, the field says so with an icon —
a heart that arrives — never a popup.

### Depth

Each level is one place, deeper than the last, and `MainContent` shows the
trail as a breadcrumb (`solid-gathering-shell`'s `Breadcrumb`), the way a
thread shows under its channel:

```text
パチンコ開始 › 機種 › 算出条件「…」 › 計算根拠 › 期待値基礎値
```

The start screen's state (book, machine, chosen formula) lives in a context, so
walking down the trail and back keeps the work in hand.

### Rust crates

| Crate | Holds | Knows |
|---|---|---|
| `pachinko-domain` | types: `Probability` (checked `0..=1`), `ProbabilitySource` (`1/319.7`, `81%` kept as written), `BasisPoints`, `RoundCount`, `SpinCount`, `Spec`, `NormalizedSpec`, conditions | nothing; no I/O, no serde |
| `pachinko-engine` | `normalize` (validation, lucky trigger expansion), `analyze` (absorbing Markov chain solved exactly), `hyena_hunt` (遊タイム狙い solved exactly) | domain |
| `pachinko-simulator` | xoshiro256** seeded from SplitMix64, combos, sessions, estimates and hyena hunts, a Welford aggregate | domain |
| `pachinko-wasm` | DTOs, conversions, the calls: `normalize`, `analyze`, `simulateChunk`, `estimateChunk`, `hyenaHuntChunk`, `hyenaHuntTable` | all three |

- **A machine is an ECS world, in pachinko's words.** `Spec` is its
  entities — the regular game and each mode, in the order made — a table per
  component keyed by entity, and resources the whole machine shares:
  `regularGame`, `allotment`, `specialTime` (ST), `rapid` (時短),
  `leftoverQueue` (残保留), `rushing` (a RUSH by its continuation rate),
  `untilHit` (確変 loop), `onMiss`, `luckyTrigger` ("3連で LT" is
  `atCombo: 3`), `reliefDrive` (遊タイム) and `label`; `payout` is a resource.
  A share of an allotment pays its rounds by that rule unless it names its
  own `prizeBalls` or `count` — a 4R through a ten-ball attacker beside a
  10R through a fifteen-ball one — and where one jackpot opens more than one
  attacker, a V round through a one-ball attacker and then nine through the
  fifteen-ball one, the rounds that pay otherwise are the share's
  `otherRounds`, each with a prize and a count of its own. So an outcome
  carries the balls its rounds gain beside the rounds, every round counted
  whichever attacker it opens, and 1R 平均出玉 is every round's gain over
  every round. A
  measured round scales every share alike. The JSON is the
  same shape (`packages/contracts`), and a feature is a component, not a new
  shape. `pachinko_engine::query` is the system that reads it: it assembles
  the regular game and each mode from their components and refuses an entity
  whose components do not make one — `MissingComponent`, `MissingKind`,
  `ConflictingComponents`, `StrayComponent`, `NoRegularGame`,
  `SeveralRegularGames`. `core/pachinko/world.ts` is the same queries for the
  screens. The query derives how each mode ends (`ModeKind`): `Runout` when
  its spins run out (an ST, a 時短, a leftover queue), `UntilHit`, or
  `Continuation` by its rate. Normalising turns the assembled modes into
  states; history dependence is lifted into the states (a mode with a lucky
  trigger becomes one state per combo short of it), never into the solver.
- **A 遊タイム is the regular game's relief drive.** Spins at the regular
  game's chance without a jackpot fill the relief gauge; once it holds so
  many, play enters a mode (usually a long 時短) with nothing won. As the
  machines do: the gauge empties at every jackpot; a 時短's and a leftover
  queue's spins fill it (`fills_gauge`, from the kind of mode, never inferred
  from its chance) and an ST's do not; and the 遊タイム comes once between
  jackpots — missed, it is spent until the next one. A leftover queue is
  drawn at the regular game's chance; a machine that draws it at the ST's is
  written as an ST that many spins longer. Where regular play starts again
  therefore depends on how a combo ended (`relief_drive::Restart`: the gauge
  filled so far, or spent), found by solving the Markov chain over (state,
  gauge, no jackpot yet); how often each way comes over the long run is the
  stationary distribution of the small chain they form, and 1R トータル確率
  is the weighted cycles' rounds over their regular-game spins. Spins in a
  mode cost nothing for now; tulip support (電サポ) and its ball gain will
  change that. The simulator carries the gauge and the spent 遊タイム from
  cycle to cycle the same way, and is tested against the exact figure on a
  machine where both happen often.
- **遊タイム狙い is sitting down at initial spins.** From the counter as it stands, play
  until a first jackpot — or the relief drive — and its combo are over, and leave.
  A counter past the relief drive's count is a cabinet whose relief drive has come
  and gone: it comes once between jackpots, so the sitting waits for a jackpot alone.
  `hyena_hunt` gives its theoretical value exactly (the 遊タイム狙い table on a formula is
  `hyenaHuntTable` over every 50 or 100 spins); `hyenaHuntChunk` samples it with its
  margin, spread, win rate and relief drive rate, from the start screen, a play in
  progress, or a row of the table. It depends on the spin performance and exchange
  rate, so it is worked out where it is asked for and never stored.
- **About nine machines in ten, not all.** A spec beyond the model is refused
  as `UnsupportedSpec`; there is no machine-specific code, and no DSL.
- **Validation is typed:** `InvalidProbability`, `InvalidDistribution` (shares
  must be exactly 100%, checked in integer basis points), `DuplicateMode`,
  `UnknownMode`, `UnreachableState`, `NonAbsorbingModel`, `UnsupportedSpec`.
- **Analysis is exact.** `(I − Q) v = r` solved by Gaussian elimination for
  rounds, jackpots, and the chance of reaching each mode. The result carries
  each state's contribution (`derivation`) so a figure can be traced back.
- **Monte Carlo gives the theoretical value only where asked to sample it.** A
  sampled formula's 1R トータル確率 is an estimate with its margin, by a
  second route; otherwise Monte Carlo gives the spread around the exact
  figure. Both are tested to converge on the exact figures (the estimate holds
  the exact one within its margin) (within 2% on combos, within
  five standard errors on the mean result). Same seed and input, same result,
  however it is chunked.
- `EngineVersion` and `SchemaVersion` are separate: a stored normalised spec
  says its schema, and is solved as that schema.
- **A spec says which shape it is written in.** `SpecVersion`, the spec's
  own `v`, is the version of the world's shape — its entities, a table per
  component, its resources — as a person's spec is sent and stored, apart
  from the two above, which are of what the engine makes of it. What is
  stored outlives the engine that read it, so the rule is for the engine
  that comes later, or earlier: a spec of another version is refused by its
  number (`unsupported-spec-version`), and a table of components an engine
  does not know by its name (`unsupported-component`), never read as if it
  were not there. A feature is a new table and no new version; only the
  shape itself changing is one. Both games keep this, each for its own spec.

### The boundary

- A few coarse calls, JSON text in and out, every failure an `{ ok: false, error }`
  envelope. No fine-grained calls; no domain type is serialised directly.
- `packages/contracts` is the TypeScript mirror of the DTOs, with fixtures both
  sides test against. `fixtures/pachinko/made-up/normalized.json` pins what the
  made-up machine normalises to: a change there is a schema change, made on purpose.
- `packages/pachinko-engine` is the built WebAssembly, committed so neither
  app needs Rust to build. `scripts/build-pachinko.sh` rebuilds it.

### In the browser

- The engine runs in its own worker (`pachinko-engine/worker`), which imports the
  WebAssembly the first time it is asked something. Nothing of it loads at
  startup, and it is left out of the precache; it is cached when first used,
  and from then on a machine opened once computes offline.
- The worker runs a simulation in chunks sized to about 50 ms, posting
  progress and yielding between them so a cancellation is heard; estimates
  and hyena hunts run through the same loop. Messages in: a `call` answered
  at once (`analyze`, `hyenaHuntTable`), the runs `simulate`, `estimate` and
  `hyena-hunt`, and `cancel`. Out: a call `answered` or `refused`, and each
  run's events — progress, completion, cancellation or failure. The pachislot
  engine's worker speaks the same way.
- A formula's grounds are solved from the **normalised spec it stores**, not from
  its basis normalised again by whatever engine is current.
- **The grounds are reasoned, then worded.** `core/pachinko/grounds` turns the stored
  basis and the engine's solved figures into Prolog facts; the reasoner —
  Trealla Prolog in its own worker, loaded the first time grounds are opened
  and cached like the engine — proves `grounds/2` from
  `reasoning/pachinko/grounds.pl` with a meta-interpreter that returns the proof
  tree: each rule applied, each fact given, each sum worked. Checks end in a
  verdict rather than failing: the reasoned 1R トータル確率 and 1R 平均出玉
  against the engine's, and a sampled formula's stored estimate against the
  exact figure within twice its margin, so a figure tampered with shows as a
  failed check. The proof is read back by `core/grounds` — a Prolog term, and
  the proof tree it spells, of no game — and `ui/wording/pachinko/grounds`
  alone turns it into sentences.
- **Pachislot's grounds are reasoned the same way**, for an AT machine that
  says its 純増: `core/pachislot/grounds` gives the bet, the ベース, the
  純増 and, under each setting level, the cycle's regular games and the
  AT's medals as the engine solved them and the 機械割 the spec states;
  `reasoning/pachislot/grounds.pl` proves each level's AT gain — from the
  stated 機械割, or as solved — and the 機械割 from it, checked against the
  engine and against the 機械割 stated, and `ui/wording/pachislot/grounds`
  words the proof. A machine without a 純増 has nothing to reason and
  shows only what the engine solved.

### Shared data (D1)

```text
users ─┬─ machines (game_kind ∈ pachinko | pachislot) ── machine_keywords
       │     ├─ formulas        (immutable: manual | simulated | sampled)
       │     └─ distributions   (immutable 設定配分; pachislot only)
       ├─ formula_adoptions / distribution_adoptions (one per user per machine)
       ├─ formula_rejections    (one per user per formula)
       ├─ formula_verifications (verdict ±1, one of each per user per formula; simulated or sampled)
       ├─ formula_favorites / distribution_favorites (one per user per target)
       ├─ formula_uses / distribution_uses           (one row per use)
       ├─ machine_favorites     (one per user per machine)
       └─ tags ── taggings      (target_type ∈ machine | formula | distribution)
```

- One catalog for both games: a machine says its game, and a formula keeps
  its figures, basis and normalised spec as JSON in its game's shape, so the
  tables never learn a game's figures; which engine checks a formula is the
  API's to say from its machine's game. A pachinko and a pachislot machine may
  share a name; two of one game may not.

- Every id is a UUIDv7 (`packages/uuidv7`: pure formatting, the caller passes
  the time and the random bytes), made by the API for D1 rows and by the
  composition for device records.
- **A machine is described** by the name it goes by in a parlor — kept at
  half width, its spaces single, a wave dash as a tilde, with none after
  the P, e, L or S it opens with (`keptName`), however it was typed — and — each
  only where known — the model name it was approved under (型式名), a
  pachinko machine's 大当り確率 as its spec sheet writes it (`1/319.7`, kept
  as written and calculated from nowhere), and up to ten words it is
  searched by: ヴェルヴ for ヴェルトレイヴ, ゲンキ for 幻鬼. A search finds a machine
  by any of them, katakana as hiragana and widths, case, spaces and stars
  aside (`machineMatches`). The list shows the name in bold over the model
  name, with the release date and the 大当り確率 at the far end; what is not
  known is shown as dashes, never a blank. A formula is never changed, but
  a description is set right by an administrator when someone writes in
  (`PUT /admin/machines/:id/description`), and every device takes it with
  the next delivery.
- A machine and its first formula are written in one batch: both or neither.
  A name is unique as compared (`comparableName`: NFKC, trimmed, lower case,
  spaces collapsed).
- Formulas are immutable: triggers refuse `UPDATE` and `DELETE`.
- A formula with a basis — every one but a pachinko formula typed in —
  stores `basis_json`, `normalized_spec_json` and `engine_schema_version`; a
  sampled one `sampling_json`; every formula `figures_json` and
  `content_hash` (SHA-256 of canonical JSON). The API makes the normalised
  spec itself and solves it, and refuses figures that are not what the basis
  comes to — a sampled pachislot formula's 機械割, which cannot be sampled
  there, within five standard errors of the exact one by its own stated
  margin. It is never accepted from the client.
- Taggings are polymorphic, so their target has no foreign key; the API checks
  the target exists for its type before writing.
- Each mark and use has a table for formulas and one for 設定配分, so every
  one keeps a foreign key. A formula can be rejected and refuted as well as
  adopted and verified, the two counting against it; a check either way is
  one a person a formula and is not taken back, so one who thinks again
  gives the other and the two cancel. A
  設定配分 is only adopted and favoured.

### The API (`apps/api`)

A Cloudflare Worker: the whole catalog delivered to a device (`/catalog`,
with `/catalog/version` asked first — a hash of what the catalog holds, uses
aside, so it moves only when there is something new to deliver), search
(`?game=` narrows it to one game), reads,
registering a machine of a game with its formula, adding formulas and 設定配分,
the marks and uses of both, machine favourites, tags. No `/calculate`, no
`/simulate`; each game's engine runs only to check a formula of its game. There is no
login: reads are open, and writes name the device by the UUIDv7 it made for
itself, in `X-P-Lens-Device`. Its tests run the real migrations in SQLite and
the real engine.

Requests are taken only from the pages a deployment names in
`ALLOWED_ORIGINS`, reads and writes alike: a browser always names the page
it asks from (`Origin`, or `Sec-Fetch-Site: same-origin` under the app's
own origin), so a copy of the app served elsewhere is refused with 403. A
deployment serves the API under the app's origin at `API_BASE_PATH`
(`/api`), with no address of its own. None named takes any, for local
development. Anything but a browser can claim any page, so writes are also
limited by address (`WRITE_LIMIT`, `CREATE_LIMIT`: Workers rate-limiting
bindings), and registering anything new needs a Turnstile token given on
one of the app's hosts (`X-Turnstile-Token`, checked with
`TURNSTILE_SECRET`). Those bindings count over a minute at most, and what
is worth stopping is slower than that: a machine takes half an hour to
look up and check at the very least and six hours as a rule. So what is
registered is also counted over a day (`domain/quota`, `STANDARD_QUOTAS`):
a machine with its first formula, an addition to a machine there already —
a formula or a 設定配分 — and a tag are each a kind, each with an interval a
device waits out after its last, a day's count for a device, and twice
that for an address, so two people behind one line do not stand in each
other's way. The count is a ledger of its own (`registrations`: the kind,
the user, the address as a hash, when), a row entered once something is
registered — what is refused for any other reason counts against nothing —
and taken out when it is a day old. A registration past its quota is
refused before anything is read of it (`quota-reached`, 429, with `nextAt`:
from when the next is taken), and `GET /quota` tells a device where it
stands for each kind, so the app says so before anything is typed. A
deployment with no quotas counts nothing. Nothing registered is edited or deleted; what vandals
register is hidden by an administrator (`hidden_at` on machines, formulas
and 設定配分) — delivered to nobody, a hidden machine's name free again —
and can be shown again. The administrator's routes (`/admin/…`: what was
registered lately, hiding one thing or all a device registered, describing
a machine anew) answer
only to `ADMIN_TOKEN`, from anywhere, and are not found without it. A machine is
registered with its model name, and a pachinko machine with its 大当り確率,
both required here as on the screen; a model name is kept as a name is
(`keptName`). An administrator may still describe a machine without them.

A machine has two names and each has its use. The name the halls call it
is what it is found and chosen by, shown first and bold wherever one is
picked. The model name is what goes into a book (`bookNameOf`): a play
names its machine by it, and so do the screens that show a play. It is
the one name that is nobody's choice of words — the same machine is one
name in every book — and the name a serious player knows it by; a light
player does not mind which is kept. A machine registered before every
machine was asked for one goes into a book under the halls' name. A model
name is kept as a name is (`keptName`), on the device and again by the
API, with a slash standing close between what it parts and a colon typed
twice made one, as model names are written.

A pachinko machine's bonuses — what a play records a jackpot as: a name,
the balls it pays out and the balls shot to get them — are a formula's to
state, not the machine's. A formula worked out from a basis has them from
its basis: the shares of its allotments that open the same rounds through
the same attackers are one bonus, whatever their share and wherever they
lead, and two that only happen to pay out the same balls are two
(`bonusShapesOf` in the contracts, which the screen and the API both use).
Such a formula names its bonuses and no more: the API refuses bonuses
that are not, one for one and in order, what its basis's jackpots pay
(`figures-disagree-with-basis`, `bonuses`). A formula typed in has no
basis to take them from and states at least one, whole. The editor lists
a basis's bonuses under the figures to be named, each going by its rounds
until it is; a play takes its bonuses from the formula it is weighed
against as it begins. They are kept with the formula for good
(`bonuses_json`); the formulas registered before took their machine's
list as it stood, and `machine_bonuses` is read no more. A machine's release date is checked here, not only on the
screen: no earlier than 1960 and at most a year ahead of the day it is
registered (`releaseDateProblem` in the contracts, which the screen uses
too). A deployment's ids and origins live in `wrangler.production.jsonc`,
kept out of git; the README says how to make one.

### On the device (`apps/web/src/catalog`)

The app never asks the API what is in the catalog: the whole of it is
delivered to the device and read there, so choosing a machine and playing
need no network. `Catalog` is the one port for both games; a machine's game
decides the shape of all hung on it (`core/catalog`).

- **Quotas and drafts**: a formula's editor asks where the device stands
  against the quotas (`Catalog.quota`, never kept) and says it above the
  button — how many more today, and from when the next if not now. A
  formula the shared catalog did not take, whatever the reason, is kept on
  the device with what it was for (`core/catalog/draft`, one a game, in the
  preferences): the formula as it was sent and a new machine as it was
  typed. The editor offers it back the next time it opens, and it is let go
  of when a formula is sent or the person throws it away. Its basis is the
  spec, not the form, so a draft outlives a change to the form.
- **Delivery**: the catalog is kept whole in IndexedDB's `catalog` store,
  with its version. A refresh asks `/catalog/version` and takes `/catalog`
  only when it moved. The app refreshes when it opens, when a machine search
  opens, from the button left of the question mark in the top bar (there
  only in a build that names a catalog), and after
  anything is shared — at once and again a few times over two minutes, since
  what one registers is usable only once it is delivered, like anyone's.
- **Sharing is not optional**: registering a machine, adding a formula or a
  設定配分 goes straight to the API; there is no machine of one's own.
- **Marks and uses** are queued in `catalog-outbox`, a mark under its
  voter, and sent in order on the next refresh; a person's own marks are
  shown from their book; one the API refuses for good is let go, one it cannot reach
  waits.
- **The device** names itself by a UUIDv7 made once (`device`).
- `VITE_CATALOG_URL` names the API; a build without it has no catalog
  delivered and nothing to register, and plays are still recorded by their
  result.

## Pachislot

Pachislot has an engine, a catalog and a boundary of its own, built in the
same shape as pachinko's and sharing none of their code: the two games share
only the primitives, the core and the application.

### Crates

| Crate | Holds | Knows |
|---|---|---|
| `pachislot-domain` | types: `Probability`, `ProbabilitySource`, `BasisPoints` (kept apart from pachinko's), `SettingLevel` (`1..=6`), `PerSettingLevel`, the `Spec` world, `NormalizedSpec`, `Distribution`, `Segment`, `PayoutRate`, `PlayConditions` | nothing; no I/O, no serde |
| `pachislot-engine` | `query` (the world into bonuses, small wins and replays), `normalize` (one table of a regular game's outcomes per setting level), `analyze` (payout rates), `posterior` (the setting level, by Bayes), `theoretical` (the theoretical value) | domain |
| `pachislot-simulator` | xoshiro256** (its own copy), a regular game drawn from a setting level's table, sessions over a mix of setting levels, payout rates estimated with their margins | domain, engine |
| `pachislot-wasm` | DTOs, conversions, the calls: `normalize`, `analyze`, `posterior`, `theoreticalValue`, `simulateChunk`, `estimateChunk` | all three |

- **A machine is an ECS world, in pachislot's words.** `Spec` is its entities —
  each bonus, part of a bonus, small win and replay, in the order made — a
  table per component keyed by entity: `label`, `chance` (how often a regular
  game comes up with it, under each setting level), `payout` (what a small win
  pays, or a bonus gains over its own games), `bonus`, `replay` and `partOf`
  (単独 and チェリー重複 as parts of a REG); `settingLevels` and `bet` are
  resources. `pachislot_engine::query` assembles each from its components and
  refuses an entity they do not make one of — `DuplicateEntity`,
  `MissingComponent`, `ConflictingComponents`, `StrayComponent`,
  `PartOfNonBonus` — and a component table the engine does not know is
  refused by its name rather than misread.
- **設定 is a setting level** — `SettingLevel`, `settingLevels` — in full
  everywhere: 6 is the highest and the best, and "settings" would read as the
  app's own. A machine lists the setting levels it has (`1, 2, 4, 5, 6` is
  common).
- **A payout rate** comes from what every outcome pays — a replay counted as
  the bet paid back — or as measured, which is how a typed-in formula and a
  rate that depends on how the reels are stopped are given. Games are regular
  games: a game's theoretical gain is `bet × (rate − 1)` medals.
- **The setting level is inferred by Bayes.** What was seen is stretches of
  regular games (`Segment`), each counted the same way: the counter's day for
  bonuses, the stretch counted by hand for small wins and bonus parts. Each is
  a multinomial over what it counted, the uncounted games sharing what is
  left, summed in log space against a 設定配分 or an even spread; what no
  allowed setting level could give is `ContradictoryEvidence`, never a
  rounded guess.
- **The theoretical value** weighs each setting level's rate by its chance; the
  rental spread is charged only on the share of the medals played that was
  rented for cash.
- **An AT machine** is a world of one AT entity — its published 初当たり
  (`firstHit`), its payout, and its `ceiling` and `resetCeiling` — its CZ
  if one brings the AT, its modes if it has them, and a `base` resource,
  ベース. A CZ is an entity of its own (`cz`) with its published 合算
  (`firstHit`, ceilings included), its `success` rate under every setting
  level, its `ceiling` and `resetCeiling`, and its スルー天井 (`misses`: the
  CZs missed since the last AT after which the next one wins it); the AT it
  brings has no 初当たり of its own, and its `ceiling` is then the AT間天井,
  in regular games since the last AT. A mode is an entity
  of its own — 天国, 通常 — with its `ceiling`, its `allotment` after an AT
  and, where it differs, its `resetAllotment` after a setting change, each
  under every setting level; a machine of modes keeps its trigger's ceilings
  on them. Where the ceilings count the screen's games, `lcdRate` says how
  many the screen counts for each regular game, and the trigger's ceilings
  are taken that much sooner — on average, which the screen's additions are;
  the AT間天井 is counted in regular games.
- **An AT's 純増 closes the machine.** What an AT costs in games of its own
  is not in its payout, which is why an AT machine's 機械割 is measured —
  unless the AT says its 純増 (`netPerGame`, medals a game). Over a cycle,
  the regular games to an AT and the AT's own `gain / 純増` games, medals
  out over medals in is the 機械割 (`pachislot_engine::rate`), so either
  follows from the other. With a payout and a 純増, the 機械割 comes from
  the spec (`from-spec`). With a published 機械割 (`rate`, under every
  setting level) and a 純増 in place of a payout, what the AT gains is
  what they imply, worked out as the spec is normalised into a fixed
  payout, and the 機械割 comes back from it: the two are one statement and
  cannot disagree. A 機械割 no AT of that 純増 could bring is refused
  (`unattainable-rate`). An AT that pays at more than one 純増 — an 上位AT
  gaining five a game where the AT gains under three — says the shares of
  its medals won at each other one (`otherNet`: the 純増 there, and the
  share), the rest won at its own. A medal won at a 純増 of `n` takes `1/n`
  games, so the AT's games a medal are each share over its 純増, summed,
  and the 純増 over all its medals — what `atRules.netPerGame` holds — is
  one over that. Shares beyond the whole are refused
  (`other-net-beyond-whole`).
- Normalising gives `NormalizedSpec.atRules` — the ベース, the AT and its
  payout, the trigger (the CZ, or none where the AT is won directly), the
  modes with the trigger's ceiling in regular games, the AT間天井 and the
  スルー天井 — and each table its `at`: the trigger's chance a regular game
  below its ceilings, its success rate (one for a direct AT) and the
  allotments. A machine without modes has one, and a second for its shorter
  ceiling after a setting change. The published 合算 is read back to the
  trigger's chance by halving over a cycle from one AT to the next, worked
  out exactly: in closed form without an AT間天井, and with one by
  convolving the games between triggers, each alive while every one before
  it missed. The AT's 初当たり is that cycle's, never typed in beside a CZ.
- The modes are never seen, so a play is walked game by game from where it
  stood at the seat (`Path`: the games since the last trigger and AT, the
  CZs missed, a setting change), each leg ending in nothing, a CZ missed or
  an AT won. The modes still possible are weighed by their allotment and by
  how likely each was to bring the misses and the games since; each game's
  chance of the AT — certain on the AT間天井, on a mode's ceiling past the
  スルー天井 — makes it worth `−50 / ベース` plus the AT's payout at that
  chance. The theoretical value is of the games played, not their number,
  and needs no rule for when the player stops; the same walk gives the
  setting level an exact likelihood, given where play was first seen. An
  event on a leg of no games — one the counter showed only later — moves
  play on unweighed. Its payout rate is measured: what an AT costs in games
  of its own is not in the world.
- **What an AT gains** is a law under each setting (`PayoutLaw`): its
  average (`payout`), sets at a 継続率 (`sets` and `continuationRate`) or a table of
  medals (`payoutTable`) — one of them. A `cap` resource, 有利区間の上限,
  cuts an AT at the headroom left: the cap less what the 有利区間 holds from
  its lowest point. An AT that reaches it completes the 有利区間; one that
  falls short leaves what it gained held for the AT's `window`, and an AT won
  in it starts from that less the regular games' loss since. Where the AT
  says `resetOnCap`, play after an AT that completes starts as after a
  setting change, and the share that do is settled against the trigger's
  chance while the published figure is read back. Each setting's figures
  give an AT's average gain and its 完走率 over every AT play goes through,
  worked out exactly a 有利区間 at a time on whole medals, and checked
  against sampling. The walk carries what the 有利区間 may hold, each game
  worth what an AT could gain from it; how an AT went (`AtSeen`: completed,
  its sets, its medals) weighs the likelihood where seen.
- **Monte Carlo** estimates each setting level's payout rate with its 95%
  margin, a game at a time with setting levels taking turns, and gives the
  spread of a play over a mix of setting levels. Both are tested against the
  exact figures; same seed and input, same result, however it is chunked.
- `packages/contracts/fixtures/pachislot/made-up/` is a made-up machine worked
  out by hand, read by the tests on both sides; `normalized.json` pins what
  it normalises to. `packages/pachislot-engine` is the built WebAssembly,
  rebuilt by `scripts/build-pachislot.sh`.

### In the browser

- The engine runs in its own worker (`pachislot-engine/worker`), imported the
  first time it is asked something, left out of the precache and cached on
  first use, like the pachinko engine. Calls answered at once (`analyze`,
  `posterior`, `theoreticalValue`) and chunked runs (`simulate`, `estimate`) share
  one client.
- `core/pachislot` reads an analysis into each setting level's 機械割 and bonus
  odds, a posterior into 高設定期待度, 期待設定 and the most likely setting
  level, and a play's log into the path the engine walks.
- **The catalog** is the one shared catalog, a pachislot machine saying so
  by its game: its formulas, each keeping its 解析値 — even a typed-in one,
  a world of its bonuses with the 機械割 measured — and its 設定配分, a
  machine's prior over its setting levels, labelled by its maker. A formula
  and a 設定配分 are ranked, marked and chosen the way pachinko's formulas
  are (`core/formula/standing`, which takes what it ranks as a parameter);
  adopting one lets go of the other adoption of its kind on the machine, and
  only what was worked out from 解析値 can be verified or refuted.
- **Screens** live under `/pachislot` (`ui/features/pachislot`): the machine
  search, a machine's formulas and 設定配分, a formula with its 計算根拠 and
  解析値, making a formula three ways, and registering a 設定配分.
- **A play** starts on the game's `Start` with a machine from the catalog, chosen
  on the machine search as pachinko's is, with a formula beside it — chosen
  for you as pachinko's are — and a prior: a
  設定配分 chosen by hand or kept as the favourite, else an even spread; a
  設定配分 is never chosen for you by its ranking. The draft keeps both as
  they were (`PlayDraft.pachislot`), and the log's first line is the data
  counter as found at the seat. A 設定配分 registered for every setting level
  of a machine is cut to a formula's own and scaled back to 100%
  (`core/pachislot/prior`).
- **During a play** (`LivePlay`), the counter's readings, the counting
  tiles and the odds of each setting level with what the play is worth are
  shown together and kept on screen across reloads of the draft; writes go
  one after another from the log as it stands, so taps quicker than a reload
  are each kept. `weighPachislotPlay` infers the setting level from the log
  and weighs the games played — or an hour's play, before any — taking the
  share rented for cash from the outlay, or as `1 − 期待機械割` before an
  outlay is known. Its yen for the games played is the theoretical value the
  record form starts with.
- **An AT machine's play** keeps pachinko's log: `spins` are its regular
  games, the counter shows the games since the last AT, an AT is a jackpot
  and the counter starts over at it, and a CZ that missed is a `cz-missed`
  event. The first line may say the settings were changed (`afterReset`)
  and, where a CZ brings the AT, give the games since the last CZ and the
  CZs missed (`counter.sinceCz`, `counter.misses`), and what a 有利区間 still
  carrying on held (`counter.held`). An AT's end is an `at-ended` event on
  the games it was won on — completed, its sets, its medals, each optional —
  asked for once an AT is won on a machine where it tells the engine
  anything. `core/pachislot/path` reads the log into the path the engine
  walks, how far each ceiling is, and what is left of a 有利区間's window and
  headroom.

## Sync

A book is carried between one person's devices as its commits, through a
relay that can read none of them.

- **A line.** Each synced book has a line on a relay: its commits, sealed, in
  the order the relay took them. `apps/relay` is the relay — a Cloudflare
  Worker over D1 with two calls, read a line from a place in it and add to
  its end — and `@p-lens/contracts/relay` is what it speaks. It takes
  commits only from a device that has every entry before them, so a line has
  one order however many devices write; one that is behind takes what it
  missed first. An official relay and a self-hosted one are the same code,
  and nothing in the app names either: a book's link names its relay.
- **A secret.** The device that starts syncing a book makes 32 random bytes.
  From them, by HKDF, come the line's id, the token the relay knows the line
  by (it keeps only its hash), and the AES-GCM key every commit is sealed
  with, its id bound in. The pairing code is the secret and nothing else:
  the relay is the build's to name (`VITE_RELAY_URL`), on the device that
  starts a book's sync and on the one that joins it, so a code carries no
  deployment's address and whoever runs their own relay hands codes on like
  anyone. The relay never sees the secret.
- **A round** (`application/sync`): what the line has past this device's
  place in it is opened and taken in, then what the book has that the line
  has not is sealed and put on its end. Taking in runs inside the book's
  hledger turn (`BookSession.fold`): the book's unsent commits are taken back
  off its files, the line's commits made, the unsent ones made again on top,
  and the files that leaves kept only if hledger reads them.
- **Merging** (`core/sync`): a commit made again merges what it changed into
  what the line left, line by line. Entries two devices appended to one
  journal are both kept, the line's first; the same line added by both is
  added once; a line both rewrote differently is a conflict, and the round
  stops with both books as they were. No conflict is settled by guessing.
- **Settling a conflict** (設定 → 同期): the two texts are laid out as they
  come together (`mergeOutline`), each stretch both rewrote set apart with
  its two sides, and a person picks one for each. The line's commits are
  then taken in, this device's unsent commits made again on them with the
  line's standing wherever they met, and one more commit
  (`conflict-settled`) puts the picked sides in place — so what was chosen
  is itself in the history, and reaches the other devices like any change.
  A line or a book that moved since the conflict was shown is looked at
  again, never settled blind.
- **History** says which commits are on the line (`unsent`, `reconcile`,
  `sent`). A book older than the `commits` store is given a first commit of
  what it held before any was kept, so its line can be made from nothing.
- **Joining** reads the line whole, makes its commits in order from nothing,
  and puts the book they leave on the device.
- A round runs when the app opens, a little after each write, when the
  device comes back online, and when asked (設定 → 同期).
- **A commit is small.** A change keeps what it did to each file as a patch
  (`core/change/patch`): the lines it took away and the lines it put in,
  where — never the file whole, twice. A play recorded is its entry and its
  log, a kilobyte or so however long the journal has grown, kept that way in
  history and sent that way. A patch is made, and taken back, only on the
  text it was written against. The one large commit is a book's first, which
  holds all it had; the relay takes a commit up to 2 MB.
- **What one address may ask** of the relay is held to a limit a minute
  (`apps/relay/src/limits`, Workers rate-limiting bindings as the API's
  are): readings, sendings, and sendings with a body over 32 kB, which only
  a book's first commits are, more tightly. A request's body is read no
  further than 4 MB. A device told it has asked too much (`too-many`) is
  let through by a later round. The limits slow one address, roughly —
  Cloudflare counts near where a request lands and reconciles after — and
  nothing caps what a line may come to hold while it is used.
- **A line is kept while it is used.** The relay only carries commits
  between a book's devices, each of which keeps the book, so a line nobody
  has read or added to for `LINE_IDLE_DAYS` (7) is let go whole, its
  commits with it, by a daily cron (`letGoOfIdleLines`); a line's last use
  is written at most once a day. Nothing says so on a device. A line says
  when it was begun (`begunAt`), and a link keeps it beside its cursor: a
  device that finds its line gone, shorter than where it had come to, or
  begun at another moment counts none of its commits as on the line
  (`HistoryPort.unsend`) and meets it from its start — putting its whole
  history there, as many commits a request as the relay takes, where the
  line is gone, and where another device made it again, taking that line
  in as it would one whose answers were lost: a commit both hold is the
  line's, and what only this device has goes on top.

## The day's plays

The live space lists the day's plays (本日の稼働), not only those still
being played (`loadTodaysPlays`). The day is the business day, which turns
at the hour set: a parlor shuts at 22:40 and its plays are looked over
after midnight, still today's.

- **A recorded play stays** for its day, marked (`PlayDraft.recorded`),
  its log still to be set right; recorded again (`finishPlay`), its entry
  and its log in the book are replaced by what it now comes to, never
  added beside them. It leaves the list once its day is past — it is in
  its book — which is when a play's draft ends.
- **A play not recorded stays** however old, and is marked as left over
  from a day before (`isLeftOver`).
- **A play keeps its own history** (`PlayDraft.history`, `withOperation`):
  every change of its log, with the lines taken away and put in, written at
  the one place a draft is kept (`keepingHistory`) so that no way of
  changing a log goes unrecorded. It is not the book's activity log, which
  a play still to be recorded is no part of. It goes wherever the play is
  sent and is shown to whoever receives it — what was done after the play
  was said to be over set apart (`afterItEnded`) — and never on the device
  that keeps it, where it would only be in the way.

## Letting others into a book

A book's owner lets other people into it, each by a code of their own
(設定 → 同期 → 仲間を招待; `core/sync/invitation`, `application/invitations`).
There is no account over the books: whoever holds a line's secret is its
owner, and lets others in from there.

- **An invitation** is a token made for one person, the line's id and the
  key its commits are sealed with, and what the token may do — write, or
  only read. It gives no way back to the line's secret, so whoever holds one
  can neither let others in nor take the line over. The code is those four
  with dots between; a device keeps it where an owner's keeps the secret,
  and opens the line by it (`Sealer.keysOf` takes either).
- **A grant** is what the relay keeps of one (`grants`, by the hash of the
  token, as a line's own is): `GET` and `POST /lines/:line/grants` list and
  make them, `DELETE …/grants/:id` takes one away, all three the owner's
  token's alone. A viewer's token reads and is refused an append
  (`forbidden`); a token whose grant is gone opens nothing (`unauthorized`,
  `shut-out` on a device). The relay knows a person by a token and never by
  name.
- **Who was let in** is the owner's device's to remember (`InvitationStore`,
  `invitations` in IndexedDB): a name, the role, the code to hand over
  again. The names go nowhere, and a second device of the owner's does not
  have them.
- **On the device let in** the book is someone else's: its cover names this
  member an editor or a viewer (`roleBy`), which is what `BookSession.write`
  goes by, so a viewer's book takes no write. A round for a viewer takes in
  and sends nothing; and neither kind of invited device makes a line again
  where its relay let go of it — a line belongs to the token its first
  commits came with — but waits for the owner's.
- **A book's name is its owner's.** A write that gives the book another
  title — by its name's field, or by a hand in `main.journal` — needs the
  `rename` capability, which an owner has and an editor does not
  (`BookSession.write`). The name the owner gives is the name everyone let
  in sees. It is the app that holds an editor to this: the relay reads no
  commit, and cannot.
- **Sent as a message**: making an invitation copies what the person is to
  be sent — how to join, and their code (`invitationMessage`).
- **Let in only to send** (`sender`): a person who is shown nothing of the
  book and sends their own plays to its owner. A book has a second line
  beside its own, its **inbox**, drawn from the same secret with a key of
  its own (`Sealer.inboxKeysOf`); a sender's token may add to it and not
  read it, learning only where it ends. Their invitation carries the book's
  title, since they never see the book, and is kept on their device as a
  destination (`DestinationStore`), with no book. It has a place on the
  rail all the same (`destination`, by its inbox line), which opens the
  day's plays to send and nothing of the book.
- **A sent play** (`core/sync/sent-draft`, `sendDraft`) is one of the
  sender's day, as their device keeps it: its readings, where and on what
  it was played, what it is weighed by, and its history. Recorded or not
  makes no difference, and a play set right after it was sent is sent
  again. It names no book: which it goes into is its receiver's to say.
- **Taken in by itself** (`application/inbox`, `receiveArrivals`): after
  each round of syncing, what waits in the inboxes of the books this device
  owns joins its day's plays, each under the name its owner gave the token
  it came by, addressed to the book it was sent to and with its parlor's
  pool opened there. From then on it is a play of the day like the owner's
  own: its readings set right, recorded into that book or another
  (`moveDraft`). A play sent again takes the place of one left as it
  arrived; one the owner has changed or recorded is not written over, and
  the later sending is kept beside it for a choice (`takeSentAgain`,
  `keepOwn`). Nothing goes back to the sender. What was taken in is kept
  on the book's link (`inboxHandled`).
- **A relay that let go** of a book's lines has lost their grants too. The
  owner's device says again whom it let in (`restoreEveryGrant`), once each
  time the app is opened, after the lines are made again.
- **Taken back out**, a person keeps what their device already took, and
  receives nothing after. An invitation handed on to someone else lets that
  person in as the same grant: this is for people who know each other.

## Backup

A book is backed up by hand, as its hledger files, to somewhere the person
chooses. Nothing is ever sent on its own.

- **By hand only.** A backup is made when its button is pressed (設定 →
  バックアップ) and at no other time: not when the app opens, not after a
  write, not when the device comes back online. Sync carries a book between
  a person's devices by itself; a backup is theirs to make.
- **An archive** (`core/backup/archive`): a book's files exactly as they are
  kept, in a zip, beside one file that is not the book's — `manifest.json`,
  saying whose book it is, when it was taken and the archive's format. No
  journal includes it, so the zip unpacked is a book desktop hledger opens.
  It is not sealed: whoever holds it reads it, and the screen says so. It
  holds what was done to the book, since the activity log is one of the
  book's files, and none of the history: the commits, with the lines each
  change replaced, stay on the device and on the book's line.
- **Two destinations**, one archive. A **store** (`BackupStore`) keeps one
  archive a book, the newest in place of the one before: Google Drive is the
  one adapter, by the Drive API under the `drive.file` scope — the app sees
  only the files it made — signed in to by Google Identity Services' token
  model, which gives a token for an hour on a press and no way to renew it
  unasked. Google's script is loaded the first time a person signs in, never
  at startup, and the token is held in memory alone. A **file**
  (`Handover`) is the archive handed to the person to save wherever they
  choose: the share sheet on a phone or a tablet that takes it, a download
  everywhere else, and a download too where the sheet said it would take
  the file and then refused it, as an Android browser refuses a zip. That
  is how a backup reaches iCloud Drive — no web app can write there itself
  — and where it went is never learned.
  `VITE_GOOGLE_CLIENT_ID` names the deployment's OAuth client; a build
  without it backs up to a file only.
- **A receipt** (`core/backup/standing`) is what a backup leaves on the
  device, one a book: where it went, when, and the fingerprint — SHA-256 of
  the files by path — of what it held. A book **stands** against its last
  receipt as never backed up, changed since, or kept, by its files'
  fingerprint now; a book synced in from another device changes like one
  written here. No receipt is ever sent anywhere.
- **The note.** While a book on the device was never backed up the top bar
  says バックアップされていません, and while one has changed since
  バックアップ後の変更があります — a book never backed up said first. It is
  a word in the corner and a way to the backup screen, never a dialog, and
  nothing is sent because it showed. A narrow window's corner has no room
  for the words, so there it is the backup's mark alone, named by them.
- **Putting a book back** (`restoreFromStore`, `restoreFromFile`): only a
  book the device does not have. The archive is unpacked, its manifest read,
  and the book offered to hledger (`BookSession.adoptBook`); it is kept only
  if hledger reads it, with its files and no history, owned here by whoever
  uses the device, and it stands as kept by the backup it came from. A book
  already on the device is never written over or merged into: the screen
  says it is here.
- **Of no game.** `core/backup`, `backup/` and `application/backup` know a
  book as its files and its id and nothing of what it records, and only
  `backup/google-drive` knows Google; `tests/boundary.test.ts` holds both.

## Prize exchange

Savings exchanged at a parlor's counter are recorded from a pool's row
(貯玉・貯メダル → 交換払出; `core/savings/prize-exchange`,
`recordPrizeExchange`): how many tokens, what the special prizes handed
back are worth, and the day.

- **Prizes, never money.** A parlor gives prizes for tokens, and the book
  says what the parlor did: nothing in it says a prize became cash, and
  `資産:現金` does not move. What a person does with a prize afterwards is
  outside the book. The screen calls it 交換払出, its two figures 払出数
  and 特殊景品額.
- **No play, and no play's result.** The tokens were won or lost when they
  were played for, valued at their day's rate. An exchange is one entry
  tagged `savings: prize-exchange`: the tokens leave savings at the book's
  rate for the day (`@`), against `純資産:特殊景品` for what the special
  prizes are worth and `純資産:端玉景品` for what lies between — the sweets
  that tokens short of a special prize are given as. Both are equity, as an
  opening balance is, so no income statement counts either and no earlier
  figure moves. They are declared in a book the first time they are needed.
- **Never more than the pool holds** by the end of the day said: that is
  refused before anything is written.

## Setting a recorded play right

A play in the book is set right, or taken out, from its detail
(`application/revise-play`).

- **Read back from its entry** (`core/report/recorded-play`): the book
  keeps no second copy of what a form recorded, so the entry hledger read is
  turned back into the `PlayRecord` or `TalliedPlay` it was written from —
  the tokens rented are what savings gained less the revenue, and a
  replay's two counts follow. An entry that does not add up as one a record
  makes, one a hand has changed, is refused as unreadable and is set right
  in the book's own file.
- **Written anew where it stands** (`core/play/in-journal`): the entry is
  found by its `play-id` in `transactions.journal` and replaced, every
  other line as it was, in one commit (`play-revised`). The play keeps its
  id and its log. A rental is split at the book's rate for the day the play
  now says, as at recording.
- **Where and at what rate stay.** The parlor and the pool of a play in
  tokens are not the form's to change: that is another savings account, and
  the play is removed and recorded again. The book keeps no corner's terms,
  so a sum typed anew is counted in the proportion the play's own entry was
  — what its outlay rented, what its replay took — and typed as a count
  only where the play has no such proportion to give.
- **Taken out** (`removePlay`, `play-removed`): the entry leaves the
  journal with the blank line that set it apart. Its log stays among the
  book's files, and the history keeps the entry.

## Breakdown

A book's results by where they came from (集計, in a book's list;
`core/report/breakdown`, `application/breakdown`): grouped by machine,
parlor, day of the week, game, maker, year, month or day, each group with
what its plays made and what they were worth.

- **hledger groups and sums.** By a tag's values it is `--pivot`
  (`pivot` on a request): an income statement and a balance of theoretical
  values, each pivoted on `machine`, `parlor-id`, `game-kind` or
  `source-maker`, whose rows are the groups. By period it is the report
  interval (`interval`: `-Y`, `-M`, `-D`), whose columns are. Nothing is
  added up on the device but what hledger has no grouping for, below.
- **A pivot asks about accounts first.** `--pivot` puts a tag's value where
  an account was, after which "the postings of an income statement" cannot
  be asked. So the bindings pick the query's postings from the journal as it
  is, pivot those alone, and make the report over them with the query's
  dates (`balanceOver`).
- **Several tags, one after another.** A play is tied to the lists by one
  tag and says what another app called things by another: grouped by the
  first, what carries none of it is hledger's unnamed row, and that row
  alone is grouped again by the next (`byTags`). A parlor's group is named
  as the book names the id its plays carry.
- **The day of the week** is the one grouping hledger does not have: its
  daily report, each day its own sum, folded into seven (`byWeekday`).
- **Which grouping and which period are the address's**:
  `/books/:id/breakdown/weekday`, with `q` the period.

## Consolidation

Several books are read as one (連結, on the rail under the books, once
turned on; `application/consolidation`): the results of the books ticked,
for a period, grouped as one book's breakdown groups them — and, first,
book by book.

- **Each book's groups are its own, from hledger; one key from several
  books is those added** (`merged`). hledger holds one journal at a time,
  and nothing is valued again across books: two people who kept the same
  parlor at different rates each keep their own, and the total is the sum
  of what each book says, never of a journal made of both.
- **A space of its own**: `/consolidated` lists its views, as a book's
  address lists a book's; 集計 is the one there is.
- **Which books, which grouping and which period are the address's**:
  `/consolidated/breakdown/book` is every book on the device,
  `/consolidated/breakdown/machine/a,b` those named, `q` the period.
- **Out of sight until turned on** (設定 → 連結会計): most people keep one
  book, so the rail shows 連結 only on a device whose owner asked for it.
  The choice is a preference of the device; the address has its screen
  either way.
- **A book on the device, whoever keeps it**: one's own, or another
  person's that was joined by its code. Bringing another person's book onto
  a device is sync's doing; consolidation only reads what is there.

## Import

Plays kept in another app are taken into a book on a press (設定 →
インポート; `core/import`, `application/import`). pRecord's CSV is the one
source read.

- **A source's play** (`SourcePlay`) is the play as the other app kept it:
  the day, its parlor and machine by that app's names and codes, what went
  in and what came back in yen, a note. `core/import/precord` reads
  pRecord's CSV into these — its columns found by the names in the first
  row, as pRecord's own import reads them — and nothing of a file is taken
  in while any row of it does not read.
- **One entry in yen, both sides kept**: 投資額 as `費用:遊技`, 回収額 as
  `収益:遊技`, cash for what lies between. No savings move.
- **The lists' names and the source's are kept apart.** `parlor-id` and
  `machine` only ever hold a listed parlor and a catalogued machine, so an
  imported play carries tags of its own — `imported-from`, `source-parlor`,
  `source-parlor-code`, `source-machine`, `source-machine-code`,
  `source-maker` — and its description says the play as the source named
  it. `machine` and `game-kind` are written only where the source's machine
  name is the catalog's, and one game's alone; no parlor is named. A
  source's machine is tied to a catalogued one later by its name, loosely
  compared, and never by its code: another app's ids are not matched on.
  Neither that nor tying a parlor is built.
- **Taken in once.** A play's id is where it came from, its day and a
  digest of everything it says (`importedIdsOf`), so the same file taken in
  again writes nothing, and a longer one writes only what is new.
- **Not set right in a form**: a form holds neither the two sides nor the
  source's names, so an imported play is refused there as unreadable and is
  set right in the book's own file. It can be taken out.

## Export

A book is written out as a file on a press (設定 → エクスポート), two
ways, each handed over as a backup to a file is (`Handover`). The book
whole — a play's readings, the activity log — is a backup's to carry, and
is not written out here a second time.

- **One journal** (`core/export/single-journal`, `exportSingleJournal`):
  the main journal with every journal it includes written in where the
  `include` stood, under a comment naming it, nothing else altered. hledger
  opens it by itself and reads it to the same figures;
  `tests/hledger/export.test.ts` holds that.
- **A table of plays** (`core/export/play-table`, `exportPlayTable`): CSV,
  a play a row, newest first — 営業日, 店舗, 種別, 機種, 台番号, 投資, 回収,
  収支, 期待値. The three figures in yen are hledger's, from the play's own
  income statement with each posting at its own day's rate: 投資 its
  expenses (cash and savings alike), 回収 its revenue, 収支 its total, as
  the play's detail shows it. 期待値 is the amount written on the play, and
  an empty cell where none was. The column names are the file's format, as
  the account names are the journal's. The file opens with a byte order
  mark, which a spreadsheet needs to read it as UTF-8.
- **Together** (`exportTogether`): the ticked books' two files each, in
  one zip. A book is its id and not its title, so books of one title have
  the part of its id that is the moment it was made — a UUIDv7's first
  twelve digits, as written — in brackets after the title in their files'
  names. It is the files above, gathered,
  and no backup: nothing is put back from it.
- **Names** (`core/export/file-name`): a file is named for its book, what
  it is of, and the day it was written out, marked as that and joined by
  underscores: `帳簿_収支_2026-10-09_exported.csv`.

## Not built yet, with the boundary already in place

- **Git history**: `HistoryPort` keeps every commit in IndexedDB (`commits`),
  in the order made; a Git adapter replaces it without touching anything
  else. A book older than the store has files and no commits before it.
- **OPFS**: `BookStorage` is the port; IndexedDB is the only adapter.
- **Identities**: every device writes as one fixed local member. A person
  let into a book is told from its owner by their role on it, not by who
  made which change; a book is its keeper's by its name.
- **Theoretical value worked out live.**

## Glossary

| 日本語 | Code |
|---|---|
| 店舗 | parlor (`parlor-id`); a listed parlor in the parlor list |
| 貸玉レート / 交換率（千円あたり） / 再プレイ手数料 | rental / exchange / replay, a corner's `PlayTerms` |
| 4円・1円…（コーナーのレート） | tier; with the kind of token, a pool |
| 稼働 | play (`play-id`) |
| 営業日 | business day: the day a play belongs to, turning over at the hour set, 05:00 by default (`businessDayOf`) |
| 機種 / 台 / 台番号 | machine / cabinet / `cabinet-number` |
| パチンコ / スロット | `game-kind: pachinko \| slot` |
| 玉 / 枚 | ball / medal (`TokenKind`) |
| 貯玉・貯メダル | savings |
| 再プレイ | savings withdrawal (`withdrawal`) |
| 貸玉・貸メダル | rental |
| 貸玉差額 | rental spread |
| 交換率（1玉・1枚あたり） | exchange rate (`P`, `PricePoint`) |
| 投資 / 獲得 | outlay / payout |
| 期待値 | theoretical value |
| 手入力の稼働記録 | tallied play |
| 算出条件 / 計算根拠 / 期待値基礎値 | formula / grounds / basis |
| 解析値（パチスロの期待値基礎値） | basis (a pachislot formula's world) |
| 設定 / 設定配分 | setting level (`SettingLevel`, `settingLevels`) / setting distribution, the prior |
| 小役 / ボーナス / リプレイ / 単独・重複 | small win (role) / bonus / replay / parts of a bonus (`partOf`) |
| 機械割 / 差枚 / 合算 | payout rate / medals won or lost / combined bonus odds |
| 高設定期待度 / 期待設定 | the chance of a high setting level / the setting level averaged by its odds |
| AT / CZ | AT (`at`) / CZ (`cz`); either is the trigger (`trigger`) a regular game may bring |
| 初当たり / CZ合算 | first hit (`firstHit`): a published chance, ceilings included |
| CZ成功率 | success (`success`): a probability |
| 天井 / AT間天井 / スルー天井 | ceiling (`ceiling`) / AT ceiling (`atCeiling`) / misses (`misses`) |
| ベース | base (`base`): regular games fifty medals last |
| モード / 振り分け | mode / allotment (`allotment`, `resetAllotment`) |
| 液晶ゲーム数の加算 | LCD rate (`lcdRate`) |
| 設定変更（リセット） | setting change (`afterReset`) |
| 有利区間 / 有利区間の上限 | 有利区間 / cap (`cap`), counted from its lowest point |
| 引き戻し | window (`window`) |
| 完走 / 完走率 | completion (`completed`, `completion`) |
| 獲得の分布 / セット / 継続率 | payout law (`PayoutLaw`) / sets (`sets`) / continuation rate (`continuationRate`) |
| AT・CZの経過 | path (`Path`): legs ending going, missed or won-at |
| お気に入り / イチオシ / 検証済み / 利用回数 | favourite / adoption / verification / uses |
| 実収支 | actual |
| 回転数 / 回転率 | spins / spin performance (`spinPerformance`, spins per ¥1,000) |
| 通常時 | regular game (`regularGame`): where most of the play time is spent, never "normal" |
| 大当り確率・1Rトータル確率・トータル確率 | chance (`chance`, `hitChance`, `roundChanceOneIn`, `totalChanceOneIn`): how often a spin hits |
| 確率 | probability: any other event's, such as an allotment's share or reaching the 遊タイム |
| 外れる確率 | risk |
| 遊タイム | relief drive (`reliefDrive`): what the relief gauge brings once it holds its `gauge` of spins |
| 遊タイムまでの回転数 | relief gauge (`ReliefGauge`, `fills_gauge`) |
| ST | special time (`specialTime`) |
| 時短 | rapid mode (`rapid`): each spin is quick, at the regular game's chance |
| 保留 / 残保留 | queue / leftover queue (`leftoverQueue`, its `draws`); never "hold" |
| 確変（次回まで） | until hit (`untilHit`) |
| RUSH | rushing (`rushing`, its `continuationRate`) |
| LT（ラッキートリガー） | lucky trigger (`luckyTrigger`, `atCombo`) |
| 連チャン / N連目 | combo / combo N (`combo`, `averageCombo`); never "chain" |
| 回転が尽きて終わる | runout (`ModeKind::Runout`) |
| 電サポ / 電サポ増減率 | tulip support / its ball gain (not modelled yet) |
| 釘 | nail (nail width, nail route; not modelled yet) |
| 遊タイム狙い（ハイエナ） | hyena hunt (`hyenaHunt`, `hyena_hunt`) |
| 着席時データカウンター | initial spins (`initialSpins`): spins played by whoever sat there before |
| JSONL の1行 | checkpoint |
| 帳簿 / 共有グループ / 参加者 / 権限 | book / group / member / role |
