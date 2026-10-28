import { describe, expect, test } from "bun:test"
import { readdir, readFile } from "node:fs/promises"
import { relative } from "node:path"

import { SCREENS } from "../support/screens"

const WEB = new URL("../../", import.meta.url).pathname
const UI = `${WEB}src/ui/`

/** The words' own home: where amounts are worked into text, and the one place that may. */
const NUMBERS = "wording/numbers.ts"

/** Where a count beside 玉 or 枚 is a machine's own figure — what a bonus pays out, what a game gains — and no one's money or tokens. */
const MACHINE_FIGURES = ["features/pachinko/formulas/", "features/pachislot/formulas/"] as const

/** A count beside 円 that is no one's money: a step to choose prizes by, and the one chosen. */
const STEPS = ["formatCount(each)", "formatCount(app.services.preferences.stageStep())"] as const

/** Every screen's source, wherever it is, by its path from `src/ui/`: a walled-off feature's as `../its-folder/ui/…`. */
const sources = async (): Promise<readonly { readonly path: string; readonly text: string }[]> => {
  const files = (await Promise.all(SCREENS.map(async (screens) => (await readdir(`${WEB}${screens}`, { recursive: true })).map((path) => `${WEB}${screens}${path}`)))).flat()
  const paths = files.map((file) => relative(UI, file)).filter((path) => /\.(ts|tsx)$/.test(path) && path !== NUMBERS)
  return Promise.all(paths.map(async (path) => ({ path, text: await readFile(`${UI}${path}`, "utf8") })))
}

/** Every line of the screens a pattern finds, as `path:line: text`. */
const found = async (finds: (line: string) => boolean, passed: (path: string, line: string) => boolean = () => false): Promise<readonly string[]> =>
  (await sources()).flatMap(({ path, text }) =>
    text
      .split("\n")
      .map((line, index) => ({ line, at: `${path}:${String(index + 1)}: ${line.trim()}` }))
      .filter(({ line }) => finds(line) && !passed(path, line))
      .map(({ at }) => at),
  )

/** The screens a play another of the owner's devices holds is drawn on, as it is watched: the same play's screens, with what stands in for what writes. */
const FOLLOWED_SCREENS = [
  "features/live/ContinueBar.tsx",
  "features/live/LivePlayView.tsx",
  "features/live/LiveSide.tsx",
  "features/live/FinishPlayView.tsx",
  "features/live/play-hold.ts",
  "features/pachinko/live/LivePlay.tsx",
  "features/pachinko/live/CornerTerms.tsx",
  "features/pachinko/live/LiveHyenaHunt.tsx",
  "features/pachislot/live/LivePlay.tsx",
  "features/pachislot/live/CornerTerms.tsx",
  "features/pachislot/live/AtPlay.tsx",
  "features/pachislot/live/drawn-draft.ts",
] as const

/** What a screen names to have a play another device holds: the copy, the play as shown, how the screen has it, or the use cases that hand it over. */
const NAMES_A_FOLLOWED_PLAY = /\b(?:Followed|ShownPlay|LivePlayHold|PlayHold|loadLivePlay|loadFollowedToday|readFollowed|listFollowed)\b|\.followed\b/

describe("a play another device holds", () => {
  test("is drawn only by the screens listed for it, each among those the checks below look over", async () => {
    const screens = await sources()
    const looked = new Set(screens.map(({ path }) => path))
    const listed: ReadonlySet<string> = new Set(FOLLOWED_SCREENS)
    expect(screens.filter(({ path, text }) => NAMES_A_FOLLOWED_PLAY.test(text) && !listed.has(path)).map(({ path }) => path)).toEqual([])
    expect(FOLLOWED_SCREENS.filter((path) => !looked.has(path))).toEqual([])
  })

  test("is said to be watched, and as of when, with no figure of the play in the words", async () => {
    const bar = await readFile(`${UI}features/live/ContinueBar.tsx`, "utf8")
    expect(bar).toContain("followedSinceText(props.shownAt)")
    expect(bar).not.toMatch(/props\.(?:draft|play|followed)\b/)
  })
})

