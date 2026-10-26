import { parseIsoDate } from "../calendar/calendar"
import type * as Pachinko from "../pachinko"
import type * as Pachislot from "../pachislot"
import type { Parlor, ParlorIdentity, SavingsPool } from "../parlor/parlor"
import type { PlayTerms } from "../parlor/terms"
import { readGameKind, type PlayGameKind } from "../play/play"
import { parsePlayLog } from "../play-log/checkpoint"
import type { Finish } from "../play-log/finish"
import type { DraftOfAnyGame, Operation, PlayDraft, PlayOfGame, PlayVenue, Receipt, Sending } from "./draft"

/** A play as it is kept and as it is sent: everything of a draft but what the device keeps of it for itself. */
export type Play = PlayOfGame & Omit<DraftOfAnyGame, "bookId" | "recorded" | "sent" | "received">

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === "string"

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0

const isFigure = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

const isTexts = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every(isText)

const isEvery = <T>(value: unknown, each: (item: unknown) => item is T): value is readonly T[] => Array.isArray(value) && value.every(each)

/** Whether a value names no part but these: a part a reader does not know is one it would lose, or read wrongly as left out. */
const hasOnly = (value: Fields, ...names: readonly string[]): boolean => Object.keys(value).every((name) => names.includes(name))

/** A value that is either left out or what `is` says it must be. */
const isOptional = <T>(value: unknown, is: (given: unknown) => given is T): value is T | undefined => value === undefined || is(value)

const isPair = (value: unknown, first: string, second: string): boolean => isFields(value) && isCount(value[first]) && isCount(value[second])

const isTerms = (value: unknown): value is PlayTerms =>
  isFields(value) && isPair(value["rental"], "yen", "tokens") && isPair(value["exchange"], "tokens", "yen") && isPair(value["replay"], "paidOut", "deducted")

const isIdentity = (value: unknown): value is ParlorIdentity =>
  isFields(value) && ((value["type"] === "listed" && isText(value["id"])) || (value["type"] === "submitted" && isText(value["submission"])))

const isPool = (value: unknown): value is SavingsPool => isFields(value) && (value["kind"] === "ball" || value["kind"] === "medal") && isText(value["tier"])

const isParlor = (value: unknown): value is Parlor => isFields(value) && isIdentity(value["identity"]) && isText(value["name"]) && value["name"] !== "" && isEvery(value["pools"], isPool)

const isVenue = (value: unknown): value is PlayVenue =>
  isFields(value) &&
  ((value["type"] === "parlor" && isParlor(value["parlor"]) && isTerms(value["terms"])) || (value["type"] === "none" && isOptional(value["terms"], isTerms)))

const isGameKind = (value: unknown): value is PlayGameKind => value === "pachinko" || value === "pachislot"

/** A play with its game as this app names it: one kept or sent before pachislot's name was settled names it as it was written then. */
const withGameNamed = (value: unknown): unknown => (isFields(value) ? { ...value, gameKind: readGameKind(value["gameKind"]) ?? value["gameKind"] } : value)

const isFigures = (value: unknown): value is Pachinko.Figures =>
  isFields(value) && isFigure(value["roundChanceOneIn"]) && isFigure(value["payoutPerRound"]) && isOptional(value["totalChanceOneIn"], isFigure) && isOptional(value["spinsPerHour"], isFigure)

const isPachinkoSnapshot = (value: unknown): value is Pachinko.FormulaSnapshot =>
  isFields(value) && isText(value["id"]) && isText(value["machineId"]) && isText(value["kind"]) && isFigures(value["figures"]) && isOptional(value["supportGain"], isFigure)

const isBonus = (value: unknown): value is Pachinko.Bonus =>
  isFields(value) && isText(value["name"]) && isFigure(value["payout"]) && isFigure(value["spent"]) && isOptional(value["jackpots"], isCount)

const isShare = (value: unknown): value is Pachislot.SettingLevelShare => isFields(value) && isCount(value["settingLevel"]) && isFigure(value["basisPoints"])

const isPrior = (value: unknown): value is Pachislot.Weighing["prior"] =>
  isFields(value) &&
  (value["type"] === "even" ||
    (value["type"] === "distribution" && isText(value["id"]) && isText(value["label"]) && isEvery(value["shares"], isShare)) ||
    (value["type"] === "stock" && isText(value["key"]) && isEvery(value["shares"], isShare)))

const isLabels = (value: unknown): boolean => isFields(value) && Object.values(value).every(isText)

const isPachislotSnapshot = (value: unknown): boolean =>
  isFields(value) &&
  isText(value["id"]) &&
  isText(value["machineId"]) &&
  isText(value["kind"]) &&
  Array.isArray(value["figures"]) &&
  isFields(value["normalized"]) &&
  isFields(value["conditions"]) &&
  isLabels(value["labels"])

