import type { BookFiles } from "../../core/journal/layout"
import { parsePlayLog, playLogPath, type Checkpoint, type Counts, type PlayEvent } from "../../core/play-log/checkpoint"
import type { PlayGameKind, PlayId } from "../../core/play/play"

const EMPTY = ""

/** The columns every play's readings have, before those of its game: the play as its log's head says it, then when the reading was written. */
const PLAY_COLUMNS = ["日付", "開始", "店舗", "機種", "台番号", "稼働ID", "時刻"] as const

/** The columns of a pachinko play's readings, after the play's. */
const PACHINKO_COLUMNS = ["回転数", "投資", "持ち玉", "貯玉再プレイ", "電サポ増減", "玉の受渡し", "状態", "カウンタ回転数", "カウンタ大当り", "遊タイムカウンタ", "出来事", "ボーナス", "出玉", "大当り回数", "上乗せ"] as const

/** The columns of a pachislot play's readings, after the play's. */
const PACHISLOT_COLUMNS = ["ゲーム数", "投資", "持ちメダル", "貯メダル再プレイ", "メダルの受渡し", "カウンタゲーム数", "カウンタ総ゲーム数", "カウンタボーナス", "CZ間ゲーム数", "CZ失敗数", "モード", "出来事", "AT完走", "セット数", "獲得枚数", "終了画面", "小役カウント", "設定変更後"] as const

/** The play a log says it is in its head, as its readings' rows repeat it; each part empty where the head says none, or there is no head. */
interface PlayCells {
  readonly date: string
  readonly startedAt: string
  readonly parlor: string
  readonly machine: string
  readonly cabinet: string
  readonly id: string
}

const textAt = (fields: Readonly<Record<string, unknown>>, key: string): string => ((value) => (typeof value === "string" ? value : EMPTY))(fields[key])

const fieldsOf = (value: unknown): Readonly<Record<string, unknown>> => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : {})

const parsedOf = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** A log's head, read loosely as the file's own format: its first line, where it says it is the head. */
const playCellsOf = (log: string, id: string): PlayCells => {
  const head = fieldsOf(parsedOf(log.split("\n").find((line) => line.trim() !== "") ?? ""))
  const fields = head["header"] === true ? head : {}
  return { date: textAt(fields, "date"), startedAt: textAt(fields, "startedAt"), parlor: textAt(fieldsOf(fields["parlor"]), "name"), machine: textAt(fields, "machine"), cabinet: textAt(fields, "cabinetNumber"), id }
}

const numberText = (value: number | undefined): string => (value === undefined ? EMPTY : String(value))

const truthText = (value: boolean | undefined): string => (value === undefined ? EMPTY : value ? "はい" : "いいえ")

/** Counts by name in one cell, `big=3 reg=2`, in the order they were written. */
const countsText = (counts: Counts | undefined): string =>
  counts === undefined
    ? EMPTY
    : Object.entries(counts)
        .map(([name, count]) => `${name}=${String(count)}`)
        .join(" ")

const PHASES: Readonly<Record<NonNullable<Checkpoint["phase"]>, string>> = { regular: "通常", special: "確変", rapid: "時短" }

/** What happened at a reading, in a word. */
const eventText = (event: PlayEvent | undefined, gameKind: PlayGameKind): string => {
  switch (event?.kind) {
    case undefined:
      return EMPTY
    case "jackpot":
      return `${gameKind === "pachinko" ? "大当り" : "AT当選"}${event.approximate === true ? "（後から）" : ""}`
    case "cz-missed":
      return "CZ失敗"
    case "bonus-missed":
      return "ボーナス（AT非当選）"
    case "at-ended":
      return "AT終了"
    case "rapid-began":
      return "時短突入"
    case "finished":
      return "終了"
  }
}

