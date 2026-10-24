import type { PlayGameKind, PlayId } from "../play/play"
import { Err, Ok, collect, type Result } from "../result/result"
import { isHeadLine } from "./head"

/**
 * One line of a play log: the state of a play at some moment, as running
 * totals since the play began.
 *
 * Totals rather than differences, so a line forgotten at the time can be
 * appended later without touching any other line: order comes from `spins`,
 * never from where a line sits in the file. The file is only ever appended to,
 * which is also what keeps two edits of it merging cleanly in Git.
 *
 * Everything but `spins` may be missing — a jackpot remembered afterwards
 * rarely comes with how much had been spent by then.
 */
export interface Checkpoint {
  /** Spins (games, for pachislot) since the play began; the order of the log. */
  readonly spins: number
  /** Yen spent since the play began. */
  readonly outlay?: number
  /** When the line was written, as an ISO 8601 timestamp. */
  readonly at?: string
  /**
   * The parlor's data counter as it was read. Kept beside the totals, not in
   * place of them, because the counter starts over at every jackpot.
   */
  readonly counter?: Counter
  /**
   * Something that happened at this point. A jackpot marked `approximate` was
   * found missing afterwards — the counter had started over — so it happened
   * somewhere after the line before, not exactly here. On a pachislot AT
   * machine a jackpot is an AT won, and `cz-missed` a CZ that did not win one.
   * A pachinko jackpot says which of its machine's bonuses it was, where
   * the machine lists them.
   */
  readonly event?: PlayEvent
  /**
   * What the player counted, small wins and bonuses alike, as running totals
   * by their id in the formula's spec — `{ "grape": 412, "reg-solo": 2 }` —
   * since the play began, at the first line that carries them. A log
   * written while counting began with a press has a line of no counts
   * where it began, and is counted from there. A count may
   * go down: a tap taken back. Pachislot only. Written under `tally`, the
   * log's word for them, data already written.
   */
  readonly tally?: Counts
  /**
   * The cabinet's settings were changed before the play, so its ceiling is
   * the shorter one until its first AT. On the first line only. Pachislot only.
   */
  readonly afterReset?: true
  /**
   * The state a pachinko cabinet was in over the spins since the line
   * before. Absent, they were regular games. Pachinko only.
   */
  readonly phase?: Phase
  /** Tokens drawn from the parlor's savings since the play began. */
  readonly replay?: number
  /**
   * What the balls in hand gained or lost outside regular games and
   * bonuses since the play began — the 電サポ's drift through 確変 and 時短 —
   * below zero where they lost. Pachinko only.
   */
  readonly support?: number
  /** The tokens in hand at this point, where they were counted. */
  readonly held?: number
  /**
   * Where the balls in hand were known before this line, at readings since
   * folded into it — counted, or none left as more were bought — oldest
   * first: what a play's regular games are measured between, kept so that
   * folding readings changes no figure. Pachinko only.
   */
  readonly handsBefore?: readonly HandAt[]
}

/**
 * The balls in hand at a point now inside a line, with the play's running
 * totals there, as a line of its own would have said them.
 */
export interface HandAt {
  readonly spins: number
  readonly outlay: number
  readonly replay: number
  readonly support: number
  readonly held: number
  /** Whether the balls were counted there, rather than known by more being bought. */
  readonly counted?: true
}

/**
 * What a pachinko cabinet is doing: regular games, which are what balls
 * buy and a formula weighs; 確変, or 時短, which run on the 電サポ and
 * cost next to nothing.
 */
export type Phase = "regular" | "special" | "rapid"

/**
 * The bonus a jackpot was, as its machine lists it: what it paid out and
 * what was spent winning it. Kept whole in the line, so the log still says
 * what was won whatever the catalog says later. `jackpots` is how many
 * jackpots it was won over, left out where it was one: the parlor's counter
 * counts each, and so does the play. `over` is what the person says it
 * paid beyond what its machine lists — an over-entry, or below nought
 * balls lost to a slack attacker — left out where they said nothing: the
 * bonus then paid what it is listed to.
 */
export interface BonusWon {
  readonly name: string
  readonly payout: number
  readonly spent: number
  readonly jackpots?: number
  readonly over?: number
}

/**
 * A data counter's reading. Pachinko's shows the spins since the last jackpot
 * and the jackpots of the day; a pachislot counter also shows the games of the
 * whole day and each kind of bonus, by its id in the formula's spec. At the
 * seat of a pachislot machine whose AT a CZ brings, it also gives the games
 * since the last CZ and the CZs missed since the last AT, read off its
 * history.
 */
