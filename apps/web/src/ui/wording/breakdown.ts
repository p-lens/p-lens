import type { IsoDate } from "../../core/calendar/calendar"
import { shownNameOf, type MachineNames } from "../../core/catalog/catalog"
import { toPlainString, type Decimal } from "../../core/decimal/decimal"
import { UNSAID, type Dimension } from "../../core/report/breakdown"
import type { SenderNames } from "../../core/report/senders"
import { formatCount, formatTheoreticalYen } from "./numbers"

/** What taking the tallies as one, rather than grouping them, is called: the breakdown's first choice. */
export const OVERALL_NAME = "総合"

/** What each way of grouping tallies is called, as the list of them offers it. */
export const DIMENSION_NAMES: Readonly<Record<Dimension, string>> = {
  machine: "機種別",
  parlor: "店舗別",
  weekday: "曜日別",
  game: "パチンコ・スロット別",
  year: "年別",
  month: "月別",
  day: "日別",
}

const SPANS = { month: "月別は月の初日から末日まで", year: "年別は1月1日から12月31日まで" } as const

const slashed = (day: IsoDate | undefined): string => (day === undefined ? "" : day.replaceAll("-", "/"))

/** What is said under the period where a grouping by month or year is asked about more days than were typed: which days it sums, so a whole month's figure is not taken for a part's. */
export const widenedNote = (span: keyof typeof SPANS, from: IsoDate | undefined, to: IsoDate | undefined): string => `${SPANS[span]}を集計します（${slashed(from)}〜${slashed(to)}）。`

/** What grouping several books' tallies book by book is called: a grouping only a consolidation has. */
export const BY_BOOK = "帳簿別"

/** What grouping several books' tallies by who played them is called: a grouping only a consolidation has. */
export const BY_SENDER = "打ち手別"

/** A sender as their group is called: by the name on their last tally. */
export const senderName = (names: SenderNames, id: string): string => ((named) => (named === "" ? "--" : named))(names.get(id)?.name ?? "")

/** What a book's tallies that name no sender are called, among senders: the plays of its owner, and any taken in before a sender was written. */
export const unsentName = (bookTitle: string): string => `${bookTitle}（送信者なし）`

const WEEKDAYS = ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"] as const

const GAMES: Readonly<Record<string, string>> = { pachinko: "パチンコ", slot: "スロット" }

/** What is said beside a sum of theoretical values where part of it was inferred: how much of it is not measurement. */
export const inferredShareText = (inferred: Decimal): string => `うち推定 ${formatTheoreticalYen(inferred)}`

/** What a machine's tallies' spin performances are called, averaged: those their plays' logs measured, and those tallies typed in by hand were inferred to have had. */
export const SPIN_AVERAGE = "平均回転率"

export const INFERRED_SPIN_AVERAGE = "平均推定回転率"

/** A spin performance as the live screen shows one, to a tenth. */
export const spinAverageText = (average: Decimal): string => Number(toPlainString(average)).toFixed(1)

/** What その他損益 is called on screen, and each of its lines. */
export const OTHER_GAINS = "その他損益"

export const FORFEITED = "失効損"

export const REVALUATION = "評価損益"

/** What is said beside 失効損: what it is, and that 収支 holds it. */
export const FORFEITED_NOTE = "失効した貯玉・貯メダルの分。収支には含みません。"

/** What is said beside 評価損益: what moved, and that 収支 does not hold it. */
export const REVALUATION_NOTE = "交換率が変わって貯玉・貯メダルの価値が動いた分。収支には含みません。"

/** The heads a period's totals are listed under in 総合. */
export const TOTALS_HEADS = { played: "稼働", result: "収支", money: "現金と景品" } as const

/** What stands for a sum of theoretical values in a book that has none written in it: there is nothing to sum, which nought would not say. */
export const NOT_TALLIED = "集計なし"

/** What a group's play time is called beside it. */
export const PLAY_TIME = "時間"

/** A play time in seconds as a person reads it: whole hours and minutes, the minutes always two digits, the seconds dropped — `34時間05分`, `03分`. */
export const playTimeText = (seconds: Decimal): string => {
  const minutes = Math.floor(Number(toPlainString(seconds)) / 60)
  const hours = Math.floor(minutes / 60)
  const shown = `${String(minutes % 60).padStart(2, "0")}分`
  return hours === 0 ? shown : `${formatCount(hours)}時間${shown}`
}

/** What tallies that do not say what a dimension asks are called: a tally with no machine named, an entry with no game. */
const UNSAID_NAMES: Readonly<Record<Dimension, string>> = {
  machine: "機種の指定なし",
  parlor: "店舗の指定なし",
  weekday: "--",
  game: "種別なし",
  year: "--",
  month: "--",
  day: "--",
}

/** A group's key as a person reads it: a machine by the name the halls call it, a weekday by its name, a game by its, a month as a year and a month, and anything else as it is written. */
export const groupName = (dimension: Dimension, key: string, machineNames: MachineNames): string => {
  if (key === UNSAID) return UNSAID_NAMES[dimension]
  if (dimension === "machine") return shownNameOf(machineNames, key)
  if (dimension === "weekday") return WEEKDAYS[Number(key)] ?? key
  if (dimension === "game") return GAMES[key] ?? key
  if (dimension === "month") return `${key.slice(0, 4)}年${Number(key.slice(5, 7))}月`
  return dimension === "year" ? `${key}年` : key
}
