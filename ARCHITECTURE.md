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
   a balance, a total, a count — is stored. The container is the browser's,
   and a browser short of room clears a site's storage on its own unless it
   was asked to keep it: so the app asks (`keepStorage`, over
   `navigator.storage.persist()`), once a page, at the first write — a
   browser that puts the question to the person puts it as they save
   something. Whether it is granted is the browser's to say; a book cleared
   with its browser's data, or lost with its device, is back only from a
   backup or another device it is synced with.
2. **A write is kept only if hledger reads it.** Every change is offered to
   hledger, with `--strict` checks, before it is stored. A refusal leaves the
   book exactly as it was.
3. **What hledger can express is not reimplemented.** Periods are query dates,
   valuation is `--value`, sums are balance reports. No figure a book comes
   to is worked out here.
4. **Each parlor's tokens at each rental rate are their own commodity.**
   `玉(4円・マレハン東京皇国店)`, `玉(1円・マレハン東京皇国店)` and `玉(4円・723修羅の国店)`
   cannot be exchanged for each other, so they are different commodities,
   held as real assets.
5. **Exchange rates are only ever added.** A changed rate is a new `P` directive
   on a later day; past days keep the rate they had.
6. **A theoretical figure is never real.** The theoretical value (期待値) is
   an unbalanced virtual posting, `(統計:期待値)`, on an account with no
   type: hledger sums it when asked and leaves it out of every balanced
   report. Play time is kept the same way, `(統計:時間)` in `秒`: a
   statistic hledger adds up, never money.
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

A book is its journals, named in `core/journal/layout.ts` and
`core/journal/filing.ts`:

```text
main.journal               includes the others by name, never by pattern: the years in order, then transactions.journal
accounts.journal           commodity and account declarations; a parlor is declared here
prices.journal             P directives, only appended to
transactions/<year>.journal  one entry per tally, and the savings' own entries, each in its day's year
transactions.journal       entries not filed by year: what a hand, or an app from before the years, wrote
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
  about a tally looks for `play` — the part's word, data already written —
  and nothing else, whichever word the line has. A new part is added without touching the others, and a part a
  version does not know is passed over, its line read without it.

`BookSession` writes the line in the same commit as the change it tells of,
so neither is ever without the other; a book written before it kept a log
is given one on its next write, holding first what its history on that
device says was done until then, each line under its commit's id. Only
ever added to, so what two devices each added comes together as entries
appended to a journal do; a line whose id was already read is read once,
and a line that does not read is passed over, and told of: on the activity
screen beside what it shows, and among the book's unreadable files on its
row of the books (`unreadableFilesOf`). No journal includes it.

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
than nine, where a play added by hand is placed. It is written into the
settings of each of the person's own books (below), the device holding it
as last known (`preferences/`), and changes no play already recorded. Only the calendar's
own questions — whether a machine's release date can be — ask for the
calendar day.

The account tree is deliberately small:

```text
資産:現金
資産:貯玉:<parlor>:<rate>      tagged parlor-id, e.g. 資産:貯玉:マレハン東京皇国店:4円
資産:貯メダル:<parlor>:<rate>  tagged parlor-id
収益:遊技
費用:遊技
費用:貸玉差額
費用:貸メダル差額
費用:再プレイ手数料
費用:失効損                 savings a parlor took back, declared when a book first has one
純資産:開始残高             savings a person already had when the book began
純資産:残高調整             a pool's count put right to what the parlor says
純資産:特殊景品             what the special prizes of a prize exchange are worth
純資産:端玉景品             the rest of a prize exchange, in whole yen
純資産:換算調整勘定         the part of a yen a prize exchange leaves over
統計:期待値                 no type, virtual postings only
統計:時間                   seconds a play lasted, virtual postings only; declared with 秒 in every new book, and in an older one when it first has one
```

**The book is one timeline; the years are only where entries are kept.** An
entry goes into the file of its day's year (`withEntryFiled`), and the year's
file is included the moment it is first written. Nothing is written where one
year ends and the next begins — no closing and no carrying forward, in the
transactions or anywhere else, nor any entry that exists only when the app
reads the book — and any period is asked of hledger by its days, a balance by
its last: the whole book is the years one after another, read as it always
was. A tally set right stays where it stands while its day stays in that
file's year, and moves to its new year's file otherwise; one among the
transactions not filed by year stays there, a book being filed by year all
at once.

**hledger reads a book file by file** (`readPiecewise` in the bindings) where
its `main.journal` is nothing but comments, blank lines and includes by name:
each file parsed in the state the include would hand it, joined as the include
joins it, and the whole finalised and checked once, so the book is the one
hledger would read whole. Each file's latest parse is kept with its text and
that state and taken again while both are as they were, so a book written in
one year's file is parsed again in that file alone: a ten-year book opens
again after a write in 0.6s where it took 1.3s, the rest being the
finalising, which is the whole book's. Any other main journal is read whole,
as hledger reads it.

**A question about some days is asked of a view** (`core/journal/views`,
`application/book-views`), alone or consolidated, each reading use case saying
what it counts: the book's files with those of its transactions left
out where no entry of theirs can count — none within the days for what moved
(総合, a breakdown, the calendar, spin performances), none before their end
for what stood (savings, その他損益, whose revaluation counts what was held
when the days began). A file is judged by its entries' own days, never by its
name, and a book whose transactions hold anything the app does not write is
read whole. So a year's question reads that year's file, and is answered as
the whole book would answer it; every day reads the whole book, and so does
the overview, whose savings are those standing now whatever the period.

**A book is filed by year once, by the app, after the page's first sync
round** (`application/file-by-year`): each year's entries among
`transactions.journal` are moved into that year's file as they were written,
the oldest year first and at most two hundred entries a commit
(`year-filed`), which the activity tells, so that each fits the relay's box. A move is kept only where hledger reads the book after it, entry for
entry and account for account, as it did before. A book is left as it is
where its `transactions.journal` holds anything the app does not write — a
directive, a comment of a line's own, a day not written as the app writes
it, a posting with a day of its own — where this member may not write it,
or where it is synced and holds commits not yet on its line, so that what
two devices file is what both had and comes to the same commits.

Savings are set in two ways, both against equity so that neither is any
play's result: an opening balance, one entry tagged `savings: opening` kept
at the head of its year's file, and an adjustment, tagged
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

A book's savings (貯玉・貯メダル, `loadHoldings`) are every parlor's pools
until some parlors are chosen behind the funnel at the end of the 評価日
row, a tick to each parlor the book holds savings at: hledger is then asked
of those parlors' savings accounts alone (`savingsAtTerm`, by the names
the book keeps them under), so the total is its own over them. Which are
chosen is the address's last segment (`/books/:id/holdings/<parlor>,…`).

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
with widths, case, spaces and marks set aside (`parlorMatches`). The field
is the one a play typed in afterwards chooses its parlor in; nothing is
chosen for the person, where they are only ordering the list. Left empty,
or when the list cannot be read, the play has no parlor and is recorded by
its totals in yen; the start screen says so and carries on.

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

### One tally, one entry

```hledger
2026-09-05 マレハン東京皇国店 | 流星 123番台  ; play-id: …, parlor-id: malehan-tokyokoukoku, game-kind: pachinko, machine: 流星, cabinet-number: 123
    資産:現金                         -12000 JPY
    費用:貸玉差額                       1290 JPY
    費用:遊技                           3000 "玉(4円・マレハン東京皇国店)" @ 3.57 JPY
    資産:貯玉:マレハン東京皇国店:4円        4800 "玉(4円・マレハン東京皇国店)"
    収益:遊技                          -4800 "玉(4円・マレハン東京皇国店)"
    (統計:期待値)                       5500 JPY
```

- **The description** is hledger's `payee | note` (`describedBy`): the
  parlor is the payee, the machine and its cabinet the note, so `payee:`
  groups a book by parlor outside the app too. Savings entries are the
  same — `マレハン東京皇国店 | 景品交換` — and an imported tally's payee is the
  parlor as the other app named it. The bar is written always: a tally with
  no parlor is `| e風の剣豪`, its payee empty rather than its machine — a
  description with no bar is its own payee whole — and with no machine
  either it is the bar alone. The app reads
  neither side back — a parlor and a machine are read from tags — and an
  entry written before the bar was, or without it where a side was missing,
  is data already written.
- **Rental** splits the cash at that day's rate into tokens and a rental
  spread, a loss settled that day and never revalued. The tokens go
  straight to `費用:遊技`: rented tokens are shot, never saved, so cash
  played touches no savings account. A book written before this was settled
  has them put into savings and taken out again in the same entry, which
  comes to the same figures: it is data already written, and is read as it
  is.
- **Replay** moves tokens from savings to `費用:遊技`, in tokens only; what
  they come to in yen is hledger's to say at whichever date it is asked about.
  A replay takes more off savings than it pays out; the difference is written
  to `費用:再プレイ手数料`, also in tokens.
- **Payout** is the tokens left at the finish, earned and put back into savings.
  On screen they are the tokens in hand (持ち玉, 持ちメダル): the book puts
  them into savings whether or not they went to the counter.
- **Carried in** (`carriedIn`, 開始時の持ち玉) is the tokens a play was begun
  with in hand, brought from the play before. That play put them into
  savings as what it left, so this one takes them out again and spends
  them — `資産:貯玉 -1500`, `費用:遊技 1500` — with no fee, and the two plays
  together come to what the day did. The postings read as a replay's, so
  the entry's `carried-in` tag says how many they were. In a play's log
  they are what its first line counts in hand (`carriedInOf`), never a
  replay: the engine weighs them as the player's own balls.

What a recorded play left is kept on the device for its business day, its
parlor and its pool (`ui/features/live/tokens-in-hand`, a preference): the
day's next play started there is begun with them, written into its first
line, and they are then no longer kept. The start screen shows them
behind its small detail button (`DetailButton`, the sliders), marked while
a count is there, where they may be typed over or taken out before the
play begins. A play recorded again changes
them only while they are still its own to say.

No parlor is a place of its own for this: a play followed live with terms
and no parlor is recorded with the same two counts — those it was begun
with and those in hand as it finished — and leaves the latter for the day's
next play at no parlor and of that pool. The book keeps the tally of
such a play in yen alone, as ever, and no savings: what went into it is the cash spent
and the tokens it was begun with, at its terms' exchange, and what came
back is the tokens in hand at the finish (`sidesFromTokens`), so the plays of
a day at no parlor hand their tokens on, each one's takings the next one's
outlay, and come together to what the last left, exchanged, less all that
was spent. Where the person says the tokens in hand were exchanged at the
counter (「景品に交換した」 beside 「持ち越す（簿外）」), what came back is
the special prizes typed as given instead, and the odd prizes they leave
beside the count handed over (交換数, begun as the tokens in hand) at the
play's own exchange rate, worked out as a parlor's exchange's are
and none where the special prizes come to more (`off-book-exchanged`):
nobody counts the sweets; where the two cannot have been an exchange at
that rate — odd prizes below nothing or over ¥1,000 — the form says
so, and records it all the same. Nothing goes back to 簿外貯玉, and the tokens are not kept
for the day's next play.
- **Theoretical value** (期待値) is the virtual posting, written only when
  given: what the play was worth by its formula, whatever it came to.
- **Play time** (`(統計:時間)`, in `秒`) is a virtual posting too: the
  seconds a play lasted, from its clock where both its start and its
  finish are said (the finish on the day after where it is the earlier),
  else from the hours told of it to the nearest minute (hours are kept to a
  hundredth, 36 seconds, so 5時間20分 is 5.33 and comes back as 320
  minutes), and none where neither says. Kept in
  seconds so that a book's plays add up, over any period, in hledger. A
  tally set right writes it again from its clock and hours, never from
  the posting.

**評価損益 (a revaluation) is never written.** Savings are held in tokens,
a tally's result is its postings at their own day's rate, and savings are
valued at the rate in force when they are asked about: so when a parlor's
exchange rate changes, tokens already held are worth more or less, and no
tally's result moves. The tallies of a book then do not come to what its
prizes less its cash come to, and what lies between is the revaluation —
the tokens held on the day a rate changed, by how far it changed. Nothing
is entered for it and no account holds it (invariant 1: it follows from
the `P` lines and the savings a book already has, so it is asked, not
stored; a rate set right afterwards sets it right with no entry to undo,
and two devices cannot both write it). hledger works it out: the bindings'
`revaluation` report is `--valuechange --value=end` less what was posted
at `--value=then`, account by account, taken one from the other with
hledger's own amounts (`lessPosted`) — hledger's `--gain` sets value
against a posting's cost, and savings are posted with none. `loadOtherGains`
asks it of a period's savings; `revaluationOf` reads its total. On screen
it is 評価損益, a line of その他損益 (`OtherGains`) under 総合 (集計), a
book's or several books', and never part of 収支. その他損益 lists beside it 失効損, which 収支 does
hold, and is never summed, each line saying which it is. A rate seldom
changes and savings seldom lapse, so その他損益 is there only where there
is any. `tests/hledger/revaluation.test.ts` holds it
against the real hledger.

A tally can also be kept by its totals in yen alone (`YenTally`,
`composeYenTallyEntry`): what went in (投資額, `outlay`) to `費用:遊技`, what
came back (回収額, `takings`) from `収益:遊技`, and what lies between: a
loss out of `資産:現金`, a gain into `純資産:特殊景品` in whole yen, with the
part of a yen left over in `純資産:換算調整勘定`. So the income statement
counts it like any tally, both sides are kept and no savings move.

**Cash never rises.** Nothing the app writes puts a positive amount to
`資産:現金`: a parlor gives prizes, never money, so cash is spent and a gain
is prizes taken home, in equity. A test holds it
(`tests/core/cash-never-rises.test.ts`): every entry the app composes — the
tally of a play followed live, one typed in, one taken in from another app, a prize
exchange, savings opened or put right — in the cases where money came
back, and the files that name the cash account, so a new writer cannot be
added without being added there. A hand is held to it too: a file edited
raw is refused where the edit brings in a positive amount to `資産:現金`
(`cashRaisedBy`, asked of hledger before and after as the names are), and
says which entry. One a book already held is not the edit's doing and
stays. What a book brings with it whole — put back from a backup, synced
from another device — is taken as it is. The prize accounts are declared in a book
the first time an entry needs them (`withPrizesDeclaredFor`). The form asks for the two sides and shows their
difference, the result, which nobody types (`resultOfYenTally`); the
theoretical value is behind the form's detail button. A parlor is named
only if chosen; a side of nothing writes no posting.

```hledger
2026-10-04 | e風の剣豪  ; play-id: …, game-kind: pachinko, machine: e風の剣豪
    費用:遊技                          15000 JPY
    収益:遊技                          -3000 JPY
    資産:現金                         -12000 JPY
    (統計:期待値)                       8000 JPY
