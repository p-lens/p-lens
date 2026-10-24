# 負荷テストの記録

連結（連結会計）を有効にした人が、たくさんの帳簿を何年分も持ったときに、アプリが落ちずに動くか、どれだけ時間がかかるかの記録です。
帳簿は `sample-book/core` の作成器で作った、それらしい収支です（機種と店は `tests/sample-book/fixtures.ts`）。

## まとめ

| 形 | 帳簿 | 収支 | hledger | 先読み（初回） | 総合「今年」の表示 | 落ちたか |
|---|---|---|---|---|---|---|
| 60 冊 × 1 人 × 10 年 ＋ マイ帳簿 | 61 | 329,157 | 1 台 | 1375.0 秒 | 1.28 秒 | 落ちない |
| 同上 | 61 | 329,157 | 4 台 | 660.4 秒（2.1 倍） | 1.29 秒 | 落ちない |
| 60 冊 × 1 人 × 6 年 ＋ マイ帳簿 | 61 | 197,686 | 1 台 | 895.7 秒 | 0.79 秒 | 落ちない |
| 同上 | 61 | 197,686 | 4 台 | 539.3 秒（1.7 倍） | 1.09 秒 | 落ちない |
| 12 冊 × 5 人 × 6 年 ＋ マイ帳簿 ※ | 13 | 197,373 | 1 台 | 1179.3 秒 | 0.70 秒 | 落ちない |
| 同上 ※ | 13 | 197,373 | 3 台 | 582.6 秒（2.0 倍） | 0.74 秒 | 落ちない |
| 16 冊 × 1 人 × 10 年 ＋ マイ帳簿 ※ | 17 | 87,463 | 1 台 | 500.7 秒 | -- | 落ちない |
| 同上 ※ | 17 | 87,463 | 3 台 | 267.5 秒（1.9 倍） | -- | 落ちない |

※ 先読みで帳簿の一覧を一度だけ読むように直す前（下の「直す前と後」）に量った値です。冊数が少ないので、直したことの効き目は小さいはずです。

- どの形も最後まで答えが出て、落ちませんでした。60 人 6 年分（約 20 万件）は、12 冊 × 5 人でも 60 冊 × 1 人でも動きます。60 冊 × 10 年（約 33 万件）も動きます。
- hledger を増やすと、先読みは速くなります（3〜4 台で 1.7〜2 倍）。CPU が 8 コアでも、ページ自身と各 hledger の間で取り合うので、台数そのままの倍率にはなりません。
- 先読みが済んでしまえば、総合の「今年」は 1 秒ほどで出ます。先読みが長いのは、端末で初めて全部の帳簿の全部の問いに答えるときだけです。

## 直す前と後

初めに 60 冊 × 1 人を量ったとき、4 台（1814.3 秒）が 1 台（1653.2 秒）より 1 割遅くなりました。
先読みは 1 冊に 1 問ずつ聞くたびに帳簿の一覧を読み直していて、一覧を読むことは端末から全部の帳簿を読むことなので、冊数の 2 乗で手間が増えていました。
それがページの 1 本のスレッドに積もるので、hledger を増やしても効かず、取り合う分だけ遅くなっていました（3 冊で 34 回読んでいました）。

一覧は先読みの初めに一度だけ読むように直しました（`warmConsolidation`、`tests/hledger/consolidation.test.ts` の「lists the books once」）。

| 60 冊 × 1 人 | 直す前 | 直した後 |
|---|---|---|
| 1 台 | 1653.2 秒 | 895.7 秒 |
| 4 台 | 1814.3 秒 | 539.3 秒 |

直す前の 4 台では、タブのメモリが最大 4.7 GB に達し、端末のスワップ（kswapd）が動いていました。

## 落ちるかどうかの余裕

60 冊 × 4 台（直す前）のとき、タブ（レンダラ）のメモリは最大で約 4.7 GB、1 台では約 3.1 GB でした（`ps` の RSS を 5 秒ごとに見た最大値）。直した後の 4 台でも、量っている途中で約 3.1 GB ありました。60 冊 × 10 年では、4 台で最大約 3.0 GB、1 台で約 1.4 GB でした。
試した端末は 16 GB なので余裕がありますが、メモリの少ない端末では足りない数字です。

