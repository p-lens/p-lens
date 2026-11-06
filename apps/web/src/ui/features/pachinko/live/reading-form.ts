import type { MachineBonus } from "../../../../core/catalog/catalog"
import type { Jackpot, Reading, ReadingHand, SupportPhase } from "../../../../core/pachinko/reading"
import { handsBeyondHand, type Before } from "../../../../core/pachinko/revision"
import type { Phase } from "../../../../core/play-log/checkpoint"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/** Which way the 電サポ took the balls in hand: the count typed is how many, never signed. */
export type Drift = "gain" | "loss"

/** Which way balls went between the person and another player: handed in to them, or handed away. The count typed is how many, never signed; a form opens on away, the giver typing it first and a slip standing out below nothing. */
export type Handing = "received" | "given"

/**
 * The reading form as typed. What was rented and drawn are the play's
 * totals, as the form opens showing them, for adding to; what drifted is
 * since the reading before, and so is what was handed to or by other
 * players (`handed`, the way it went `handing`). The balls in hand are
 * typed as they were before that handing, which a log's count holds
 * (`readReadingForm`). `heldCarried` says the balls in hand shown are
 * the last count carried over and not counted again: they are then not
 * this reading's to say. `jackpot` is the choice made in the bonus list —
 * none, the jackpot a machine with no bonuses listed has, or a listed
 * bonus by its name, and `over` what the person says that bonus paid
 * beyond what its machine lists, in balls, signed — empty where they say
 * nothing. `gauge` is the cabinet's own 遊タイム counter a reading
 * set right already said, kept as it was: it is said in the 遊タイム狙い,
 * never typed here. `handsBefore` are where a reading set right that was
 * made of several knew the hand inside it, kept as they were: never typed
 * either, and none for a new reading.
 */
export interface ReadingForm {
  readonly phase: Phase
  readonly counter: string
  readonly held: string
  readonly heldCarried: boolean
  readonly rented: string
  readonly replayed: string
  readonly supported: string
  readonly drift: Drift
  readonly handed: string
  readonly handing: Handing
  readonly jackpot: string
  readonly over: string
  readonly gauge: number | undefined
  readonly handsBefore: readonly ReadingHand[]
  /** Whether a reading set right is the 電サポ turning to 時短, kept as it was: said on the bar, never typed here. */
  readonly rapidBegan: boolean
}

export type ReadingField = "counter" | "held" | "rented" | "replayed" | "supported" | "handed" | "over"

export interface ReadingProblem {
  readonly field: ReadingField
  readonly reason: "required" | "not-a-count" | "went-back" | "beyond-hand"
}

export const NO_JACKPOT = "none"
export const UNTOLD = "untold"

/** The form a new reading is typed into: where the play stands, to be typed over or added to, in the state the cabinet was last said to be in. */
export const readingFrom = (phase: Phase, before: Before): ReadingForm => ({
  phase,
  counter: String(before.counter),
  held: before.held === undefined ? "" : String(before.held),
  heldCarried: before.held !== undefined,
  rented: typed(before.outlay),
  replayed: typed(before.replay),
  supported: "",
  drift: "loss",
  handed: "",
  handing: "given",
  jackpot: NO_JACKPOT,
  over: "",
  gauge: undefined,
  handsBefore: [],
  rapidBegan: false,
})

const COUNT = /^\d+$/

const readCount = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : undefined
}

/** A total left empty is as it was; one typed must not be behind where the play stood. */
const readSince = (text: string, field: ReadingField, before: number): Result<number, ReadingProblem> => {
  if (tidyTyped(text) === "") return Ok(0)
  const total = readCount(text)
  if (total === undefined) return Err({ field, reason: "not-a-count" })
  return total < before ? Err({ field, reason: "went-back" }) : Ok(total - before)
}

/** A count left empty is none: no drift. */
const readOrNone = (text: string, field: ReadingField): Result<number, ReadingProblem> => {
  if (tidyTyped(text) === "") return Ok(0)
  const count = readCount(text)
  return count === undefined ? Err({ field, reason: "not-a-count" }) : Ok(count)
}

/** The balls in hand left empty were not counted, which is different from having none. */
const readHeld = (text: string): Result<number | undefined, ReadingProblem> => {
  if (tidyTyped(text) === "") return Ok(undefined)
  const count = readCount(text)
  return count === undefined ? Err({ field: "held", reason: "not-a-count" }) : Ok(count)
}