```

**Reading the signs.** A book opened in hledger looks upside down to anyone
who keeps household accounts, and is not. hledger writes a debit positive
and a credit negative, and a P-Lens book keeps two things out of it on
purpose: a wallet's balance, which would have the book follow every yen
spent elsewhere, and money coming back, which a parlor never gives.

- `資産:現金` starts at nothing and only falls. Its balance is negative:
  the cash brought in from outside the book and spent on play, all told —
  in the place of an owner's contribution (元入金, 事業主借), kept as an
  asset sunk below nothing rather than as equity.
- `純資産:特殊景品` and `純資産:端玉景品` only rise. Their balances are
  positive: the prizes taken out of the book, all told — in the place of
  an owner's drawings (引出金). A prize is no asset the book keeps, so a
  gain leaves it as prizes, and equity falls by them.
- `資産:貯玉` and `資産:貯メダル` hold what a parlor keeps for a person,
  positive in tokens and worth yen at the latest `P`.
- `収益:遊技` is negative and `費用:遊技` positive, as hledger keeps them.
  The result, 収支, is the income statement turned over: what came back
  less what went in.

So a book's result is the prizes taken home, plus the savings gained, less
the cash spent — the same figure the income statement comes to, and the
one the screens show. In `hledger bs` equity is shown turned over, so the
prizes there read as equity taken away; `hledger bal` shows them as taken
home. The screens never show a raw sign: 総合 says the cash spent and the
prizes taken home as amounts, and a result as won or lost.

An entry written while such a tally kept only its result has one side — a
loss all outlay, a gain all takings — and is read back as that; one that
put a gain to cash, as they then did, stays as it was written.

A whole tally is one entry so that it is one `JournalChange` and one commit,
and so that its play's log sits beside exactly one entry.

### Play logs

A JSONL file per play, each line a `Checkpoint`: running totals since the play
began (`spins`, optionally `outlay`, `at`, the parlor's `counter`, an `event`,
and, on a pachinko line folded from several readings, the `handsBefore`
it keeps).
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
counting covered. Pachinko logs read as before, but that a pachinko line's
counter may carry `counter.gauge`: what the cabinet's own 遊タイム counter
(遊カウンター) showed beside the data counter, where it was said.

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
Which cabinet it is at and which machine it is on are said anew the same
way (`changeCabinet`, from the cabinet's number across from the corner): a
play begun on the wrong model of a machine is put on the right one, not
begun again. Its log is then read as that machine reads it — a pachinko
play's jackpots left untold, since each named a bonus of the other
machine (`withJackpotsUntold`), to be said again reading by reading; a
pachislot play's counts kept where the new formula names them and let go
of where it does not (`readableBy`), since the engine refuses a count it
has no name for.

The parlor's data counter is typed as it reads. Readings count from an anchor:
the play's first point, whose counter still shows the previous player's spins,
or the last jackpot, where the counter starts over (`core/play-log/live.ts`).
A reading below what the counter should show means a jackpot went unrecorded;
the person can add it, as an `approximate` jackpot at the last known point. A
counter jackpot count above the log's is pointed out.

On a machine with a 遊タイム, the cabinet's own 遊タイム counter
(遊カウンター) is said where it shows otherwise than the data counter: a
遊タイム that ran out without a jackpot starts it over while the data
counter carries on. At the start, and as the seat is set right, it is
behind a small [遊] button after the counter field; while the play goes
on it is not asked for in a reading, being followed on its own, but shown
in the 遊タイム狙い beside its simulation, and typed there only where the
cabinet has come to show otherwise — kept as a line at the data counter
where it stands that says nothing else (`gaugeSaid`). Left empty, it is
the data counter. It is kept on the line where it was said
(`counter.gauge`), and the data counter's lead over it holds from there
until the next jackpot, written or found missing, when both start over
(`Before.gaugeOffset`, `gaugeNowOf`); merged readings carry it to the
merged line's counter. The 遊タイム狙い of the start and of a play in
progress is worked out from the spins toward the 遊タイム so found, never
from the data counter where the two differ; the engine is asked nothing
new, its initial spins being only ever the distance to the 遊タイム. The
button is marked while a count is typed or one said before is followed.

Live figures stop at spin performance. `performanceAcross` takes any two points,
so performance between points the person picks can be offered later.

Recording turns the draft into one entry and its play log in one change,
then deletes the draft; a record the book refuses keeps it.

- **The hand is what the person said.** A reading's 持ち玉 starts from
  the last count with what each bonus since paid (`standingBefore`), and
  the finish form's from the same (`heldAsToldOf`): the regular games
  played on it are never taken off by an estimate, so a drift is the
  person's to set right by counting, there or as the play is recorded.
  A count typed at a jackpot is the hand as the jackpot came, before its
  bonus paid, which is then in hand besides.
- **A purchase says the hand ran out, a jackpot does not.** A line where
  balls were rented or drawn had played all that came to hand by then,
  but a jackpot's may have come a few spins into what was bought there,
  so it knows no hand until it is counted (`consumptionOf`). Each line
  played in regular games shows its own stretch's spin performance, from
  the last point the hand was known at (`stretchPerformancesOf`): a folded
  line its whole run, and a jackpot's line the stretch closed by the first
  count after its bonus, `-----` until then.
- **The value follows the finish form.** What the play was worth is
  worked out from its log with the line it would finish on — the counter
  and the tokens in hand the form says (`theoreticalValueAtFinish`) — as
  the form opens and again once what is typed there stands still
  (`createFollowedWorth`, debounced); the line is written so as the play
  is recorded (`withFinish` with the hand), so the value recorded is the
  one the log comes to. A value the person types is theirs and is no
  longer written over. This is the finish forms' own (`live/`): adding or
  setting right a tally by hand never shares it.

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
| `core/` | pure domain: decimal, calendar, commodity, text, result, parlor, play, tally, play-log, live-play, valuation, theoretical, journal, report, book, access, change, backup, export, document, favorites, marks; the catalog's machine, catalog, formula (a formula's standing) and grounds (a proof read back); and each game's own, pachinko and pachislot | itself, `hledger/protocol/wire` types |
| `hledger/protocol/` | the wire format, mirroring `Bindings.hs`; worker messages | nothing |
| `hledger/query/` | hledger query terms and requests P-Lens writes | `core`, `hledger/protocol` |
| `hledger/client/` | the only way to the worker; one queue (`inTurn`) | `hledger/protocol`, `core/result` |
| `hledger/worker/` | the engine (WASI, one parsed journal) and the worker loop | `hledger/protocol` |
| `storage/`, `history/` | `port/` interfaces (books, drafts, history, whether the browser keeps what is stored); `browser/` or `adapters/` implementations | `core` |
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
| `consolidation/` | `port/` (each book's answers kept for the consolidation, keyed by a digest of its journals and the question, and for what stands as of today — savings and その他損益 with an open end — the last day on or before today the book sets a rate on (`lastRateDayOf`), so that it is asked again when a new rate comes into force rather than every day, since everything else counts each posting at its own day's rate and is the same answer whatever day it is asked on), `memory/` (kept in memory), `local/` (kept in IndexedDB, read back only by the build that kept it), `tiered/` (memory in front of IndexedDB), `absent/` (nothing kept: every answer asked of hledger), `web-crypto/` (the digest by the browser's cryptography), `lanes/` (more hledgers beside the one every screen reads on, for a consolidation of many books: one for three books or fewer, two from four, three from twelve and four from twenty, held to the device's cores beside the page's own and to two gigabytes of its memory each — two where it says nothing of it — started the first time wanted and only while the consolidation is on; and a mark kept on the device while it reads on several, taken away as the page is hidden or left, so that a page finding the mark tells once that the last one stopped at work, offers a backup, and reads on one); a personal book never goes through it, and a person with few books, or none consolidated, never has more than the one hledger. A screen is answered at once with what each book was last answered, and the book is read after: one found written since is asked again, and the screen told (`OutdatedNotice`) asks again too. A question about a period reads a view of each book, the files it can count (`core/journal/views`), as one book's own screens do. Books are dealt out among the lanes by their places, each read on the same hledger every time, and asking ahead deals them out alike. Asking ahead goes over the books twice, the periods most looked at first and every day after, each book asked everything of a round before the next, and waits for each book to be read | `core` |
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
(`--value=then|end,COMMODITY`) to balance reports, a `prices` report and a
`revaluation` report (two balance reports, one taken from the other), and
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
lists its tallies first, with a ＋ beside them to add one by hand.

The place is read off the address (`ui/navigation/place.ts`):

| Address | Place | Narrow focus |
|---|---|---|
| `/play` | plays in progress on this device | selection |
| `/play/new/{pachinko,slot}` | starting a play of a game | content |
| `/play/:play` | a play in progress | content |
| `/play/:play/record` | recording it into its book (収支を記帳) | content |
| `/play/:play/cabinet` | saying anew which cabinet and machine it is on | content |
| `/books/:book` | a book, no view chosen | selection |
| `/books/:book/{tallies,holdings,result-calendar,activity,files}?q=` | a view | content |
| `/books/:book/holdings/:parlors?q=` | a book's savings at the parlors named | content |
| `/books/:book/result-calendar/:senders` | a book's calendar of the tallies of those named among who played it | content |
| `/books/:book/breakdown/:by?q=` | a book's results taken as one (総合, by default) or grouped | content |
| `/books/:book/files/:path` | one of the book's files as kept, beside the list | detail |
| `/books/:book/tallies/new` | adding a tally by its totals (収支を追加) | content |
| `/books/:book/tallies/:play?q=` | a tally beside its list | detail |
| `/books/:book/tallies/:play/revise` | setting a tally right (収支の修正) | content |
| `/destinations/:line` | a book only sent to: the day's plays and how each stands with it (`deliveryOf`), in the side panel | selection |
| `/pachinko/machines?q=` | choosing a machine: a search bar over every machine, newest first | content |
| `/pachinko/machines/:machine` | a machine's formulas, ranked | content |
| `/pachinko/machines/:machine/formulas/:formula` | 算出条件: figures, marks, adopt, remake | content |
| `/pachinko/machines/:machine/formulas/:formula/grounds` | 計算根拠: the combo solved, the spread | content |
| `/pachinko/machines/:machine/formulas/:formula/basis` | 期待値基礎値: the spec values, verify | content |
| `/pachinko/formulas/new/{manual,basis}` | making a formula (and its machine, if new) | content |
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
content → selection. `/` is only the way in (`entranceOf`): it is replaced
by the first book on the rail, at its side panel with nothing of it opened,
or by `/play` on a device with no book.

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

A formula is made one of two ways — the tabs 手入力 and 基礎値から計算 —
and a machine is never stored without one. A third kind is only read:

- **manual**: the two figures typed in, checked elsewhere (semi-pros).
- **simulated**: a **期待値基礎値 (basis)** — the spec sheet's values and the
  payout conditions — run through the engine, which gives the figures exactly
  (pros). The basis keeps its normalised spec and schema version; its
  **計算根拠 (grounds)** are that stored combo solved again, with each state's
  contribution and the simulated spread.
- **sampled**: the same basis, its 1R トータル確率 estimated on the device by
  Monte Carlo (`estimateChunk`): so many cycles — regular play to a first
  jackpot and the combo after — from a seed, run in chunks in the engine's
  worker, counted as it goes and stoppable. It is no longer a way to make
  a formula. A sampled figure is an estimate of what the same basis comes
  to exactly, so it could only be held to that by a margin, and the margin
  was its sender's to state: a wide one let any figure by. The API takes
  manual and simulated formulas and refuses a sampled one, and the app
  sends none; one a catalog already holds is still read and shown as what
  it is. The sampling itself stays as a check, under the figures of
  基礎値から計算: it runs on the device, is set beside what the engine
  worked out, and makes nothing.

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
- **遊タイム狙い is sitting down at initial spins.** From the counter as it stands — the
  cabinet's 遊 counter where it shows otherwise than the data counter — play
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
  says its schema, and is solved as that schema. A formula keeps the
  `EngineVersion` that checked its figures (`engine_version`, none where
  nothing did), so those checked by an engine that has since come to other
  figures can be found.
- **A normalised shape changes in one of two ways, by what changes.** A value
  that moves without changing what it means — the machine's one value
  becoming each mode's, the old read as every mode's — keeps the schema: the
  old place stays, read and never written, and a spec with both is refused
  (a pachislot mode's スルー天井, `misses`). A value whose reading changes
  raises `SchemaVersion`, and a stored spec is read as its version says (a
  pachislot mode's AT間天井, shape 3: a mode a setting change enters holds it
  only until the first AT, which the machine's one never did).
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
- **The grounds are reasoned, then worded.** `core/pachinko/grounds` turns
  the spec as its sheet was written, the chain the engine made of it, what
  the engine solved and the figures the formula stores into Prolog facts —
  numbers only, a mode by its place, never a name someone typed; the
  reasoner — Trealla Prolog in its own worker, loaded the first time grounds
  are opened and cached like the engine — proves `grounds` from
  `reasoning/pachinko/grounds.pl` with a meta-interpreter that returns the
  proof tree: each rule applied, each fact given, each sum worked.
- **The engine is checked, not believed.** The reasoner does not solve the
  chain; it checks the engine's solution, which is the easier thing and
  proves as much. What the engine solved of each state is put into the
  state's own equation — its outcomes' shares of what each yields and leads
  to — and once every state can end, only the true solution satisfies them
  all. The chain itself is made again from the spec sheet, mode by mode, and
  set against the engine's; its shares are checked for a whole and its
  states for ever ending. With a 遊タイム the long run is checked the same
  way: the engine gives, from every point of a combo, the chance of each
  way regular play starts again, each of which must be its outcomes' shares
  of the chances where they lead; and a way's weight must be what flows
  into it from all of them. The two figures are then put together from that
  and checked against the engine's and against the ones stored, a sampled
  estimate within twice its margin. Every check ends in a verdict rather
  than failing, so a disagreement is shown, not hidden.
- **What is not checked is said.** A part that cannot be proved is
  attempted on its own and shown as unproved beside the others. A figure
  taken on the engine's word, or a check that checks nothing, is a remark
  (`unverified_…`): today, a sampled margin too wide to check by. What holds
  but is guessed to be out of the ordinary is a remark too (`odd_…`), and
  said on screen to be a guess: the rules say beside each what is known of
  it — the catalog's formulas, none of which showed it — and no more. `core/grounds`
  reads the proof back — a Prolog term and the proof tree it spells, of no
  game — and tells its findings apart by how they stand: held, failed,
  unverified, odd, unproved. `ui/wording/pachinko/grounds` alone turns it
  into sentences, the worst standing first.
- **Pachislot's grounds are reasoned the same way**, for an AT machine that
  says its 純増: `core/pachislot/grounds` gives the bet, the ベース, the
  純増 and, under each setting level, what the analysis sheet publishes —
  the 初当たり of the AT or of the CZ that brings it, the CZ's success rate,
  the AT's medals or the 機械割 they are to follow from — beside the
  engine's figures and the 機械割 stored. `reasoning/pachislot/grounds.pl`
  works a cycle's regular games from the published 初当たり — the triggers
  a cycle brings over it, whatever the ceilings, which the published figure
  already includes — the AT's medals from its payout, its sets or its
  table, or from the stated 機械割, and the 機械割 from those, each checked
  against the engine, the stored figure and the 機械割 stated; and the
  trigger's chance below its ceilings, which the engine read back from the
  published figure, is checked by the 初当たり it comes to when played
  forward. Where the sheet's figures alone do not say — a cycle an AT間天井
  cuts short, an AT's medals under the 有利区間's cap — the machine is
  played out in the reasoner by another way than the engine's: the chance
  play has lasted each game, each game resting only on games before it,
  where the engine convolves trigger upon trigger; and how often an AT
  starts from each sum held, worked upward from none, where the engine
  carries the 有利区間 on a round at a time. These sums are worked outside
  the proof and kept, since a proof comes to them many times. One thing is
  still the engine's and remarked on as unverified: an AT's medals under a
  cap where an AT may gain less than a window's games lose, which the
  working upward does not allow for — and, where the AT's medals follow
  from the 機械割, the share of ATs that reach the cap.
  `ui/wording/pachislot/grounds` words the proof. A machine without a 純増
  has nothing to reason and shows only what the engine solved.

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
  by any of them, katakana as hiragana, ヴ as the バ row (ブブブ finds ヴヴヴ)
  and widths, case, spaces and stars aside (`machineMatches`). The list shows the name in bold over the model
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
  comes to, each figure exactly: a sampled formula, whose figure could only
  be held to a margin its sender stated, is not taken (`sampling_json` is
  written by nothing now, and read for the ones stored before). It is
  accepted from the client in one case alone, below.
- **A pachislot formula too heavy to check is kept unchecked** (`checked`,
  served as `unchecked`; 検算なし on screen). The free plan gives a request
  a few milliseconds of CPU, and a spec of many modes crossed with many
  counts of misses takes far more to solve. So the API asks its engine
  calls for so many steps of work (`steps`; the engine's `budget` counts
  the steps its game-by-game walks take, and answers `too-heavy` past
  them — a step about as much time whatever the shape, a chain's game, a
  mode's own walk and a row of multiply-adds each spent at what it costs,
  timed at forty to sixty-five thousand steps a millisecond natively), never the browser's, which solve as far as they need. Answered
  too heavy, the app sends the formula again with the normalised spec its
  own device made (`basis.normalized`), showing for a few seconds that it
  is doing so, and the API stores that one, unchecked — but only when its
  own metered try comes out too heavy again: a light formula is checked
  whatever it is sent with. A 503 is taken the same way, a request that ran
  out of time looking just so. Every reader solves the stored spec on
  their own device, and anyone may verify or refute it as any other.
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
picked. The model name is what goes into a book (`bookNameOf`), and a
book is the only place it is the machine's name: a play names its machine
by it in the journal, and every screen that shows a play — the list of
plays, a play's details, the breakdown by machine, a play in progress and
the form one is started from — says the halls' name instead, looked up in
the catalog's machines by what the book says (`shownNameOf`, over the
names the app's context reads again after each write and delivery). A
play's details alone say the model name too, as 型式, dashes where the
catalog knows none. A name the catalog knows no machine under — typed by
hand, taken in from another app, or read before any catalog was delivered
— is shown as the book says it. The model name is the one name that is
nobody's choice of words — the same machine is one name in every book —
and the name a serious player knows it by. A machine registered before
every machine was asked for one goes into a book under the halls' name. A model
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
(`bonuses_json`);

**A bonus may be several jackpots.** A jackpot may open ten rounds and no
more, so a machine that pays 3,000 balls at a win gives two jackpots one
after the other, and a spec is written with the run as one share: 20R,
30R, or — where each jackpot of the run is drawn apart — every total from
10R to 50R, each of them five jackpots. A parlor's counter counts each
jackpot, so a share says how many its rounds are won over (`jackpots` on
an allotment's share, one where it says nothing), and that is never
worked out from the rounds: of the machines in the catalog a run of five
is anything from ten rounds to fifty, and one of four is as few as eight.
The engine counts them (`Reward.hits`), so the トータル確率 and the average
combo are the machine's own, and the figures a play is weighed by — the
rounds and their balls — are as they were. Two shares of the same rounds
won over a different number of jackpots are two bonuses; a formula's
bonus carries the number (`jackpots`, left out where it is one, so a
formula stated before any said one hashes as it did), the API holds it to
the basis with the rest, and a formula typed in types it. A play's line
keeps it with the bonus it names, and the jackpots a play records
(`liveSummary`) are their sum — which is what is set against the
counter's to say a jackpot was not written down. A formula stated before
this says one for every bonus, and its plays are warned as they were: it
is set right by stating a new formula from its basis, as any is.

Still of bonuses: the formulas registered before took their machine's
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
- **What is watched over a bonus is a watch and its cues.** A `watch` names
  the bonus it is watched over — a BIG's games for a スイカ, a REG's side
  lamp — `trials` the times each of the bonus gives it (one where left out),
  and a `cue` one thing it may show on a trial, with its `chance` per trial.
  None is a regular game's: cues never count towards the games played, and
  sit beside a table's events as its `cues`. A stretch watched a watch where
  it counts any of its cues, a cue counted none included. Where a trial shows
  a cue certainly under every setting level (a lamp's colours), the cues
  counted are weighed among themselves; otherwise every trial of the bonus
  counted in the stretch is weighed, those with no cue as showing none, and
  more cues than trials is `CuesExceedTrials`.
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
  on them. On a machine a CZ brings the AT on, a mode may have its own
  `misses` in place of the CZ's: a スルー天井 drawn after each AT — two,
  four or six — is a mode for each, its share the draw, and misses past a
  mode's スルー天井 rule it out where play is seen (`atRules.modes[].misses`;
  a spec stored with one `atRules.misses` has it read into every mode).
  A CZ may also come, once, on a game counted from the last AT
  (`sinceAtCeiling`): a bonus's ceiling that a bonus missing the AT does
  not start again. Every waiting trigger comes on that game; it needs an
  AT間天井 at it or beyond, so that a cycle ends. The grounds do not play
  such a cycle out: they take the engine's, and say it is unchecked.
  A setting change may shorten it — 979G from the AT, 579G after a reset:
  on a machine without modes the CZ's `resetSinceAtCeiling` is the
  ceiling of the mode a setting change plays, and makes one where nothing
  else would, never without a `sinceAtCeiling` beside it
  (`reset-since-at-ceiling-without-since-at-ceiling`). On a machine of
  modes a mode carries its own `sinceAtCeiling` in place of the CZ's, so
  a mode only a setting change enters holds the shorter one, and the CZ
  takes no `resetSinceAtCeiling` (`reset-since-at-ceiling-beside-modes`).
  Each mode's is held to its own AT間天井, and `ceilingWins` needs one,
  the CZ's or a mode's. An AT such a CZ wins where it certainly succeeds
  — at its bonus's share, where its success brings one — is won by the
  ceiling, in the hunt's `by_ceiling` as an AT間天井's or a スルー天井's is.
  A CZ may have a meter its failures fill (`meter`: 宿怨ポイント), whose
  `full` points make the next CZ certainly win the AT; each failure adds
  one of its `gains`, so many points at its share of failures under every
  setting, or nothing for the rest, and an AT empties it. How a meter
  fills depends on neither when a CZ comes nor how likely it is to win,
  so normalising works out for each setting the chance the CZ after so
  many failures since the AT comes with it full, among play that failed
  them all (`tables[].at.meterWins`, the last holding past it), and every
  walk takes a CZ's success after `j` failures as that chance or, short
  of it, the CZ's own — telling apart as many failures as the meter needs,
  as it does those a スルー天井 counts. Points a meter gains on other
  occasions — ハマり, a lost 連続演出 — are typed as part of a failure's
  gain. A gain's shares coming to more than the whole are refused
  (`meter-gains-over-whole`). The grounds take such a cycle from the engine
  and say so (`unverified_metered_cycle`); the formula editor writes it as
  「メーター満タン」 and 「CZ失敗で貯まる」 on the CZ.
  An AT a CZ brings may also be won outright (`direct`, a chance a regular
  game below the ceilings, under every setting level), drawn before the
  CZ: a cycle is the CZ's walk with each game reached only where none
  before it won outright — in closed form where no AT間天井 cuts it
  short — the CZ's 合算 still what is published, and the AT's 初当たり
  coming out of both. The grounds take that cycle from the engine too.
  Where the CZ's success brings a bonus, a game may bring that bonus
  outright too (`directBonus`, on the AT: a chance a regular game below
  the ceilings, under every setting; `direct-bonus-without-bonus-share`
  where no CZ brings a bonus) — drawn after the AT outright and before
  the CZ. It wins the AT at the bonus's share, so the table's `direct` is
  both together, `1 − (1 − direct)(1 − b·share)`, and its `directBonus`
  the bonus's chance of what the AT outright left; every walk, cycle and
  told leg takes the AT from there unchanged. Each such bonus pays the
  CZ's medals over its games where they are counted, the AT won or not:
  on every game that draws outright — all but an AT間天井's, a cycle's
  `games − on_ceiling` — at that chance, in the walk, the hunt and the
  機械割 (`AtFigure::direct_bonuses`). One that misses the AT leaves play
  where it stood: no CZ missed, nothing started again, the game's CZ still
  drawn as on any game. That is an approximation for a machine where such
  a bonus starts its counts again; the CZ's 合算 never counts these
  bonuses, and the chance read back from it absorbs the games they take.
  The grounds take how many a cycle brings from the engine and say so.
  Where the ceilings count the screen's games, `lcdRate` says how
  many the screen counts for each regular game, and the trigger's ceilings
  are taken that much sooner — on average, which the screen's additions are;
  the AT間天井 is counted in regular games. Where they count something
  else — points, 周期 — `ceilingUnit` names it and says how much of it a
  regular game comes to on average. A ceiling counted in it stands beside
  the one in games (`unitCeiling`, `resetUnitCeiling`; on a mode
  `atUnitCeiling`): on the trigger its ceiling, on an AT a CZ brings its
  AT間天井, and whichever comes first is the ceiling — 560G or 1000pt, 999G
  or 7 周期. Beside one, every `ceiling` counts games, on the screen where
  `lcdRate` says so. A spec with a unit and no ceiling counted in it is
  read as it was written before: its trigger's ceilings counted in the
  unit, never beside `lcdRate` (`ceiling-unit-beside-lcd-rate`); the
  editor types such a spec's ceilings again as the unit's. Either is an
  average, and the grounds say so, reasoning a machine with both from the
  ceilings in regular games the engine took.
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
- **A bonus that wins the AT at a share is the CZ.** A machine whose CZ
  brings a bonus and the bonus the AT — or whose bonuses win the AT at a
  share of their own — has the bonus as its `cz`: its 合算 the bonus
  初当たり, its `success` the share of bonuses that win the AT, its
  `ceiling` the ボーナス間天井 and its `misses` the bonuses missed before
  one wins it. It is marked a bonus by `bonus` beside `cz`
  (`atRules.triggerIsBonus`, which the screens and the grounds name it
  by). Its `payout` is what the bonus gains each time it comes, the AT won
  or not, and its `netPerGame` the games that takes, where they are known
  (`atRules.triggerPayout`); medals given mark it a bonus too. The 機械割 counts each cycle's bonuses
  besides its AT, so the AT's gain worked from it is the AT's alone; the
  walk and the hunt pay a bonus at its chance a game. An AT won on the
  AT間天井 is no bonus's and pays none — unless the AT間天井 brings the
  trigger, below — and a bonus's medals are not counted towards the
  有利区間's cap.
- **An AT間天井 may bring the trigger.** On many machines the AT間天井
  gives no AT outright but the trigger with the AT certain — BIRDIE WING's
  BB with its ST at 10 周期, 7 after a reset — and the published 合算
  counts those bonuses. The AT says so (`ceilingTriggers`, in the rules
  `atRules.ceilingAt`: `outright` where left out, `triggered`): every
  AT間天井 then, after an AT and after a setting change, in games or in
  the unit, a mode's own included, wins by a trigger that certainly wins.
  It is one of the cycle's triggers (`Cycle::ceiled` among `triggers`),
  so the 合算 the chance below the ceilings is read back from takes it in,
  and the chance comes out lower than it would where the ceiling's
  triggers were left out; and it pays the trigger's medals in full — a CZ
  on it certainly succeeds into its bonus, which certainly wins — in the
  cycle's 機械割, the walk, the hunt and the chain alike. Where the trigger
  it brings is a bonus of its own — BIRDIE WING's BB at its ceiling, about
  100 medals beside the 85 a trigger gains on average — the AT says what
  that one pays (`ceilingPayout`, in the rules `atRules.ceilingPayout`),
  its games counted at the trigger's 純増: only beside `ceilingTriggers`
  (`ceiling-payout-without-ceiling-triggers`) and a trigger that pays, and
  where it is left out the ceiling's trigger pays the trigger's medals as
  before. The grounds pay it so too. The AT on it is
  still the AT間天井's for the hunt's `by_ceiling` and a told history's
  legs. Only an AT a CZ brings may say so
  (`ceiling-triggers-without-cz`), and only beside an AT間天井. The grounds
  play the ceiling's triggers out with the rest where they play a cycle
  out, and take the engine's (`atFigure.ceilingTriggers`) where they take
  its cycle.
- **Zones are drawn on games counted from the AT.** A mode — or the CZ
  of a machine without modes — may have `gates`: regular games since the
  last AT (100G, 200G, a 周期 every so many games) on which play still
  going draws the trigger at one share and the AT outright at another,
  per setting, besides its chance a game. A zone of the whole trigger is
  `sinceAtCeiling`'s forced game; one of the AT is `direct` on that game.
  The walks, the hunt, a told history and a seat's weighing all draw on
  them game by game; a mode without an AT間天井 is then walked, twice as
  far each time, until next to nothing is left, as no closed form follows.
  The grounds take such a machine's cycle from the engine and say so. A
  zone may span games (`span`): its shares are drawn evenly over them, game
  by game — a 引き戻し of 66 games after each AT is a zone from game one,
  66 games long, whose AT share is the 引き戻し率, in each mode that draws
  it at its own rate.
- **A failed CZ may move play between modes.** A mode may say where a
  missed trigger in it moves play (`redraw`: each mode it may go to with
  its share, per setting, the whole of it) — the mode drawn again at each
  failed CZ, a まいるテーブル or a 規定ゲーム数 mode that climbs — and win
  the AT at a rate of its own (`success` on the mode: a 高確 after a failed
  CZ). Such a machine is walked as one chain (`chain`): every mode and
  every count of misses at once, game by game, each a stream of where its
  trigger's games began, a miss starting the next count spread over the
  modes it moves play to. A mode's AT間天井 wins whatever of play is in it
  on its game, and play moved into a mode past it the game after. The
  cycle, the arrivals, a seat's weighing, a told history and the hunt all
  take the chain; a walked path moves its modes at each miss. A machine
  whose modes all keep play and win at the CZ's rate comes to the same
  figures either way, which the tests hold. The grounds take such a
  machine's cycle from the engine and say so. A miss that came on its
  mode's ceiling may move play by a row of its own (`ceilingRedraw`): a
  ceiling CZ that shortens the next ceiling. A mode may draw the trigger at a
  chance of its own (`triggerChance`), in place of the one read back from
  the 合算, and be left once so many games since its trigger bring none
  (`expiry`: the games and the mode play moves to, its count since the
  trigger carried on there): a CZ連 is a mode a failed CZ moves play to,
  at 1/19.7 a game, left after 20 games for the mode it came from. The
  chain takes play that reaches a mode's expiry out before the game is
  drawn and holds it in the mode it moves to as many games since its
  trigger as it went; a walked path moves its modes the same way.
- **A bonus that misses the AT may start play again.** A CZ whose
  success brings a bonus may say so (`restart`): a bonus that misses the
  AT then starts play again as after an AT — its ceilings, its スルー天井
  and its modes counted from the bonus, ボーナス&AT間 — and the cycle is a
  stretch from an AT or such a bonus to the next, as many of them as it
  takes the AT to come: one stretch over the chance it ends in the AT. The
  hunt plays the stretch from the seat and adds, for each start again, what
  a stretch from a fresh start comes to over the starts it brings. Past
  the スルー天井 such a machine brings the bonus, not the AT. A CZ's
  ceiling counted from the AT — or the bonus — may certainly succeed
  (`ceilingWins`), it and any other CZ on its game. A play tells a failed
  CZ (`cz-missed`, a leg ending `missed`) from a bonus that missed the AT
  (`bonus-missed`, `bonus`), the live play giving each its tile where a
  CZ's success brings a bonus; a history told by its totals counts both as
  misses, and the engine walks it without starting again.
- **An AT間天井 may count across those bonuses.** Beside the ceilings a
  bonus starts again, a machine may have one it does not: 賞金首Angel's
  800G counted from each bonus and 1600G counted from the AT. The AT says
  so (`ceilingAcrossBonuses`, in the rules `atRules.ceilingAcrossBonuses`),
  in regular games from the AT — or the setting change — across every
  bonus that starts play again, and whichever AT間天井 comes first wins it,
  outright or by the trigger it brings as the others do. It needs a CZ
  that restarts (`ceiling-across-bonuses-without-restart`): elsewhere
  nothing starts again, and the AT間天井 is that ceiling already. One
  stretch over the chance it ends in the AT no longer holds, since the
  count goes on through each start again; so a stretch from a fresh start
  is walked once as far as that ceiling, and the stretches are laid where
  each begins, counted from the AT (`spread`) — each start again a fresh
  stretch moved on, as much of play as bonuses brought there — and cut at
  that ceiling, where whatever is still going wins the AT. The cycle, the
  arrivals and the hunt sum over them, which the tests hold against play
  walked state by state; with the ceiling out of reach the cycle is the
  stretch over its chance again. Where it is absent the figures are as they
  were. A walked path counts the games since the AT through each start
  again (`Standing::since_at_across_bonuses`), a history told by its
  totals has them as its games already, and a seat says them
  (`PathStart::since_at_across_bonuses`, from the last AT; where left out,
  no bonus came since and they are the games since the AT); the live play
  asks for them at the seat (「AT後の通算ゲーム数」 beside 「AT間のゲーム数」,
  shown only for such a machine, empty being the same as the games since
  the last bonus) and writes them on its first line
  (`counter.sinceAtAcrossBonuses`), carries them across each bonus, and its
  ceilings show the sooner. The grounds take such a machine's cycle from the engine, as any that starts
  again.
- **How an AT ended may allot the modes.** Many machines allot their
  modes after an AT by how it ended — スマスロパリピ孔明's 428G after an AT
  that ended at once, 1009G otherwise; L無職転生's shorter ceiling after a
  駆け抜け or a failed 魔術ボーナス. A way an AT ends is an entity of its
  own, marked by `ending`, which holds its share of ATs under each setting
  — every ending's together the whole, `endings-not-whole` otherwise — and
  named by its `label`: 駆け抜け 30%, それ以外 70%. A mode may say how often
  play enters it after an AT that ended a given way (`endingAllotment`, by
  the ending); an ending a mode says nothing of takes its `allotment`, so
  each ending's allotment over the modes must still be the whole
  (`ending-allotment-not-whole`). Where every mode is allotted after every
  ending, `allotment` says nothing they do not, and may be left out — on
  every mode together, `missing-component` otherwise — the endings' mix
  then standing for it, after a setting change too where no
  `resetAllotment` says otherwise; given, each mode's must be that mix to
  within a basis point (`allotment-against-endings`), and the editor asks
  for it only where some mode leaves an ending to it. Endings belong to a machine of modes of
  its own (`ending-without-modes`), an allotment after one the machine
  lacks is refused (`ending-allotment-to-unknown`), and so are endings no
  mode is allotted otherwise after (`endings-without-allotment`): they
  would say nothing. The rules list the endings (`atRules.endings`) and
  each table keeps every ending's share and allotment
  (`allotments.afterEndings`), with no change of shape — a stored spec
  without them reads as it did. Play after an AT not seen to end is in
  each mode as often as the endings' allotments weighed by their shares
  say, and that mix is `allotments.afterAt`: the cycle, the 合算 read back,
  the arrivals, the 機械割, the walk and the told history all take it, and
  where a machine has no endings nothing changes. That is an average: how
  an AT ended is taken to be independent of what it gained and of the
  mode it was won from, which the sheets do not say otherwise. A seat may
  say how the last AT ended (`PathStart::ending`, by its place among the
  rules' endings; at the boundary the ending's id, `unknown-ending` where
  the machine has endings and not that one, let go of where it has none):
  play is then weighed from that ending's
  allotment, in the walk and the chain alike, and a setting change since
  leaves it of no account. A walked path may say how each AT it saw ended
  (`AtSeen::ending`, the leg's `at.ending` at the boundary, checked as the
  seat's is): the games after it then start from that ending's allotment
  — mixed with the setting change's for the share that reached the cap,
  where the machine says so — and where it is not said they start from the
  mix exactly as before. A bonus that starts play again starts from the
  mix whatever the AT before it ended as. The editor types the endings on the AT — 「ATの
  終わり方」, a name and a share per setting — and each mode's allotment
  after each by the ending's name; the hunt table offers 「前のAT」, 指定なし
  being the mix, and says which ending its values assume. The grounds
  work the mix out from the sheet's figures (`allotted_by_ending`) and
  play the cycle out from it, as they do any allotment.
- **A CZ whose success brings a bonus keeps both stages.** Where a CZ
  succeeds into a bonus and the bonus wins the AT at a share of its own —
  CZ, then BIG, then the AT about half the time — the CZ keeps its 合算,
  its ceilings and its `success`, and `bonusShare` gives the bonus's share
  under each setting. Its `payout` and `netPerGame` are then the bonus's,
  paid each time a CZ succeeds. Normalising multiplies the two stages: the
  table's `success` is the CZ's success times the bonus's share, and its
  `paid` the share of CZs that pay the bonus's medals, the CZ's success;
  the cycle, the 機械割, the walk and the hunt take them as they take a
  bonus that is the trigger. A bonus missing the AT is a CZ missed, for
  the スルー天井 too. It is an average: a CZ won on its スルー天井 pays
  the bonus at the CZ's success, as any other does. Figures nobody
  publishes may be guessed by the person typing them in; the share left
  empty in the editor is every time.
- **A side bonus stands beside the trigger.** Some machines draw a bonus
  of their own beside the AT's trigger — 転生したら剣でした's フランボーナス
  — with its own ceiling in regular games since the last of it, which no
  AT starts again. It is an entity marked `sideBonus`, with its `chance`
  below that `ceiling` or its `firstHit` as published, the ceiling
  included (read back to the chance below it by halving:
  `first-hit-beyond-ceiling` where no chance can make it), its `payout`
  and, where its games are counted, its `netPerGame`; one at the most
  (`side-bonus-not-alone`), and only beside an AT
  (`side-bonus-without-at`). It wins nothing, and nothing of the AT
  machine's play turns on it, nor it on that play — its draw is taken as
  independent of the CZ's on the same game, the CZ's chance read back
  from its 合算 absorbing any overlap — so what it comes to is worked
  apart and added in, exactly: over a cycle, its bonuses are the cycle's
  regular games over the games between two of it (`(1 − (1 − p)^C) / p`),
  the long run a 機械割 is, which pay its medals and take its games in
  the 機械割 and the gain a stated 機械割 leaves the AT
  (`atRules.sideBonus`, each table's `sideChance`,
  `AtFigure::side_bonuses`). From a seat, each game brings it at the
  chance the games since the last of it make (`PathStart::since_side_bonus`,
  the hunt table's 「…後のG数」), played on game by game as a renewal; and
  where they are not said, at the long run's chance. The walk pays it over
  every game it walks, and the hunt over every game it is still played —
  exactly where play runs from the seat to the AT, or to an AT間天井
  counted across bonuses; where a bonus that misses the AT starts play
  again with no such ceiling, the stretches after a start again are paid at
  the long run's chance, where they fall from the seat not being kept: an
  approximation, a few medals in five hundred on a made-up machine. A play
  does not tell when the side bonus came, so a walked path never learns
  its phase. The grounds pay it closed form, check the 合算 the engine
  read back where the sheet publishes one, and leave nothing of it
  unchecked.
- **A seat the machine could not stand at is refused; one past a sure
  ceiling stands just short of it.** A seat is read against its machine
  before anything is walked from it — each of the hunt's seats, a path's
  start (`pachislot_engine::seat::seated`). It is refused by what makes it
  impossible: more games since the last CZ than since the last AT
  (`seat-trigger-above-since-at`), or fewer games since the AT itself than
  since the last bonus (`seat-across-bonuses-below-since-at`). A seat past
  a ceiling that certainly brings something is taken to stand at the game
  before it, so that what it brings comes on the next game, as an AT does
  past an AT間天井: a ceiling's `+α` is games the cabinet plays out before
  it shows, and a seat taken there is a seat people take. So it is with
  one at or past the game a ceiling counted from the AT, or from the last
  bonus that started play again, forces a CZ that certainly succeeds, or
  past such a game with no trigger since before it where the CZ is drawn
  as any other — in every mode its allotment reaches under some setting
  (past it with one since, it came and missed, and only the odds and the
  AT間天井 are left) — and with games since the side bonus at its ceiling
  or more. The games walked from such a seat are walked from that game, so
  a path that goes on past it without what it brings is contradictory
  evidence, as one past an AT間天井 is.
- **A seat may say the mode play is in.** Where the person knows it — the
  shortened ceiling after a ceiling CZ (頭文字D 2nd's 299G), a 天国 told on
  screen — the seat names the mode by its id (`mode`, chosen at the seat
  form as 「モード（分かれば）」 and in the hunt table as 「モード」, on a
  machine with more than one). The engine takes play to be all in it,
  whatever the allotment and the games since would have made likely, and a
  seat past its trigger's ceiling stands just short of it; a mode the
  machine lacks is `unknown-mode`. It is kept on the first line
  (`counter.mode`) and along the path until an AT, a bonus that starts play
  again, or a missed trigger on a machine whose misses may move play.
  Where only some modes are past such a CZ, they are ruled out and the
  others weighed. A field the machine has no use for is let go of,
  whatever it says: games across bonuses where no AT間天井 counts across
  them, games since a side bonus it lacks or that has no ceiling, and an
  ending on a machine that allots its modes alike after every AT. The hunt
  table offers no seat at or past a CZ that certainly succeeds, and holds
  the games since the side bonus below its ceiling; the seat form refuses
  games since the AT itself below those since the last bonus, asks for
  them only where the machine counts across bonuses, and a first line
  written before that is read with them raised to the games since the
  last bonus, as the engine once read them.
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
  Where a sheet gives the trigger's chance below its ceilings rather than
  its 合算 — Lタクトオーパス デスティニー's CZ at 1/333.8 a regular game —
  the CZ, or the AT won directly, has it as `chance` in place of
  `firstHit`, one of the two (`conflicting-components` otherwise), and the
  editor's 「天井を除いた確率」 writes it so. It is taken as it is, nothing
  read back, and the 合算 is the cycle's, worked out as any figure is; a
  figure too rare to be a 合算 under its ceiling, refused as
  `first-hit-beyond-ceiling` when given as one, is a fine chance below it.
  A side bonus is given either way too. With `firstHit`, nothing changes.
  The grounds check that the chance the engine played is the sheet's and
  play the cycle out from it.
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
- **Stock spreads.** Nobody registers a 設定配分 for most machines, and an
  even spread — a sixth of the cabinets at each level — is no parlor's
  day. So the app offers ten of its own for any machine
  (`STOCK_SPREADS`, `core/pachislot/prior`), each a reading of a kind of
  day — 回収日, three of 通常営業, three of イベント日, 新台導入週,
  グランドオープン — and one of a cabinet's standing, 全台系・対象台. They
  are made here, not taken from anywhere: an ordinary day mostly 1 with
  some 2 and seldom above 4, a day that gives back averaging near 2 with
  5 and 6 brought in, a day that collects nearly all 1. None gives a level
  nothing, so what a cabinet does can always argue it out of them. A play
  with no prior said starts on the harshest; a favourite 設定配分 or a
  choice by hand comes before it, and a play keeps the spread whole, as
  it keeps a 設定配分.
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
  anything. On a machine whose modes are allotted by how an AT ended, that
  form asks 「ATの終わり方」 — each ending by its name, or わからない — and
  keeps the ending's id on the event (`ending`); the timeline names it, the
  path carries it onto the AT's leg, and the ceilings and a hunt from where
  play stands reach only the modes that ending allots. Left unsaid, the
  line is as before. Where the AT間天井 counts across bonuses, the first
  line may give the games since the AT itself
  (`counter.sinceAtAcrossBonuses`). `core/pachislot/path` reads the log into the path the engine
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
- **Settling a conflict** (設定 → 端末の同期): the two texts are laid out as they
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
  device comes back online, and when asked (設定 → 端末の同期).
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
  is written at most once a day. Nothing says so on a device. Of a line
  let go the relay keeps whose it was and no more (`owners_kept`: its id
  and its token's hash), and takes the commits that make it again only
  with that token: everyone let into a line knows its id, a line belongs
  to the token its first commits came with, and an owner cannot move to
  another line while the book's secret stands — so a line anyone else made
  again would shut its owner out of syncing and sharing for good. A line
  never made is still made by whoever sends to it first, and one let go
  before the relay kept this has no owner kept. A line says
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
  was said to be over set apart (`afterItFinished`) — and never on the device
  that keeps it, where it would only be in the way.

## Letting others into a book

A book's owner lets other people into it, each by a code of their own
(設定 → 共有 → 仲間を招待; `core/sync/invitation`, `application/invitations`).
There is no account over the books: whoever holds a line's secret is its
owner, and lets others in from there.

To the person these are two things, whatever they share underneath, and
they are two screens. 端末の同期 is one's own books between one's own
devices: the book's own code, which is its key and is handed to nobody,
and the whole of how the last round went, a conflict settled there. 共有
is other people: who is let into each of one's books, the books one was
let into, the books one may only send plays to — and never a book's own
code. Each takes its own kind of code and turns the other's away with
where it goes (`kindOfCode`). A book not yet on its way is started as its
first invitation is opened, and 共有 says in a line how syncing stands,
since it rides on it.

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
  commits came with — but waits for the owner's. The relay holds them to
  it: a line let go is made again by its owner's token alone.
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
  (`moveDraft`). Its entry says who played it — `sender-id:` the
  invitation's id, which a person keeps however they are renamed, and
  `sender:` the name they had as it was recorded — so a book's plays are
  gathered by id and named by the latest entry; a person invited again is
  another id. A play of the owner's own says neither. A play sent again
  takes the place of one left as it arrived; one the owner has changed
  or recorded is not written over, and the later sending is kept beside
  it for a choice (`takeSentAgain`, `keepOwn`). Nothing goes back to the
  sender. What was taken in is kept on the book's link (`inboxHandled`).
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

## Savings shown

The savings screen shows a card a parlor, never in an order a person sets:
by the day the parlor's savings last moved, latest first (`loadLastMoved`,
`core/report/parlor-order`), alike days by name. Parlors holding nothing
are folded under the rest (残高0の店舗), and a name typed (店舗を検索, a row opened by the magnifying glass beside the funnel,
`namedLike`, the catalog's `searchKeyOf`) finds any of them, kept on screen
and never in the address or a book's settings.

## Passbook

A pool's savings are read day by day by pressing its row (貯玉・貯メダル),
in the detail pane (`passbook` place, `PassbookPanel`, `loadPassbook`,
`core/report/passbook`): each day its account moved or its rate was set,
newest first (a price that repeats the rate in force sets nothing, and is
not shown; the app writes none, `openingText` and `rateChangeLine` leaving
out a rate already in force), with the tokens taken out (払出), put in (預入) and left
(残高), and, pressed, what moved them, a tally by its machine and an
entry about savings by what it was. It is read from the entries that post
to the pool's account and the book's prices, and nothing is kept for it.

- **A parlor's passbook is in yen.** Pressing a parlor's heading opens
  every pool of it as one passbook (`parlor-passbook`,
  `ParlorPassbookPanel`, `loadParlorPassbook`): tokens of different pools
  are never added, so a day's row is in yen to two places — what came in
  and went out valued at the day's rate (a daily balance report split by
  `amt:>0` and `amt:<0`, `--value=then`), and what was held at the day's
  end at the rate then (a balance up to that day, `--value=end`, a
  question a day) — all of it hledger's arithmetic. Pressed, the day shows
  each pool's tokens and what moved them. A figure some token has no rate
  for is dashes.
- **A rate is a price line, and nothing more.** 交換率を変更 writes one
  `P` line for the pool's commodity from a day (`changeExchangeRate`,
  `core/savings/rate-change`, the `rate-changed` activity): the savings
  are valued at it from then on, and what they gained or lost by it is
  the revaluation hledger works out. A rate the day already has is left
  alone.

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
  that tokens short of a special prize are given as. All are equity, as an
  opening balance is, so no income statement counts any and no earlier
  figure moves. They are declared in a book the first time they are needed.
- **Prizes in whole yen.** A prize is worth whole yen; a token's rate is
  not. The odd prizes are what lies between to the nearest yen, and the
  part of a yen left over is written to `純資産:換算調整勘定`, the
  translation adjustment (`translationAdjustment`): equity too, named as
  the difference left by restating one unit in another is. A rental spread
  keeps its fraction, being a cost as large as it is.
- **Never more than the pool holds** by the end of the day said: that is
  refused before anything is written.

## Forfeiture

Savings a parlor took back are recorded from a pool's passbook
(貯玉・貯メダル → 通帳 → 失効, at its end; `core/savings/forfeiture`,
`recordForfeiture`): how many tokens — all the pool holds, until fewer
are said — and the day. Savings left past the day a parlor keeps them
to have lapsed; a membership withdrawn takes the card and what is on
it, a lapse of another kind. The tokens are gone either way, and the book
has one word for both: 失効, on screen and on the entry, written to
`費用:失効損` — a loss named as a book names one, 除却損, 減耗損.
It is for what a parlor took back and nothing else: savings a member of
a group made off with were not lost to the parlor, and the pool is put
right to what is there (残高調整).

```hledger
2026-10-04 マレハン東京皇国店 | 失効  ; parlor-id: malehan-tokyokoukoku, savings: forfeiture
    費用:失効損                        4000 "玉(4円・マレハン東京皇国店)"
    資産:貯玉:マレハン東京皇国店:4円      -4000 "玉(4円・マレハン東京皇国店)"