- hledger の台数は端末のメモリで抑えています（`consolidation/lanes/lanes-plan.ts`：1 台 2 GB、メモリを言わない端末は 2 台まで）。ただし 8 GB と言う端末でも 4 台まで動くので、60 冊ほどあると 8 GB の端末では足りなくなる恐れがあります。
- 複数の hledger が動いている間に落ちたときは、次に開いたときに一度だけ知らせ、バックアップを勧め、そのページは 1 台で読みます（`consolidation/lanes/work-mark.ts`、`StoppedNotice`）。

## 量った端末

- Linux x86_64、8 コア、16 GB
- Chrome 155（`navigator.hardwareConcurrency` 8、`navigator.deviceMemory` 16）
- `bun run dev`（vite の開発サーバ、`http://localhost:8136`）。本番のビルドではありません
- 量った日：2026-10-19

## 量ったもの

`application/consolidation.ts` の `warmConsolidation`（先読み）を、何も覚えていない状態から最後まで流した時間です。

- 答えはメモリだけに覚えさせました（`createMemorySummaries`）。端末に覚えた答えは使わないので、どの回も「端末で初めて」の時間です。
- 先読みの期間は、総合の「今年」（`date:2025-01-01..2026-01-01`）と月（`date:2025-06`、`date:2025-06-01..2025-07-01`）。そのあと毎日の問い。
- 「総合『今年』の表示」は、先読みのあとで `loadConsolidatedOverall` を `answering: "at-once"` で聞いて、答えが返るまでの時間です。全部の帳簿の答えが揃ったことも確かめています（`answered`）。
- 1 台は `oneLane(services.session)`、複数台は `services.consolidation.lanes`（連結を有効にした状態で、`lanesFor` の決めた台数）。
- 1 回ごとにページを読み直してから量りました。量っている間、ほかの画面は触っていません。

## 量り方

### 帳簿を作る

`http://localhost:8136` を開き、開発者ツールのコンソールで次を流します（`window.__shape` を先に決める）。
作るのは 2019-07-01 から 2025-06-30 までの 6 年分です。1 人が 1 冊、`people` 人ぶんの収支を日付順に混ぜて 1 冊に入れます。

```js
window.__shape = { books: 12, people: 5 } // または { books: 60, people: 1 }
window.__made = { state: "running", started: performance.now(), progress: 0 };
(async () => {
  try {
    const { books: BOOKS, people: PEOPLE } = window.__shape
    const S = await import("/src/app/composition/services.ts")
    const B = await import("/src/sample-book/core/book.ts")
    const P = await import("/src/sample-book/core/parlors.ts")
    const D = await import("/src/sample-book/core/draws.ts")
    const F = await import("/tests/sample-book/fixtures.ts")
    const FB = await import("/src/app/composition/first-book.ts")
    const RT = await import("/src/application/record-tally.ts")
    const E = await import("/src/core/journal/entry.ts")
    const FI = await import("/src/core/journal/filing.ts")
    const L = await import("/src/core/journal/layout.ts")
    const services = S.createServices()
    const FROM = "2019-07-01", THROUGH = "2025-06-30"
    const dates = Array.from({ length: 48 }, (_, i) => `${2014 + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, "0")}-05`)
    const LINEUP = {
      pachinko: dates.filter((_, i) => i % 2 === 0).map((releasedOn, i) => ({ id: `p${i}`, name: `P機種${i}`, releasedOn, seat: F.PACHINKO_SEAT })),
      pachislot: dates.filter((_, i) => i % 2 === 1).map((releasedOn, i) => ({ id: `s${i}`, name: `S機種${i}`, releasedOn, seat: F.PACHISLOT_SEAT })),
    }
    const playsOf = (seed, parlors) => {
      const counter = { next: 0 }
      const order = { from: FROM, through: THROUGH, parlors, lineup: LINEUP, seed, playIdOn: (date) => `${seed}-${date}-${(counter.next += 1)}` }
      let making = B.makingOf(order)
      const entries = []
      while (!B.madeAll(making)) {
        const next = B.nextDayOf(order, making)
        if (!next.ok) throw new Error(JSON.stringify(next.error))
        making = next.value.making
        entries.push(...(next.value.day?.entries ?? []))
      }
      return { order, entries }
    }
    const made = []
    for (let index = 1; index <= BOOKS; index += 1) {
      const id = `shape${BOOKS}x${PEOPLE}-${String(index).padStart(2, "0")}`
      const parlors = P.sampleParlorsOf(F.PARLOR_LIST, undefined, FROM, THROUGH, D.drawsFrom(`${id}:parlors`))[0].parlors
      const plays = Array.from({ length: PEOPLE }, (_, person) => playsOf(`${id}-p${person + 1}`, parlors))
      const entries = plays.flatMap((each) => each.entries).toSorted((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
      const fresh = FB.firstBook(id, "local", `${PEOPLE}人${String(index).padStart(2, "0")}`)
      const opening = B.openingOf(plays[0].order)
      const withOpening = { ...fresh.files, [L.BOOK_FILES.accounts]: `${(fresh.files[L.BOOK_FILES.accounts] ?? "").replace(/\n*$/, "\n")}${opening.declarations}`, [L.BOOK_FILES.prices]: `${fresh.files[L.BOOK_FILES.prices] ?? ""}${opening.prices}` }
      const files = FI.withEntriesFiled(entries.reduce(RT.withAccountsFor, withOpening), entries.map((entry) => ({ date: entry.date, text: E.renderEntry(entry) })))
      const created = await services.session.createBook({ ...fresh, files })
      made.push([id, entries.length, created.ok])
      window.__made.progress = made.length
    }
    window.__made = { state: "done", seconds: (performance.now() - window.__made.started) / 1000, books: made.length, entries: made.reduce((sum, each) => sum + each[1], 0), allMade: made.every((each) => each[2]) }
  } catch (e) {
    window.__made = { state: "failed", error: String(e) }
  }
})()
```