const SIGNED = /^[+-]?\d+$/

/**
 * Whether the balls in hand shown are this reading's to say: typed, or
 * carried over where balls were bought with no jackpot — buying with no
 * count would otherwise be taken for the hand run out, though the form
 * showed it standing. A hand carried over so is said with what was
 * handed at the reading on it, as one not counted would have moved by it.
 */
const heldTold = (form: ReadingForm, bought: boolean): boolean => !form.heldCarried || (bought && form.jackpot === NO_JACKPOT)

/** Balls a bonus paid beyond its machine's, signed: none where nothing is typed, or nought. */
const readOver = (text: string): Result<number | undefined, ReadingProblem> => {
  const plain = tidyTyped(text).replaceAll(",", "")
  if (plain === "") return Ok(undefined)
  return SIGNED.test(plain) ? Ok(Number(plain) === 0 ? undefined : Number(plain)) : Err({ field: "over", reason: "not-a-count" })
}

const readCounter = (text: string): Result<number, ReadingProblem> => {
  const count = tidyTyped(text) === "" ? undefined : readCount(text)
  return count !== undefined ? Ok(count) : Err({ field: "counter", reason: tidyTyped(text) === "" ? "required" : "not-a-count" })
}

const typed = (count: number | undefined): string => (count === undefined || count === 0 ? "" : String(count))

const chosenOf = (jackpot: Jackpot): string => (jackpot.type === "none" ? NO_JACKPOT : jackpot.type === "untold" ? UNTOLD : bonusKey(jackpot.bonus.name))

/** A reading already taken as the form shows it, to be set right: the play as that reading left it, its count as it was before what it handed. */
export const formOfReading = (reading: Reading, before: Before): ReadingForm => ({
  phase: reading.phase,
  counter: String(reading.counterSpins),
  held: reading.held === undefined ? "" : String(reading.held - reading.handed),
  heldCarried: false,
  rented: typed(before.outlay + reading.rented),
  replayed: typed(before.replay + reading.replayed),
  supported: reading.driftCounted === true ? String(Math.abs(reading.supported)) : typed(Math.abs(reading.supported)),
  drift: reading.supported > 0 ? "gain" : "loss",
  handed: typed(Math.abs(reading.handed)),
  handing: reading.handed > 0 ? "received" : "given",
  jackpot: chosenOf(reading.jackpot),
  over: reading.jackpot.type === "bonus" && reading.jackpot.bonus.over !== undefined ? String(reading.jackpot.bonus.over) : "",
  gauge: reading.gauge,
  handsBefore: reading.handsBefore ?? [],
  rapidBegan: reading.rapidBegan === true,
})

/** The choice in the bonus list as a list keys it: a listed bonus by its name, which its machine has once. */
export const bonusKey = (name: string): string => `bonus:${name}`

const jackpotOf = (chosen: string, bonuses: readonly MachineBonus[], over: number | undefined): Jackpot => {
  if (chosen === UNTOLD) return { type: "untold" }
  const bonus = bonuses.find((candidate) => bonusKey(candidate.name) === chosen)
  return bonus === undefined ? { type: "none" } : { type: "bonus", bonus: over === undefined ? bonus : { ...bonus, over } }
}

/** Yen or tokens typed, with so many more: what a press of the rental or the savings button puts in its field. */
export const withMore = (typed: string, more: number): string => String((readCount(typed) ?? 0) + more)