const pachinkoCells = (reading: Checkpoint): readonly string[] => {
  const bonus = reading.event?.kind === "jackpot" ? reading.event.bonus : undefined
  return [
    String(reading.spins),
    numberText(reading.outlay),
    numberText(reading.held),
    numberText(reading.replay),
    numberText(reading.support),
    numberText(reading.handed),
    reading.phase === undefined ? EMPTY : PHASES[reading.phase],
    numberText(reading.counter?.spins),
    numberText(reading.counter?.jackpots),
    numberText(reading.counter?.gauge),
    eventText(reading.event, "pachinko"),
    bonus?.name ?? EMPTY,
    numberText(bonus?.payout),
    numberText(bonus?.jackpots),
    numberText(bonus?.over),
  ]
}

const pachislotCells = (reading: Checkpoint): readonly string[] => {
  const ended = reading.event?.kind === "at-ended" ? reading.event : undefined
  return [
    String(reading.spins),
    numberText(reading.outlay),
    numberText(reading.held),
    numberText(reading.replay),
    numberText(reading.handed),
    numberText(reading.counter?.spins),
    numberText(reading.counter?.total),
    countsText(reading.counter?.bonuses),
    numberText(reading.counter?.sinceCz),
    numberText(reading.counter?.misses),
    reading.counter?.mode ?? EMPTY,
    eventText(reading.event, "pachislot"),
    truthText(ended?.completed),
    numberText(ended?.sets),
    numberText(ended?.medals),
    ended?.ending ?? EMPTY,
    countsText(reading.tally),
    reading.afterReset === true ? "はい" : EMPTY,
  ]
}

const CELLS: Readonly<Record<PlayGameKind, (reading: Checkpoint) => readonly string[]>> = { pachinko: pachinkoCells, pachislot: pachislotCells }

const HEADERS: Readonly<Record<PlayGameKind, readonly string[]>> = { pachinko: [...PLAY_COLUMNS, ...PACHINKO_COLUMNS], pachislot: [...PLAY_COLUMNS, ...PACHISLOT_COLUMNS] }

/** The folder a game's logs are kept in, as a path in the book begins with it. */
const folderOf = (gameKind: PlayGameKind): string => playLogPath(gameKind, "" as PlayId).replace(/\.jsonl$/, "")

/** A play's readings as rows, by their spins — a line remembered late may stand after later ones — each after the play as its head says it. A log that does not read gives none. */
const rowsOfPlay = (gameKind: PlayGameKind, path: string, log: string): readonly (readonly string[])[] => {
  const readings = parsePlayLog(log)
  if (!readings.ok) return []
  const play = playCellsOf(log, path.slice(folderOf(gameKind).length).replace(/\.jsonl$/, ""))
  return readings.value.toSorted((left, right) => left.spins - right.spins).map((reading) => [play.date, play.startedAt, play.parlor, play.machine, play.cabinet, play.id, reading.at ?? EMPTY, ...CELLS[gameKind](reading)])
}

/**
 * Every recorded play of one game a book holds, as a table of its readings —
 * a reading a row, oldest play first, each row beginning with the play as
 * its log's head says it — under a row of column names: what ライブ計測 saw
 * of each play, read from the book's own files and never asked of hledger.
 * Counts kept by name (a counter's bonuses, the small wins counted) go in
 * one cell, `name=count` apart by spaces, by the ids their formula gives
 * them. A log that does not read is left out.
 */
export const playTableOf = (files: BookFiles, gameKind: PlayGameKind): readonly (readonly string[])[] => {
  const plays = Object.entries(files)
    .filter(([path]) => path.startsWith(folderOf(gameKind)) && path.endsWith(".jsonl"))
    .map(([path, log]) => ({ rows: rowsOfPlay(gameKind, path, log), play: playCellsOf(log, path) }))
    .toSorted((left, right) => `${left.play.date}${left.play.startedAt}`.localeCompare(`${right.play.date}${right.play.startedAt}`))
  return [HEADERS[gameKind], ...plays.flatMap((play) => play.rows)]
}