12 冊 × 5 人は 16.0 秒、60 冊 × 1 人は 15.8 秒で作れました。10 年分は `FROM` を `"2015-07-01"` にして作ります（60 冊 × 1 人で 25.8 秒）。`window.__made` に結果が入ります。

### 量る

複数台で量るときは `localStorage.setItem("p-lens.consolidation-shown", "on")`、1 台のときは `localStorage.removeItem("p-lens.consolidation-shown")` をしてからページを読み直し、次を流します。

```js
window.__laned = true // 1 台なら false
window.__run = { state: "running" };
window.__measure = async (laned) => {
  const S = await import("/src/app/composition/services.ts")
  const C = await import("/src/application/consolidation.ts")
  const M = await import("/src/consolidation/memory/memory-summaries.ts")
  const Y = "date:2025-01-01..2026-01-01"
  const warming = { month: "date:2025-06", periods: [Y, "date:2025-06-01..2025-07-01"] }
  const services = S.createServices()
  const books = await services.session.books()
  const lanes = laned ? services.consolidation.lanes : C.oneLane(services.session)
  const ports = C.consolidationPorts({ ...services.consolidation, lanes, summaries: M.createMemorySummaries() })
  const started = performance.now()
  await C.warmConsolidation(ports, warming)
  const warmed = (performance.now() - started) / 1000
  const shown = performance.now()
  const overall = await C.loadConsolidatedOverall({ ...ports, answering: "at-once" }, undefined, Y)
  return { books: books.value.length, lanes: lanes.sessionsFor(books.value.length).length, warmSeconds: warmed, thisYearShownMs: performance.now() - shown, answered: overall.ok && overall.value.every((each) => each.read.ok) }
};
(async () => { try { window.__run = { state: "done", ...(await window.__measure(window.__laned)) } } catch (e) { window.__run = { state: "failed", error: String(e) } } })()
```

終わると `window.__run` に `{ state: "done", books, lanes, warmSeconds, thisYearShownMs, answered }` が入ります。
複数台で動いている間は `localStorage` の `p-lens.consolidation-at-work` に印（UNIX 秒）があり、終わると消えます。

メモリは別の端末から、タブのレンダラの RSS を 5 秒ごとに記録しました。

```sh
while ps -o rss= -p <レンダラの pid> >> rss.log; do sleep 5; done
```

### 片付け

量り終えたら、設定の「データの消去」で端末を空にします（コンソールなら `clearDevice(services.deviceData)`、`application/clear-device.ts`）。

## 参考：hledger 1 台、プロセス内（`bun test`）

ブラウザでなく `bun test` の中で本物の `hledger.wasm` を 1 台動かし、30 冊 × 10 年（164,372 件）を量った値です（0.8.1、答えのキーに率の日を入れたあと）。

| | 時間 | wasm のメモリ |
|---|---|---|
| 端末で初めての先読み | 384.8 秒 | 236 MB |
| 次の日の先読み | 12.4 秒（キーに率の日を入れる前は 118 秒） | 236 MB |
| 1 冊に書いたあとの先読み | 21.4 秒 | 236 MB |

覚えた答えが使える 2 回目からは、書いた帳簿と、今日で変わる問いだけを聞き直すので、初回よりずっと短く済みます。