/** The form read into a reading but for its moment — what was rented and drawn since where the play stood before it — or every field that could not be read; or the balls handed away, where they are more than the hand held. The balls in hand typed are those before the handing, and the reading counts them after it: what was typed with what was handed. */
export const readReadingForm = (form: ReadingForm, bonuses: readonly MachineBonus[], before: Before): Result<Omit<Reading, "at">, readonly ReadingProblem[]> => {
  const counter = readCounter(form.counter)
  const rented = readSince(form.rented, "rented", before.outlay)
  const replayed = readSince(form.replayed, "replayed", before.replay)
  const held = heldTold(form, (rented.ok && rented.value > 0) || (replayed.ok && replayed.value > 0)) ? readHeld(form.held) : Ok(undefined)
  const supported = readOrNone(form.supported, "supported")
  const handedCount = readOrNone(form.handed, "handed")
  const over = readOver(form.over)
  if (!counter.ok || !held.ok || !rented.ok || !replayed.ok || !supported.ok || !handedCount.ok || !over.ok)
    return Err([counter, held, rented, replayed, supported, handedCount, over].flatMap((read) => (read.ok ? [] : [read.error])))
  const handed = form.handing === "given" && handedCount.value !== 0 ? -handedCount.value : handedCount.value
  const told = held.value === undefined ? undefined : held.value + handed
  if ((told !== undefined && told < 0) || handsBeyondHand(before.held, { handed, held: told, handsBefore: form.handsBefore })) return Err([{ field: "handed", reason: "beyond-hand" }])
  return Ok({
    counterSpins: counter.value,
    phase: form.phase,
    rented: rented.value,
    replayed: replayed.value,
    supported: form.drift === "loss" && supported.value !== 0 ? -supported.value : supported.value,
    ...(tidyTyped(form.supported) === "" ? {} : { driftCounted: true as const }),
    handed,
    held: told,
    jackpot: jackpotOf(form.jackpot, bonuses, over.value),
    ...(form.gauge === undefined ? {} : { gauge: form.gauge }),
    ...(form.rapidBegan ? { rapidBegan: true as const } : {}),
    ...((hands) => (hands.length === 0 ? {} : { handsBefore: hands }))(handsWithin(form.handsBefore, counter.value, rented.value, replayed.value)),
  })
}

/** A jackpot on the 電サポ as its bar takes it: the bonus chosen, in the state it came in, at the counter where it stood — nobody reads one in a run — with nothing rented, drawn, counted or drifted. */
export const readRunJackpot = (form: ReadingForm, bonuses: readonly MachineBonus[], before: Before, phase: SupportPhase): Result<Omit<Reading, "at">, readonly ReadingProblem[]> =>
  readReadingForm({ ...readingFrom(phase, before), jackpot: form.jackpot, over: form.over }, bonuses, before)

/**
 * The 電サポ's end as its bar takes it: the spins it ran for by the
 * counter, which must be typed, the balls in hand where they were counted
 * — not where the guide shown is left as it is — and what it drifted, in
 * the state it ran in. A 遊タイム run out without a jackpot leaves the 遊
 * counter at nought.
 */
export const readSupportEnd = (form: ReadingForm, before: Before, phase: SupportPhase, reliefDriveRanOut: boolean): Result<Omit<Reading, "at">, readonly ReadingProblem[]> =>
  readReadingForm({ ...readingFrom(phase, before), counter: form.counter, held: form.held, heldCarried: form.heldCarried, supported: form.supported, drift: form.drift, handed: form.handed, handing: form.handing, ...(reliefDriveRanOut ? { gauge: 0 } : {}) }, [], before)

/** A reading of regular games as the 遊タイム is reached: the form as typed, its counter where the 遊タイム comes where it was left where it stood. */
export const readReliefDrive = (form: ReadingForm, bonuses: readonly MachineBonus[], before: Before, reliefDriveAt: number): Result<Omit<Reading, "at">, readonly ReadingProblem[]> =>
  readReadingForm({ ...form, phase: "regular", jackpot: NO_JACKPOT, rapidBegan: true, ...(readCount(form.counter) === before.counter && reliefDriveAt > before.counter ? { counter: String(reliefDriveAt) } : {}) }, bonuses, before)

/** The hands a reading made of several knew inside it that still stand inside it as it is set right: none further on than its counter, nor having rented or drawn more than it did. */
const handsWithin = (hands: readonly ReadingHand[], counterSpins: number, rented: number, replayed: number): readonly ReadingHand[] =>
  hands.filter((hand) => hand.counterSpins <= counterSpins && hand.rented <= rented && hand.replayed <= replayed)

/** Whether a reading says nothing the play did not already: the counter where it stood, nothing bought, drifted, handed, counted or won. */
export const saysNothingNew = (reading: Omit<Reading, "at">, before: Before): boolean =>
  reading.counterSpins === before.counter && reading.rented === 0 && reading.replayed === 0 && reading.supported === 0 && reading.handed === 0 && reading.held === undefined && reading.jackpot.type === "none"