describe("money and tokens reach the screens only sealed", () => {
  test("nothing is written out by the locale, past the words", async () => {
    expect(await found((line) => /toLocaleString\(/.test(line))).toEqual([])
  })

  test("no yen mark is set before a figure but one made from a sealed amount", async () => {
    expect(await found((line) => /¥\$?\{(?!amountText\()/.test(line))).toEqual([])
  })

  test("no count is shown as tokens or yen, but a machine's own figures and the steps prizes are chosen by", async () => {
    const passed = (path: string, line: string): boolean => MACHINE_FIGURES.some((folder) => path.startsWith(folder)) || STEPS.some((step) => line.includes(`${step}}円`) || line.includes(`${step})}円`))
    expect(await found((line) => /formatCount\((?:[^()]|\([^()]*\))*\)\}?[玉枚円]/.test(line), passed)).toEqual([])
  })

  test("no secret is put into a template, where it would only ever show its veiled shape", async () => {
    expect(await found((line) => /\$\{\s*seal\./.test(line))).toEqual([])
  })
})

/** A parlor's name, a cabinet's number, an account or a payee, read straight off what a screen holds. */
const NAMED = String.raw`(?:[\w?]+(?:\??\.[\w]+)*\??\.)?(?:parlorName|cabinetNumber|paccount|payee|parlor|commodity|acommodity)|(?:[\w?]+\??\.)*(?:book|destination|joined\.value|destination\(\))\??\.title|(?:[\w?]+\??\.)*(?:received\??\.sender|invitation\??\.name)|(?:[\w?]+\??\.)*\w*[Pp]arlor\w*\??\.name`

/** Ways a screen shows such a thing as it is: put into a template, drawn as a child, or given as what a control says. */
const SHOWN = [
  new RegExp(String.raw`\$\{\s*(?:${NAMED})\s*(?:\?\?[^{}]*)?\}`),
  new RegExp(String.raw`(?:^|>)\s*\{\s*(?:${NAMED})\s*(?:\?\?[^{}]*)?\}`),
  new RegExp(String.raw`\b(?:label|title|aria-label|description|says|text|note)(?:=\{|: )\s*(?:${NAMED})\s*(?:\?\?[^,{}]*)?[,}]`),
] as const

const showsNamed = (line: string): boolean => SHOWN.some((way) => way.test(line))

describe("parlors and cabinets reach the screens only sealed", () => {
  test("are found wherever a screen once showed them as they are", () => {
    const shownOnce = [
      "        {props.at.parlor.name}・{props.at.pool.tier}",
      "          {props.parlor.parlorName}",
      "      return `${pool.parlor}の${pool.tier}の開始残高を登録`",
      "      return `${error.parlor.name}には${error.pool.tier}の貯蓄口座がありません。`",
      "            options={offers().map((offer) => ({ value: key, label: offer.parlor.name, note: offer.note }))}",
      '  `${shownNameOf(machineNames, draft.machine)}${draft.cabinetNumber === undefined ? "" : ` ${draft.cabinetNumber}番台`}`',
      '            {props.draft.cabinetNumber ?? "----"}番台',
      "        aria-label={`${props.parlorName} ${props.token.tier}の通帳`}",
      '              <span>{posting.preal === "RealPosting" ? posting.paccount : `(${posting.paccount})`}</span>',
      "      return `${error.commodity}の${error.date}時点の交換率が帳簿にありません。`",
      "      return book === undefined ? SOMETHING_DONE : `帳簿の名前を「${book.title}」に変更`",
      '    toast({ title: "送りました", description: destination.title })',
      "                      {destination.title}",
      "        <p>{`${draft.received.sender}さんから届いた稼働`}</p>",
      "    toast({ title: `${invitation.name}さんを外しました` })",
    ]
    expect(shownOnce.filter((line) => !showsNamed(line))).toEqual([])
  })

  test("pass over what only works with them", () => {
    const working = [
      "      ? nearestFirst(props.list.parlors, here.value).map((near) => ({ parlor: near.parlor, note: parlorNote(near.parlor, near.metres) }))",
      "    cabinetNumber: form.cabinetNumber.trim() === \"\" ? undefined : form.cabinetNumber,",
      "      return `/books/${encode(place.bookId)}/parlor-passbooks/${encode(place.parlorName)}`",
    ]
    expect(working.filter(showsNamed)).toEqual([])
  })

  test("are shown nowhere as they are", async () => {
    expect(await found(showsNamed)).toEqual([])
  })
})

/** Where text is drawn as it is written and is no book's: a machine's basis, the licences, and a sync conflict, which only the sync screen shows, withheld whole. */
const UNBOOKED_TEXT = ["features/pachinko/formulas/BasisView.tsx", "features/settings/LicensesView.tsx", "features/settings/ConflictPanel.tsx"] as const

/** The one place an entry's text is drawn, veiled as the policy says. */
const JOURNAL_TEXT = "features/mummer/JournalText.tsx"

describe("a book's text as it is written", () => {
  test("is drawn only by JournalText, or where 配信モード withholds it whole", async () => {
    const drawn = (await sources()).filter(({ path, text }) => path.endsWith(".tsx") && /<pre\b/.test(text) && path !== JOURNAL_TEXT && !UNBOOKED_TEXT.some((each) => path === each))
    expect(drawn.filter(({ text }) => !text.includes('<Withheld kind="journal"')).map(({ path }) => path)).toEqual([])
  })
})