/** What a pachislot play is weighed by, as far as the app reads it itself: the engine that weighs by it says the rest. */
const isWeighing = (value: unknown): value is Pachislot.Weighing => isFields(value) && isPachislotSnapshot(value["formula"]) && isPrior(value["prior"])

const isLog = (value: unknown): value is string => isText(value) && parsePlayLog(value).ok

const isOperation = (value: unknown): value is Operation => isFields(value) && isText(value["at"]) && isTexts(value["removed"]) && isTexts(value["added"])

const isFinish = (value: unknown): value is Finish => isFields(value) && hasOnly(value, "at", "counter") && isOptional(value["at"], isText) && isOptional(value["counter"], isFigure)

const isSending = (value: unknown): value is Sending => isFields(value) && isText(value["lineId"]) && isText(value["at"]) && isText(value["log"])

const isRecorded = (value: unknown): value is NonNullable<PlayDraft["recorded"]> => isFields(value) && hasOnly(value, "at", "finish") && isText(value["at"]) && isFinish(value["finish"])

const isReceipt = (value: unknown): value is Receipt =>
  isFields(value) &&
  hasOnly(value, "sender", "senderId", "log", "finished", "again") &&
  isOptional(value["sender"], isText) &&
  isOptional(value["senderId"], isText) &&
  isText(value["log"]) &&
  isOptional(value["finished"], isFinish) &&
  isOptional(value["again"], isDraft)

/**
 * Whether a value reads as a play, every part of it that is there: which
 * play, its day and game, where it was played and on what terms, when it
 * began, a log that reads, and what it is weighed by as far as the app
 * reads that itself. A part left out where a play may leave it out is
 * none; a part there that does not read makes the play one that does not.
 */
const isPlay = (value: unknown): value is Play =>
  isFields(value) &&
  isText(value["id"]) &&
  value["id"] !== "" &&
  isText(value["date"]) &&
  parseIsoDate(value["date"]).ok &&
  isVenue(value["venue"]) &&
  isGameKind(value["gameKind"]) &&
  isText(value["machine"]) &&
  isOptional(value["pachinko"], isPachinkoSnapshot) &&
  isOptional(value["bonuses"], (bonuses): bonuses is readonly Pachinko.Bonus[] => isEvery(bonuses, isBonus)) &&
  isOptional(value["pachislot"], isWeighing) &&
  isOptional(value["jackpotCounting"], (counting): counting is "per-bonus" => counting === "per-bonus") &&
  isOptional(value["overEntry"], (over): over is number => typeof over === "number" && Number.isInteger(over) && over !== 0) &&
  isOptional(value["cabinetNumber"], isText) &&
  isText(value["startedAt"]) &&
  isLog(value["log"]) &&
  isOptional(value["history"], (history): history is readonly Operation[] => isEvery(history, isOperation))

const isDraft = (value: unknown): value is PlayDraft =>
  isFields(value) &&
  isOptional(value["bookId"], isText) &&
  isOptional(value["recorded"], isRecorded) &&
  isOptional(value["sent"], (sent): sent is readonly Sending[] => isEvery(sent, isSending)) &&
  isOptional(value["received"], isReceipt) &&
  isPlay(value)

/**
 * A play's parts of its own game alone: a part of the other game's, which a
 * play of its game never reads, is let go once it has read like any other
 * part — a draft kept before a play's game said which it holds could name
 * both.
 */
const ofItsGame = (value: Fields): Fields => {
  const { pachinko, bonuses, jackpotCounting, overEntry, pachislot, ...rest } = value
  return value["gameKind"] === "pachinko"
    ? { ...rest, pachinko, ...(bonuses === undefined ? {} : { bonuses }), ...(jackpotCounting === undefined ? {} : { jackpotCounting }), ...(overEntry === undefined ? {} : { overEntry }) }
    : { ...rest, ...(pachislot === undefined ? {} : { pachislot }) }
}

/** A play read from what was kept or sent, its own game's parts alone, or none where any part of it that is there does not read. */
export const readPlay = (kept: unknown): Play | undefined => ((value) => (isPlay(value) && isFields(value) ? ((own) => (isPlay(own) ? own : undefined))(ofItsGame(value)) : undefined))(withGameNamed(kept))

/** A draft read from what the device kept, its own game's parts alone, or none where any part of it that is there does not read. */
export const readPlayDraft = (kept: unknown): PlayDraft | undefined => ((value) => (isDraft(value) && isFields(value) ? ((own) => (isDraft(own) ? own : undefined))(ofItsGame(value)) : undefined))(withGameNamed(kept))
