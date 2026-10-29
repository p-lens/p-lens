/**
 * What 操作の手引き says something about, a note a thing: each is said on
 * a device the first time one of the things it is about is touched, there
 * or on any other screen, and never again.
 */
export type FirstTouchNote =
  | "rented-total"
  | "cash-total"
  | "drawn-total"
  | "press-amount"
  | "held-in-hand"
  | "counter-spins"
  | "counter-games"
  | "bonus-chosen"
  | "reading-row"
  | "seat-spins"
  | "seat-jackpots"
  | "rental-rate"
  | "exchange-rate"
  | "left-to-savings"
  | "drawn-from-savings"
  | "box-count"
  | "takings"
  | "theoretical-typed"
  | "paid-out"
  | "special-prizes"
  | "actual-balance"

export const FIRST_TOUCH_NOTES: readonly FirstTouchNote[] = [
  "rented-total",
  "cash-total",
  "drawn-total",
  "press-amount",
  "held-in-hand",
  "counter-spins",
  "counter-games",
  "bonus-chosen",
  "reading-row",
  "seat-spins",
  "seat-jackpots",
  "rental-rate",
  "exchange-rate",
  "left-to-savings",
  "drawn-from-savings",
  "box-count",
  "takings",
  "theoretical-typed",
  "paid-out",
  "special-prizes",
  "actual-balance",
]

/** The screens a note is told apart on: starting a play, a play followed live, recording it, a tally typed by hand, and everywhere else. */
export type Screen = "live-start" | "live-play" | "live-record" | "tally" | "elsewhere"

/** What tokens a thing counts, where it says: a note about tokens is worded for them. */
export type Tokens = "balls" | "medals"

/**
 * A thing touched, as it is seen from outside the screen that drew it: the
 * screen, the name it goes by — a field's label, a button's — the tokens
 * it counts where it says, and whether the play being recorded is at no
 * parlor, whose tokens are no parlor's savings.
 */
export interface Touch {
  readonly screen: Screen
  readonly name: string
  readonly tokens: Tokens | undefined
  readonly offBook: boolean
}

/** A note to show, worded for the tokens of what was touched. */
export interface Noted {
  readonly note: FirstTouchNote
  readonly tokens: Tokens | undefined
}

interface Rule {
  readonly screens: readonly Screen[] | "any"
  readonly name: string | RegExp
  /** Said only of a play at a parlor, whose tokens go to and come from its savings. */
  readonly atParlor?: true
  readonly note: FirstTouchNote
}

/** Which thing on which screen each note is about, by the names those things already go by. */
const RULES: readonly Rule[] = [
  { screens: ["live-play"], name: "貸玉", note: "rented-total" },
  { screens: ["live-play"], name: "投資", note: "cash-total" },
  { screens: ["live-play"], name: /^(貯玉引出|貯メダル)$/, note: "drawn-total" },
  { screens: ["live-play"], name: /足す（長押しで変更）$/, note: "press-amount" },
  { screens: ["live-play"], name: /^持ち(玉|メダル)$/, note: "held-in-hand" },
  { screens: ["live-play"], name: "回転数", note: "counter-spins" },
  { screens: ["live-play"], name: "累計G", note: "counter-games" },
  { screens: ["live-play"], name: /^ボーナス(\s|$)/, note: "bonus-chosen" },
  { screens: ["live-play"], name: /(の記録|開始時データ)を修正$/, note: "reading-row" },
  { screens: ["live-start", "live-play"], name: "ゲーム数", note: "seat-spins" },
  { screens: ["live-start", "live-play"], name: "大当り数", note: "seat-jackpots" },
  { screens: "any", name: /^貸(玉|枚)?\(千円\)$/, note: "rental-rate" },
  { screens: "any", name: "交換(100円)", note: "exchange-rate" },
  { screens: ["live-record"], name: /^持ち(玉|メダル)$/, atParlor: true, note: "left-to-savings" },
  { screens: ["live-record"], name: /^貯(玉|メダル)引出$/, atParlor: true, note: "drawn-from-savings" },
  { screens: ["live-record"], name: "箱で数える", note: "box-count" },
  { screens: ["tally"], name: "回収額", note: "takings" },
  { screens: ["tally"], name: "期待値を入力する", note: "theoretical-typed" },
  { screens: ["elsewhere"], name: "払出数", note: "paid-out" },
  { screens: ["elsewhere"], name: "特殊景品額", note: "special-prizes" },
  { screens: ["elsewhere"], name: "実際の残高", note: "actual-balance" },
]

const named = (name: string | RegExp, touched: string): boolean => (typeof name === "string" ? name === touched : name.test(touched))

const applies = (rule: Rule, touch: Touch): boolean =>
  (rule.screens === "any" || rule.screens.includes(touch.screen)) && named(rule.name, touch.name) && !(rule.atParlor === true && touch.offBook)

/** The tokens a name says it counts, where the thing touched did not say: 貯メダル, 持ちメダル, 貸枚. */
const tokensNamed = (name: string): Tokens | undefined => (/メダル|枚/.test(name) ? "medals" : /玉/.test(name) ? "balls" : undefined)

/** The note a touch is the first of, if there is one for what was touched there: what has been seen already is the caller's to say. */
export const noteFor = (touch: Touch): Noted | undefined => {
  const rule = RULES.find((each) => applies(each, touch))
  return rule === undefined ? undefined : { note: rule.note, tokens: touch.tokens ?? tokensNamed(touch.name) }
}

/** The notes seen, as kept: a list of their names, anything else in it passed over. */
export const seenFrom = (kept: unknown): ReadonlySet<FirstTouchNote> =>
  new Set(Array.isArray(kept) ? FIRST_TOUCH_NOTES.filter((note) => kept.includes(note)) : [])