export interface Counter {
  readonly spins?: number
  readonly jackpots?: number
  readonly total?: number
  readonly bonuses?: Counts
  readonly sinceCz?: number
  readonly misses?: number
  /** What the 有利区間 held at the end of the last AT, where it carries on into the games since. */
  readonly held?: number
  /**
   * Where a bonus that missed the AT started the counter again since it: the
   * games since the AT itself, across those bonuses, read off the history at
   * the seat, `spins` counting from the last of them.
   */
  readonly sinceAtAcrossBonuses?: number
  /** The mode a pachislot play was in at the seat, by the mode's id in its formula's spec, where the person knew it: a shortened ceiling after a ceiling CZ, a 天国 told on screen. */
  readonly mode?: string
  /**
   * What a pachinko cabinet's own 遊タイム counter (遊カウンター) showed, where
   * it was read and said: the spins it has counted toward the 遊タイム. It
   * starts over at a jackpot as the data counter does, but also where a
   * 遊タイム ran out without one, when the data counter carries on; the two
   * then differ by as many spins until the next jackpot. Pachinko only.
   */
  readonly gauge?: number
}

/**
 * On a pachislot AT machine, `at-ended` is what was seen of the AT last
 * won, written when it ends — on the same games, since an AT's own games are
 * not regular ones: whether it reached the 有利区間's cap, the sets it
 * carried on to past its first, the medals it gained, and how it ended — by
 * the ending's id in the formula's spec — each where known.
 * `bonus-missed` is a bonus a CZ's success brought that did not win the
 * AT, told apart from a CZ that failed (`cz-missed`) on a machine whose CZ
 * brings a bonus before the AT.
 * `rapid-began` is a pachinko cabinet turning to 時短: a run of 電サポ
 * turning from 確変, said as the person switches its bar — on the spins
 * the line before it was, since nobody reads the counter there, the spins
 * before it having been in 確変 — or the 遊タイム reached in regular games,
 * on a reading of them.
 * `finished` is the play's last line, written as the play is recorded: its
 * `at` is when the play finished, as the person gave it, and it adds nothing
 * to the totals.
 */
export type PlayEvent =
  | { readonly kind: "jackpot"; readonly approximate?: true; readonly bonus?: BonusWon }
  | { readonly kind: "cz-missed" }
  | { readonly kind: "bonus-missed" }
  | { readonly kind: "at-ended"; readonly completed?: boolean; readonly sets?: number; readonly medals?: number; readonly ending?: string }
  | { readonly kind: "rapid-began" }
  | { readonly kind: "finished" }

/** Counts by name: bonuses on a counter, or small wins a player counted. */
export type Counts = Readonly<Record<string, number>>

export type PlayLogError =
  | { readonly type: "unreadable-line"; readonly line: number }
  | { readonly type: "invalid-field"; readonly line: number; readonly field: string }
  | { readonly type: "non-monotonic"; readonly field: "outlay"; readonly spins: number }

/** The folder each game's play logs are kept in: a game is a folder, here as everywhere. */
const PLAY_LOG_FOLDERS: Readonly<Record<PlayGameKind, string>> = { pachinko: "pachinko-play", pachislot: "pachislot-play" }

/**
 * Where a play's log is kept beside the book's journal files: in its
 * game's folder, under the play's id. The two games' lines carry different
 * things, so their logs are kept apart, and a folder says which it holds.
 */
export const playLogPath = (gameKind: PlayGameKind, id: PlayId): string => `${PLAY_LOG_FOLDERS[gameKind]}/${id}.jsonl`

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0

const optional = <T>(
  fields: Fields,
  name: string,
  line: number,
  accept: (value: unknown) => value is T,
): Result<T | undefined, PlayLogError> => {
  const value = fields[name]
  return value === undefined ? Ok(undefined) : accept(value) ? Ok(value) : Err({ type: "invalid-field", line, field: name })
}

const isTrue = (value: unknown): value is true => value === true

const isTimestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value))

const isCounts = (value: unknown): value is Counts =>
  isFields(value) && Object.entries(value).every(([name, count]) => name !== "" && isCount(count))

const isCounter = (value: unknown): value is Counter =>
  isFields(value) &&
  (value["spins"] === undefined || isCount(value["spins"])) &&
  (value["jackpots"] === undefined || isCount(value["jackpots"])) &&
  (value["total"] === undefined || isCount(value["total"])) &&
  (value["bonuses"] === undefined || isCounts(value["bonuses"])) &&
  (value["sinceCz"] === undefined || isCount(value["sinceCz"])) &&
  (value["misses"] === undefined || isCount(value["misses"])) &&
  (value["held"] === undefined || isCount(value["held"])) &&
  (value["sinceAtAcrossBonuses"] === undefined || isCount(value["sinceAtAcrossBonuses"])) &&
  (value["mode"] === undefined || (typeof value["mode"] === "string" && value["mode"] !== "")) &&
  (value["gauge"] === undefined || isCount(value["gauge"]))

const isAtEnded = (value: Fields): boolean =>
  value["kind"] === "at-ended" &&
  (value["completed"] === undefined || typeof value["completed"] === "boolean") &&
  (value["sets"] === undefined || isCount(value["sets"])) &&
  (value["medals"] === undefined || isCount(value["medals"])) &&
  (value["ending"] === undefined || (typeof value["ending"] === "string" && value["ending"] !== ""))

