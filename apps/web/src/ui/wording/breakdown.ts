import { UNSAID, type Dimension } from "../../core/report/breakdown"

/** What each way of grouping plays is called, as the list of them offers it. */
export const DIMENSION_NAMES: Readonly<Record<Dimension, string>> = {
  machine: "機種別",
  parlor: "店舗別",
  weekday: "曜日別",
  game: "パチンコ・スロット別",
  maker: "メーカー別",
  year: "年別",
  month: "月別",
  day: "日別",
}

/** What grouping several books' plays book by book is called: the one grouping only a consolidation has. */
export const BY_BOOK = "帳簿別"

const WEEKDAYS = ["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"] as const

const GAMES: Readonly<Record<string, string>> = { pachinko: "パチンコ", slot: "スロット" }

/** What plays that do not say what a dimension asks are called: a play with no machine named, an entry with no game. */
const UNSAID_NAMES: Readonly<Record<Dimension, string>> = {
  machine: "機種の指定なし",
  parlor: "店舗の指定なし",
  weekday: "—",
  game: "種別なし",
  maker: "メーカー不明",
  year: "—",
  month: "—",
  day: "—",
}

/** A group's key as a person reads it: a weekday by its name, a game by its, a month as a year and a month, and anything else as it is written. */
export const groupName = (dimension: Dimension, key: string): string => {
  if (key === UNSAID) return UNSAID_NAMES[dimension]
  if (dimension === "weekday") return WEEKDAYS[Number(key)] ?? key
  if (dimension === "game") return GAMES[key] ?? key
  if (dimension === "month") return `${key.slice(0, 4)}年${Number(key.slice(5, 7))}月`
  return dimension === "year" ? `${key}年` : key
}