```

- It is an expense, in tokens only, as a replay's fee is: what it comes
  to in yen is hledger's to say at the rate of its day, and the income
  statement counts it — 実収支 falls by it, under its parlor.
- It is no play: it carries no `play-id`, stands under no machine, and
  is in no list of plays. Tokens taken from a person in the middle of a
  play are that play's, recorded with nothing left at its finish.
- Cash is not touched, and no prize is said to have been handed over.
- More than the pool holds by the end of the day said is refused.
- A book that recorded one in 0.2.9 or 0.2.10 has it under
  `費用:没収・失効`, as the account was first called: it is data already
  written, an expense like the other, and is counted as it stands.
- A pool put right to what the parlor says (残高調整) is another thing:
  the count was wrong, nothing was lost, and it is set against equity.

## A book's settings, and the order of books

What a book says of itself to the app, beside its journal, is one JSON file
among its files: `settings.json` (`core/book/settings`). No journal includes
it, so hledger never opens it; it is a file of the book's like any other, so
it is backed up with the book and synced with it, and nothing else has to
be. A field is written to a line. What a version of the app does not know
in it, it leaves as it found it. Two devices that each made it before
hearing of the other leave two objects run together, read as the later
says. A file that reads as neither, or a field of it this version reads
that does not read as it writes it, is told of on the book's row of the
books, and is never written over: the place and the hour wait until it is
put right by hand.

- **A book's place is its own.** Books are synced one at a time, each under
  its own key, so there is no file every book shares to hold a list of
  them. Each book instead holds `order`, its place among its owner's books,
  and the list is the books sorted by it (`inOrder`): those with a place,
  lowest first, then those with none as they came.
- **One order everywhere.** `BookSession.books` gives the books in that
  order and everything that lists books takes it from there — the rail,
  設定, the book in use (`bookInUse`, the first a person may write), the way
  in (`entranceOf`).
- **Swapped two at a time** (設定 → 帳簿の管理, the arrows at the edge between two of a
  person's own books; `swapWithNext`, `swappedWithNext`): a book changes
  places with the next of its owner's, the books are numbered from one as they then stand and the
  places that changed are written, each into its own book as one change
  (`book-placed`) — all of them the first time, two after that. A book's
  activity says nothing of it: where a book stands in a list changes
  nothing it records.
- **The hour a business day turns over at** is the person's, and their
  books carry it (`businessDayTurn`; `application/business-day-turn`): set
  in 設定 → 日付の区切り, it holds on the device at once and is written into
  each of their own books that does not say it already, as one change to
  each (`business-day-turn-set`) of which the activity says nothing. A
  device takes the hour from the first of the person's own books, in their
  order, that says one — as it opens, and whenever its books change — so a
  book put back from a backup or synced brings it along; where none says
  one the device keeps the hour it had. A book a person adds (`addBook`)
  says the device's hour from the start; the book a device with none is
  given does not, an hour nobody chose there being nothing to overrule the
  one a book put back later brings. Another person's book is neither
  written nor read for it.
- **What a press adds at a corner** is kept for good in the book a live
  play is kept in — the one said for it, else the book in use
  (`presses`; `application/presses`, `useCornerPresses`): by what the
  corner is called (`cornerOf`: `4円パチ`, `2円パチ`, `20円スロ`, `8円スロ`
  — the dearest rate it rents at or above, with its game), not by parlor
  or day, so every play at a corner of that rate starts from it. Each set
  is one change to the book (`presses-set`), of which the activity says
  nothing, and it is read, as the rest of the settings are, from a
  person's own books. It was kept before in the day's parlor setting on
  the device, and lost with the day; what is kept there is now left
  unread.
- **The terms a tally typed in by hand was weighed on** are kept in the
  book it was added to or set right in (`inferenceTerms`;
  `application/inference-terms`): one set for each game — balls and
  medals being no measure of each other — and not by corner, the last
  used. They are written once the tally is, where they read and are not
  what the book keeps already, as one change of their own
  (`inference-terms-set`) of which the activity says nothing; a tally
  written is never reported as refused for them. 収支を追加 opens on the
  book's terms for each game, else the usual ones; 収支の修正 on those the
  tally was weighed on, else the book's. They are read from the book
  whoever adds to it, and have nothing to do with a live play's terms
  (the start form and the day's parlor setting).
- **The owner's alone.** Only a person's own books are placed. On the
  device of someone let into a book its `order` is not read: where a book
  stands among another person's books says nothing of where it stands
  among one's own.
- **Two devices moving the same book** before they hear of each other have
  rewritten one line each their own way, which sync does not guess at: the
  round stops and the person picks, as for any such line.

## The result calendar

A book's results a month at a time, as a calendar (カレンダー in a book's
side panel, above 集計; `ui/features/result-calendar`): the month's 実収支
and 期待値 above, and under them each day with what its plays made. A day
with plays is pressed to see them, the plays list asked for that day.

- **A guest, kept whole in one folder.** The view, the laying out of a
  month in weeks, its words and its icons are all in
  `ui/features/result-calendar`, and its tests in `tests/ui/result-calendar`.
  Nothing imports it but a book's three lines: `"result-calendar"` among `BOOK_VIEWS`
  (`ui/navigation/place.ts`), its case in `bookViewFor`
  (`ui/features/shell/PLensScreen.tsx`) and its line in `VIEWS`
  (`ui/features/shell/BookSpaceSide.tsx`) — and the consolidation's own
  calendar, which is this one given several books' results added
  (`ConsolidatedResultCalendarView`, with its place, its case in
  `PLensScreen` and its line in `ConsolidatedSide`). Taking it out is
  deleting the two folders, those lines and this section. Unlike every other
  screen it keeps its own words and icons, for that reason alone.
- **hledger does every sum.** It has no report of its own: the days are the
  breakdown by day (`loadBreakdown(…, "day", …)`) and the month's two
  figures the breakdown by month, both asked with the one query that is the
  month (`monthQuery`). Where part of the month's theoretical value was
  inferred, how much is said under it — the breakdown's own figure
  (`Group.inferred`) — so a figure nobody measured is not taken for one
  somebody did. Nothing in the folder adds one figure to another;
  what it works out is which weekday a month begins on (`weeksOf`).
- **No theoretical values, no sum of them.** In a book with no theoretical
  value written anywhere in it (`keepsTheoreticalValues`, one entry asked
  of hledger over the whole book) the month's 期待値 says 集計なし, as the
  breakdown's rows do, never ¥0: nothing was said, which is not nought.
- **The month shown is the screen's own**, in no address: it opens on the
  month of the business day, whose cell wears a ring.
- **Whose tallies, where others play the book** (打った人): in a book any
  tally of which names a sender, a funnel at the end of the month's row
  chooses among the book's own tallies — those that name no sender,
  under the book's title as 打ち手別 has them — and each sender, by the
  name on their last tally. hledger is asked of theirs alone
  (`loadBreakdownOf`, `sendersTerm`): the chosen senders' ids, or, where
  the book's own are among them, every tally but the senders left out.
  Who is chosen is the address's last segment
  (`/books/:id/result-calendar/unsent,<sender id>`), as a consolidation's
  books are; a personal book has no funnel.

## Merging a play's readings

A play in progress gathers many lines — one for every press of the rental
button — and a run of them can be made one (`履歴をまとめる`). It is a
feature that stands apart, to be taken out whole if it is not kept:
`core/pachinko/merging` and `core/pachislot/merging`, the `onMerge` each
game's `Timeline` is given and the `merge` and `unmerge` beside it in each
`LivePlay`, the words under `MERGE_READINGS` in each game's
`ui/wording/…/play`, `ui/primitives/span-press`, `ConfirmPopover`, and a
toast's `action`. Each game's `revised` is exported for it alone.

- **Held and dragged** (`createSpanPress`): a reading held begins a run,
  which follows the pointer from row to row, the list scrolling on while
  the pointer is near an edge of what it scrolls in, or over the composer
  that stands across its foot. Nothing is merged by the dragging: letting
  go over more than one row asks beside the run, and a press anywhere else
  gives it up.
- **Only what may be made one.** A run goes as far as each reading joins
  the next (`mergeableSpan`) and no further, so the rows marked are always
  the rows that would be merged. In pachinko a run never passes a jackpot
  — one may only be its last line — nor a change of the cabinet's state,
  nor takes in a reading a jackpot nobody wrote down was admitted before.
  In pachislot it never passes a CZ missed or an AT won, an AT's result,
  or the line that began the counting; the taps between its readings stay.
- **No figure moves.** A pachinko run becomes its last reading with all
  that was rented, drawn and drifted over it (`withReadingsMerged`); a
  pachislot run becomes its last reading, which already says all the ones
  before it did (`withStepsMerged`). A pachinko play is measured between
  points that know what was in hand — its start, a count, balls bought as
  the hand ran out — so the one line keeps the points inside the run that
  the measuring may start or end at (`handsBefore`: the last before any
  regular game, and the last of all where the line itself knows nothing
  of the hand) and the last count where it counted nothing, which the
  hand is told from, each as the running totals there. What was bought by the
  last of them was bought there, not at the line. `consumptionOf`, the
  balls in hand as told and the play's totals come to the same
  before and after, which the tests hold over every run of many generated
  plays, folded again, written down and read back.
- **Taken back while its word stands.** The toast that says a run was
  merged stays until it is closed and carries 取り消す, which puts the log
  back as it was — unless the log has changed since, which is said and
  left alone. Once the toast is closed the lines between are gone: a play
  in progress is a draft, and has no history to bring them back from.
- **A play in progress only.** A recorded play's log is read, not merged.

## Setting a recorded tally right

A tally in the book is set right, or taken out, from its detail
(`application/revise-tally`).

- **Read back from its entry** (`core/report/recorded-tally`): the book
  keeps no second copy of what a form recorded, so the entry hledger read is
  turned back into the `TokenTally` or `YenTally` it was written from —
  the pool is the one of the parlor's whose tokens the entry is in, a
  replay took what was left less what savings came to hold more, it paid
  out that less its fee, and the tokens rented are the rest of what was
  spent — which reads an entry of either shape, rented tokens passed
  through savings or not. An entry that does not add up as one a form
  makes, one a hand has changed, is refused as unreadable and is set right
  in the book's own file.
- **Written anew where it stands** (`core/tally/in-journal`): the entry is
  found by its `play-id` in whichever file of the transactions holds it and
  replaced, every other line as it was — moved to its new year's file where
  its day moved to another year (`withTallyFiled`) — in one commit (`play-revised`, the word data
  already written). The tally keeps its id and its play's log. A rental
  is split at the book's rate for the day the tally now says, as at
  recording. A day before any rate the book has for the pool — a tally
  moved back past the day its pool was opened — is given the pool's first
  rate, written as a `P` directive in the same commit (`rateReachingBack`),
  rather than the tally refused: no day that had a rate is given another,
  and savings a tally so dated leaves short are the person's to adjust.
- **Where and at what rate stay.** The parlor and the pool of a tally in
  tokens are not the form's to change: that is another savings account, and
  the tally is removed and recorded again. The book keeps no corner's terms,
  so a sum typed anew is counted in the proportion the tally's own entry was
  — what its outlay rented, what its replay took — and typed as a count
  only where the tally has no such proportion to give.
- **Taken out** (`removeTally`, `play-removed`): the entry leaves the
  journal with the blank line that set it apart. Its play's log stays among
  the book's files, and the history keeps the entry.

## Breakdown

A book's results by where they came from (集計, in a book's list;
`core/report/breakdown`, `application/breakdown`): grouped by machine,
parlor, day of the week, game, year, month or day, each group with
what its plays made, what they were worth, and how long they were played
for.

- **hledger groups and sums.** By a tag's values it is `--pivot`
  (`pivot` on a request): an income statement, a balance of theoretical
  values, a balance of the inferred among them and a balance of
  `統計:時間`, each pivoted on `machine`, `parlor-id` or `game-kind`, whose
  rows are the groups. By period it is the report
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
- **Only tallies are grouped** (`tag:play-id` beside the period): an entry
  that is no play's — 失効損 — would otherwise be a group of no machine; it
  is said in その他損益 below instead.
- **The day of the week** is the one grouping hledger does not have: its
  daily report, each day its own sum, folded into seven (`byWeekday`).
- **Play time beside each group** (`Group.seconds`): the seconds its
  tallies kept, read from the same cut of `統計:時間` (`secondsIn`), shown
  in hours and minutes, `--` where none kept any. Whichever way a period
  is cut, the groups' seconds come to the same total.
- **その他損益 under every breakdown** (`OtherGains`, `loadOtherGains`,
  a book's or several books'): 失効損, which 収支 holds, and 評価損益,
  which it does not, a line to each and never summed, shown only where
  there is any.
- **Which grouping and which period are the address's**:
  `/books/:id/breakdown/weekday`, with `q` the period.
- **A period is two days and nothing else** (`ui/features/period`,
  `PeriodPicker`): the first and the last, both included, either left
  open, written into the address as hledger's `date:FROM..TO` with the day
  after the last (`rangeTerm`). 本日, 今月 and 今年 — counted from the
  business day — only fill the two fields in; one is marked while the
  fields say exactly its days, and pressed again it empties them, which is
  every day there is.
- **The plays list is narrowed by the same two days** (最近の収支): a funnel at the
  end of the count's row brings out a card above the list holding the same
  picker, and the period is written into that address as the same query.
  The card stays out until its cross is pressed, so the list is seen
  narrowing under it. While the list is narrowed the funnel is filled in
  and wears a dot. A day pressed in the result calendar goes to the plays
  of that day by the same query, so the card shows it.
- **By month, whole months; by year, whole years.** A grouping by month is
  asked about the days from the first of the month the period begins in to
  the last of the month it ends in, and by year from the first of January
  to the last of December (`queryFor`, `widened`), so a row is never the
  part of a month or year a period happened to cut. The fields keep the
  days typed, and a line under them says the days summed where they are
  more.

## Consolidation

Several books are read as one (連結, on the rail under the books, once
turned on; `application/consolidation`), in the views a book has for
reading it: the savings of the books ticked (貯玉・貯メダル), their results
a month at a time (カレンダー), and their results for a period grouped as
one book's breakdown groups them — and, first, book by book, and by who
played them (集計).

- **Each book's groups are its own, from hledger; one key from several
  books is those added** (`merged`). hledger holds one journal at a time,
  and nothing is valued again across books: two people who kept the same
  parlor at different rates each keep their own, and the total is the sum
  of what each book says, never of a journal made of both.
- **Each book is asked the same thing in turn** (`ConsolidatedBook<T>`):
  its groups, its holdings, whether it keeps theoretical values. A book
  that could not be read is said under its tick and left out of what is
  shown; the others stand.
- **Savings are book by book** (`loadConsolidatedHoldings`): each book's
  pools at its own rates and worth what hledger says of that book, the
  books' totals added above them (`totalAcross`). A parlor two books keep
  is in each as that book keeps it. They are only read there: a count is
  put right, and a prize exchange recorded, in the book whose it is.
- **The calendar is a book's, given the books' days added**
  (`ResultCalendar`, `mergedOf`): a day pressed goes to what each book
  made that day, there being no one list of several books' plays.
- **総合 first** (`/books/:book/breakdown/overall`, `/consolidated/breakdown/overall`,
  what both open on): a period's tallies taken as one (`loadOverall`).
  hledger finds the tallies, which are counted, and sums every figure: what
  they made over all, each tally on its own and each day on its own (an
  income statement pivoted on `play-id`, and one by day), what they were
  worth, what they took in (通算投資: the 費用 branch) and gave back
  (通算回収: the 収益 branch), each posting at its own day's rate — the one
  less the other being what they made — the loss on renting tokens
  (貸玉差額) and the fee on replaying them (再プレイ手数料), the time they
  were played for (通算時間, `統計:時間`; 集計なし where no entry keeps
  any), the cash spent, the special and odd prizes and the
  換算調整勘定 taken home, and the savings tallies drew on (`amt:<0` on
  the savings accounts, each at its own day's rate). The app counts
  tallies, days, and those that came out ahead, and divides for the
  averages. What is only added up is listed a line to each, as a trial
  balance is, under three heads — 稼働 (台数, 日数, 時間), 収支 (通算投資
  with うち貸玉差額 and うち再プレイ手数料, 通算回収, 通算収支, 通算期待値)
  and 現金と景品 (現金投資, 持ち玉投資 — what tallies drew from savings, which tokens in hand pass through as 貯玉 do — and 景品等合計 with its special
  prizes, odd prizes and 換算調整勘定 beneath) — side by side on a wide
  screen; what is worked out from it stands in tiles below. Every figure
  is in whole yen, never in 万 or 億, and a total's parts are rounded by
  the largest remainder (`apportioned`), so they add up to it as it is
  shown. Several books are added, a day played in two books one day its
  results added (`mergedOverall`).
- **By who played them** (打ち手別, `/consolidated/breakdown/sender`):
  each sender's tallies over every book added, by the `sender-id` they
  carry (`loadSenderBreakdown`), and named by the `sender` on their last
  tally in any book (`loadConsolidatedSenderNames`), whatever the period.
  A book's tallies that name no sender — its owner's own, and plays taken
  in before senders were written — stand apart under the book's title:
  six books' owners are six people, and no id says which is which.
- **No sum of theoretical values where none of the books keeps any**
  (`consolidationKeepsTheoreticalValues`), as in one book that keeps none.
- **A space of its own**: `/consolidated` lists its views, as a book's
  address lists a book's, and in a book's order.
- **The books chosen behind a funnel** (連結する帳簿, `ConsolidatedBooks`):
  an outline button at the right end of each view's first row — 切り口
  and the period in 集計, 今月 in the calendar, 評価日 in 貯玉・貯メダル —
  opens a popover with a tick to each book in the books' order, and a
  book that could not be read said under its tick. The funnel is hollow
  while every book is read, and filled with a dot at its top right while
  some are left out, as the plays list's is. It is the app's one filter
  (`TickFilter`, `ui/primitives/filter`), the same for a book's calendar
  and savings: a すべて選択 tick above the rest ticks every one or clears
  every one, and stands mixed while some are ticked, so out of many all
  can be cleared and a few ticked again.
- **Which books, which grouping and which period are the address's**:
  `/consolidated/breakdown/book` is every book on the device,
  `/consolidated/breakdown/machine/a,b` those named, `q` the period;
  `/consolidated/holdings/a,b` and `/consolidated/result-calendar/a,b`
  name their books the same way, each encoded on its own, and a comma
  alone names none. The books ticked go with a person from one view to
  the next (`consolidatedBooksOf`).
- **Out of sight until turned on** (設定 → 連結会計): most people keep one
  book, so the rail shows 連結 only on a device whose owner asked for it.
  The choice is a preference of the device; the address has its screen
  either way.
- **A book on the device, whoever keeps it**: one's own, or another
  person's that was joined by its code. Bringing another person's book onto
  a device is sync's doing; consolidation only reads what is there.

## Inference

A pachinko play typed in afterwards is weighed for what it was worth
(推定期待値), from what a person can tell of it: how long it lasted, the
cash it took and what came back.

- **The machine is played out, not solved** (`pachinko-simulator`'s
  `inference`, `inferenceChunk` at the boundary): each trial draws a spin
  performance from what is believed before looking, plays the machine's
  normalised spec for the play's hours at it — cash going in a lot at a
  time when the tray is empty, a jackpot taking the time its rounds do —
  and is weighed by how near its cash and its takings came to what was
  told, and its jackpots where those were told too. The
  spin performances of the trials that came near are the answer.
- **The figure to go by is the middle** (`Reading.middle` and
  `Reading.value`, the medians; `weighedOf`): one spin performance and one
  worth are shown, each as likely to be over the truth as under it, and
  each read from the trials themselves — the worth is the median of what
  each trial's own spins were worth at its own spin performance, never a
  figure worked out from the two beside it. One assumption is made about
  a cabinet, and said with its reason: it is believed a spin under its
  border beforehand, give or take a sixth of the border (`beliefOf`,
  `BELIEVED_UNDER`). A cabinet at its border pays back all that is put
  into it, and a parlor whose cabinets all did could not pay for its
  electricity, its staff or its rent — so its cabinets stand under the
  border by what keeping its doors open costs. One spin is that
  allowance, a round figure and not a measured one. No side is taken
  afterwards. The
  quartiles either side (`lower`, `upper`) are kept only to tell how much
  a play said. Played at fixed spin performances, the report shows a
  reading following the play about half as far as the play goes, toward
  the border: a cabinet four spins under is read as about two under, and
  one four over as about two over. Of the plays that are read, the median
  misses the true spin performance by about one spin and the true worth
  by two or three thousand yen — on plays the simulator made up, not on
  cabinets.
- **A play it cannot read is not given a figure** (`verdictOf`). One far
  out of the ordinary — fewer than one trial in a thousand went as far, in
  its cash, in what came back or in what the two came to (`Beyond`,
  `ANOMALY_ONE_IN`) — is reported as that, flatly, with how seldom a
  play as far out that way comes and which way it is (`Way`), or, where no
  trial went as far, only that it was not once played out; a trial that ran well past the hours told is no play of
  those hours and is not counted. One that told too little — too few
  trials came near it, or those that did say hardly more than was believed
  already, their quartiles more than eight tenths as far apart
  (`VAGUE_FROM`) — says so, and that its jackpots would help where they
  were not told. Neither writes an inferred value. The simulator's report
  (`inference::tests::report`, run by hand) is what the borders were read
  from: of plays drawn as they are believed to be, two to four in ten are
  read from their hours and two sides alone, and six to eight in ten with
  their jackpots told.
- **Played out again where the usual trials were not enough.** A play too
  few trials came near is given five times as many by hand
  (`TRIALS_BEYOND`), and a file's play as many as one typed in by hand,
  before it is said to tell too little — and the screen says that is what
  it is doing. Each run is a whole one from the play's seed, never one
  carried on from where another stopped, so what a play comes to does not
  depend on how a device happened to cut its chunks.
- **Begun by a press, and by nothing else** (`createWeighing`, 推定期待値):
  the button is always there on a pachinko play's form, beside what the
  play came to, and a press that cannot begin shows in red what stands in
  its way — the play's hours, its machine or the cash it took wanting, or
  a theoretical value typed in, which is the play's own and leaves nothing
  to infer — as a press to record shows what recording lacks. What was
  weighed is what the form said as it was pressed: once the form says
  anything else of the play, what the weighing came to is gone, and is
  asked for again by another press. A play recorded without the press is
  recorded without an inferred value. What a weighing may be told beside
  the form's own fields — the jackpots, the terms — is
  behind a button of its own beside the press (条件), its icon in the
  amateur colour: it is for anyone. A theoretical value typed in is behind
  another, beside the two sums, its icon in the semipro colour: it is for
  those who work their figures out themselves, and is recorded in place of
  an inference. The regular spins a counter shows are not asked for: a
  counter counts whoever sat there before as well.
- **The same play is weighed the same** (`seedOf`): the seed is the play's
  id hashed, so no weighing can be asked again for a kinder answer. Two
  million trials for a play typed in by hand (`TRIALS_BY_HAND`); the wait
  on screen, after the press, is the weighing itself.
- **Weighed by the best ranked formula made from a basis**
  (`weighableOf`), whatever a person keeps as a favourite: a machine with
  only typed figures has nothing to play out, and is not weighed. Where a
  formula says no spins an hour, 200 are taken (`PACE_BY_DEFAULT`), and
  the reading says that its pace was assumed.
- **The terms are typed as a corner states them** (`WeighingTerms`,
  `readWeighingTerms`): the balls ¥1,000 rents (貸玉(千円), whole) and the
  balls ¥100 of prizes takes (交換(100円), to two places: 27.5), as
  pachislot's medals are (貸枚(千円), 交換(100円)); a figure that is not
  more than none does not read, and a press shows it in red. They are
  ¥4 a ball, 250 to ¥1,000, exchanged at 28 until a person or the book says
  otherwise (`TERMS_BY_DEFAULT`), every ball taken as rented: the harsher
  of the common terms. The engine plays every play at 250 balls to
  ¥1,000 (`RENTED_PER_THOUSAND`); a corner renting more or fewer is the
  same play with its yen scaled by what it rents over 250 — four times
  at ¥1 a ball, 240/250 at 240 balls — its spin performance scaled the
  other way, and a ball worth ¥100 over the balls ¥100 takes.
- **Said wherever it is summed.** A breakdown's groups each carry how much
  of their theoretical value was inferred (`Group.inferred`, hledger's own
  sum of `統計:期待値:推定` cut as the other two reports are —
  `inferredCutRequest`), and a row of 集計, a month of the calendar and the
  consolidation's of both say `うち推定` with that figure where it is not
  nothing: a figure nobody measured is not taken for one somebody did.
- **Kept apart in the book, summed with the rest.** The value is a virtual
  posting to `統計:期待値:推定`, under the measured `統計:期待値`, so
  hledger sums the two when asked about the one and can always tell them
  apart; the account is declared the first time an entry needs it. What
  was told — `hours`, `jackpots` — and what the weighing
  stood on — `inferred-formula`, `token-rental`, `token-exchange` — are
  the entry's tags, so the play is read back as it was typed
  (`weighingTermsOf`): `token-rental` is the yen a ball rented for, to six
  places where ¥1,000 does not divide by the balls (4.166667 at 240), and
  `token-exchange` the balls ¥100 took. Tags written while the terms were
  chosen among a few — 4 or 1, and 25 to 33 or 100 to 132 — read back
  the same way. A
  theoretical value typed in is the play's, and nothing is inferred
  beside it.
- **A file taken in may be weighed too** (`importPrecord` with a
  `Weighing`; `hoursToldIn`): pRecord's 稼働時間 is read into a play's
  `hours`, and where a file's plays say theirs the person is asked, once,
  whether to weigh them. The pachinko plays of a machine the catalog has
  are then weighed one after another, 200,000 trials each
  (`TRIALS_ON_IMPORT`), on the usual terms, before the one commit that
  writes the file. A play that cannot be weighed is taken in as it would
  have been; the hours never enter a play's id, so a file taken in before
  its hours were read is still known for the same file. The hours are kept
  to the hundredth, as the other app said them — it writes two hours and
  twenty-five minutes as `2.4166667`.
- **A source's machine is the catalog's by what the machine goes by, or by
  what a person says** (`catalogueOf`, `Named`, `previewPrecord`): its
  name and its search words, as a search compares them, so one app's
  `e 東京喰種` is the catalog's `e東京喰種`; what two machines both go by
  names neither. A file is looked at before it is taken in, and the names
  no machine alone goes by are shown, each for the person to say which
  machine of the catalog it is — or to leave as written, which takes the
  play in with the source's name in its own tag, as before. Nothing of the
  other app's ids is matched on.
- **A play that took no cash is not weighed** (`takesCash`): one played on
  balls brought to it, carried from another cabinet or drawn from savings,
  says nothing of what its spins cost. And a trial is counted as going as
  far as a play give or take what counts as the same figure
  (`outlay_tolerance`, `takings_tolerance`): a person who lost tells of
  nothing coming back, where a trial ends with the last of a lot in its
  tray — held to the yen, every plain loss would be out of the ordinary.

## Import

Plays kept in another app are taken into a book on a press (設定 →
インポート; `core/import`, `application/import`). pRecord's CSV is the one
source read.

- **A source's tally** (`SourceTally`) is the tally as the other app kept it:
  the day, its parlor and machine by that app's names and codes, what went
  in and what came back in yen, a note. `core/import/precord` reads
  pRecord's CSV into these — its columns found by the names in the first
  row, as pRecord's own import reads them — and nothing of a file is taken
  in while any row of it does not read.
- **One entry in yen, both sides kept**: 投資額 as `費用:遊技`, 回収額 as
  `収益:遊技`, and what lies between as a play typed in by hand has it
  (`sidePostings`): a loss out of cash, a gain into `純資産:特殊景品`, never
  into cash. No savings move.
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
- **A table of tallies** (`core/export/tally-table`, `exportTallyTable`): CSV,
  a tally a row, newest first — 営業日, 店舗, 種別, 機種, 台番号, 投資, 回収,
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
| 稼働 | play (`PlayId`, `play-id`): what is played, followed live — the live space, its drafts and logs |
| ライブ計測 | the live space by name on screen: the rail, its list of the day's plays and its empty pane |
| 収支 | tally (`TokenTally`, `YenTally`): what a book keeps of a play, under its play's id — the list, its details and its forms |
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
| 投資額 / 回収額（円での収支） | outlay / takings of a `YenTally` |
| 期待値 | theoretical value |
| 手入力の収支 | a `YenTally` typed in by hand |
| 算出条件 / 計算根拠 / 期待値基礎値 | formula / grounds / basis |
| 解析値（パチスロの期待値基礎値） | basis (a pachislot formula's world) |
| 設定 / 設定配分 | setting level (`SettingLevel`, `settingLevels`) / setting distribution, the prior |
| 小役 / ボーナス / リプレイ / 単独・重複 | small win (role) / bonus / replay / parts of a bonus (`partOf`) |
| ボーナス中に見る場面 / 示唆（BIG中スイカ・サイドランプ） | watch (`watch`, its `trials`) / cue (`cue`), never a regular game's |
| 機械割 / 差枚 / 合算 | payout rate / medals won or lost / combined bonus odds |
| 高設定期待度 / 期待設定 | the chance of a high setting level / the setting level averaged by its odds |
| AT / CZ | AT (`at`) / CZ (`cz`); either is the trigger (`trigger`) a regular game may bring |
| 初当たり / CZ合算 | first hit (`firstHit`): a published chance, ceilings included |
| CZ成功率 | success (`success`): a probability |
| ボーナスからのAT率 | bonus share (`bonusShare`): on a CZ whose success brings a bonus |
| ゾーン / 規定ゲーム数 | gates (`gates`): games since the AT a mode draws at |
| CZ失敗後のモード移行 | redraw (`redraw`): where a missed trigger moves play |
| 天井CZ失敗後のモード移行 | ceiling redraw (`ceilingRedraw`): where a miss on the ceiling moves play |
| ボーナス&AT間・ATなしボーナスで数え直し | restart (`restart`, `bonusMiss: restarts`) |
| 天井CZ確定 | ceiling wins (`ceilingWins`, `forcedCz: wins`) |
| モードのCZ確率 / CZ連 | trigger chance (`triggerChance`), expiry (`expiry`) |
| 天井 / AT間天井 / スルー天井 | ceiling (`ceiling`) / AT ceiling (`atCeiling`) / misses (`misses`) |
| ベース | base (`base`): regular games fifty medals last |
| モード / 振り分け | mode / allotment (`allotment`, `resetAllotment`) |
| 液晶ゲーム数の加算 | LCD rate (`lcdRate`) |
| pt・周期で数える天井 | ceiling unit (`ceilingUnit`: a name and `perGame`) |
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
| 遊カウンター | the relief gauge as the cabinet shows it (`counter.gauge`, `gaugeNowOf`) |
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