const isBonusWon = (value: unknown): value is BonusWon =>
  isFields(value) &&
  typeof value["name"] === "string" &&
  value["name"] !== "" &&
  isCount(value["payout"]) &&
  isCount(value["spent"]) &&
  (value["jackpots"] === undefined || (isCount(value["jackpots"]) && value["jackpots"] > 0)) &&
  (value["over"] === undefined || (isWhole(value["over"]) && value["over"] !== 0))

const isPhase = (value: unknown): value is Phase => value === "regular" || value === "special" || value === "rapid"

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value)

const isHandAt = (value: unknown): value is HandAt =>
  isFields(value) &&
  isCount(value["spins"]) &&
  isCount(value["outlay"]) &&
  isCount(value["replay"]) &&
  isWhole(value["support"]) &&
  isCount(value["held"]) &&
  (value["counted"] === undefined || value["counted"] === true)

const isHandsBefore = (value: unknown): value is readonly HandAt[] => Array.isArray(value) && value.length > 0 && value.every(isHandAt)

const isEvent = (value: unknown): value is PlayEvent =>
  isFields(value) &&
  ((value["kind"] === "jackpot" && (value["approximate"] === undefined || value["approximate"] === true) && (value["bonus"] === undefined || isBonusWon(value["bonus"]))) ||
    (value["kind"] === "cz-missed" && value["approximate"] === undefined) ||
    (value["kind"] === "bonus-missed" && value["approximate"] === undefined) ||
    value["kind"] === "rapid-began" ||
    value["kind"] === "finished" ||
    isAtEnded(value))

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Every field named, each perhaps absent. */
type Spelled<T> = { readonly [K in keyof T]-?: T[K] | undefined }

/** Only the fields present, so a checkpoint carries no keys set to nothing. */
const present = <T extends object>(fields: Spelled<T>): T =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T

const decodeCheckpoint = (fields: Fields, line: number): Result<Checkpoint, PlayLogError> => {
  if (!isCount(fields["spins"])) return Err({ type: "invalid-field", line, field: "spins" })
  const spins = fields["spins"]
  const outlay = optional(fields, "outlay", line, isCount)
  const at = optional(fields, "at", line, isTimestamp)
  const counter = optional(fields, "counter", line, isCounter)
  const event = optional(fields, "event", line, isEvent)
  const counts = optional(fields, "tally", line, isCounts)
  const afterReset = optional(fields, "afterReset", line, isTrue)
  const phase = optional(fields, "phase", line, isPhase)
  const replay = optional(fields, "replay", line, isCount)
  const support = optional(fields, "support", line, isWhole)
  const held = optional(fields, "held", line, isCount)
  const handsBefore = optional(fields, "handsBefore", line, isHandsBefore)
  if (!outlay.ok) return outlay
  if (!at.ok) return at
  if (!counter.ok) return counter
  if (!event.ok) return event
  if (!counts.ok) return counts
  if (!afterReset.ok) return afterReset
  if (!phase.ok) return phase
  if (!replay.ok) return replay
  if (!support.ok) return support
  if (!held.ok) return held
  if (!handsBefore.ok) return handsBefore
  return Ok(
    present<Checkpoint>({
      spins,
      outlay: outlay.value,
      at: at.value,
      counter: counter.value,
      event: event.value,
      tally: counts.value,
      afterReset: afterReset.value,
      phase: phase.value,
      replay: replay.value,
      support: support.value,
      held: held.value,
      handsBefore: handsBefore.value,
    }),
  )
}

/** One line of a log; `line` counts from one, for saying where a fault is. */
const parseCheckpoint = (text: string, line: number): Result<Checkpoint, PlayLogError> => {
  const parsed = parseJson(text)
  return isFields(parsed) ? decodeCheckpoint(parsed, line) : Err({ type: "unreadable-line", line })
}

/**
 * Every checkpoint in a log, in the order written. Blank lines are skipped,
 * and so is a first line that says it is the log's head: a recorded play's
 * log has one, and a play still being played has none.
 */
export const parsePlayLog = (text: string): Result<readonly Checkpoint[], PlayLogError> =>
  collect(
    text
      .split("\n")
      .map((content, index) => ({ content, line: index + 1 }))
      .filter(({ content }) => content.trim() !== "")
      .filter(({ content }, index) => !(index === 0 && isHeadLine(content)))
      .map(({ content, line }) => parseCheckpoint(content, line)),
  )

const serializeCheckpoint = (checkpoint: Checkpoint): string => JSON.stringify(checkpoint)

/** A log with one more line at its end. */
export const appendCheckpoint = (log: string, checkpoint: Checkpoint): string =>
  `${log === "" || log.endsWith("\n") ? log : `${log}\n`}${serializeCheckpoint(checkpoint)}\n`
