import type { AtRulesDto, AtSeenDto, LegDto, ModeRuleDto, NormalizedSpecDto, PathDto, PayoutLawDto } from "@p-lens/contracts/pachislot"

import type { Checkpoint } from "../play-log/checkpoint"
import { Err, Ok, type Result } from "../result/result"

/**
 * Where an AT machine stands at the seat, read off its counter and history:
 * the games since the last AT, the games since the last CZ and the CZs
 * missed since that AT where a CZ brings the AT, whether the settings had
 * been changed with no AT since, and what the 有利区間 held at the end of the
 * last AT where it still carries on.
 */
export interface AtSeat {
  readonly sinceAt: number
  readonly sinceCz: number | undefined
  readonly misses: number
  readonly afterReset: boolean
  readonly held: number | undefined
}

/** The first line of an AT machine's play: no games played and nothing spent yet, and where the machine stood. */
export const atSeatCheckpoint = (seat: AtSeat, at: string): Checkpoint => ({
  spins: 0,
  outlay: 0,
  at,
  counter: {
    spins: seat.sinceAt,
    ...(seat.sinceCz === undefined ? {} : { sinceCz: seat.sinceCz }),
    ...(seat.misses === 0 ? {} : { misses: seat.misses }),
    ...(seat.held === undefined ? {} : { held: seat.held }),
  },
  ...(seat.afterReset ? { afterReset: true as const } : {}),
})

/** A reading's lines with a CZ that did not win the AT on the last of them. */
export const czMissedAt = (checkpoints: readonly Checkpoint[]): readonly Checkpoint[] =>
  checkpoints.map((checkpoint, index) => (index === checkpoints.length - 1 ? { ...checkpoint, event: { kind: "cz-missed" as const } } : checkpoint))

/** What an AT machine's tiles keep and take back: an AT won, or a CZ missed. */
export type TakenBack = "at" | "cz-missed"

/** Why the last of them cannot be taken back: there is none, or the play has gone on past it. */
export type TakeBackRefusal = { readonly type: "none"; readonly taken: TakenBack } | { readonly type: "played-on"; readonly taken: TakenBack }

const EVENT_OF: Readonly<Record<TakenBack, "jackpot" | "cz-missed">> = { at: "jackpot", "cz-missed": "cz-missed" }

/** What may follow the last of them and go with it: how an AT went, said when it ended; nothing after a CZ. */
const GOES_WITH: Readonly<Record<TakenBack, readonly string[]>> = { at: ["at-ended"], "cz-missed": [] }

const plainOf = ({ event: _event, ...reading }: Checkpoint): Checkpoint => reading

/**
 * The log with the last AT won or CZ missed taken back, as a long press on
 * its tile does: the reading it was kept at stays as a plain reading, and
 * how an AT went, where that was said, goes with it. Only while nothing
 * else follows it: a reading after an AT counts its games from that AT, and
 * one after a CZ was read with it.
 */
export const withLastTakenBack = (ordered: readonly Checkpoint[], taken: TakenBack): Result<readonly Checkpoint[], TakeBackRefusal> => {
  const index = ordered.findLastIndex((checkpoint) => checkpoint.event?.kind === EVENT_OF[taken])
  const last = ordered.at(index)
  if (index < 0 || last === undefined) return Err({ type: "none", taken })
  if (ordered.slice(index + 1).some((checkpoint) => !GOES_WITH[taken].includes(checkpoint.event?.kind ?? ""))) return Err({ type: "played-on", taken })
  return Ok([...ordered.slice(0, index), plainOf(last)])
}

const endOf = (checkpoint: Checkpoint): LegDto["end"] | undefined => {
  switch (checkpoint.event?.kind) {
    case "jackpot":
      return "won-at"
    case "cz-missed":
      return "missed"
    case "at-ended":
    case "finished":
    case undefined:
      return undefined
  }
}

/** What was seen of an AT, as the engine takes it: only what was. */
const seenOf = (event: { readonly completed?: boolean; readonly sets?: number; readonly medals?: number }): AtSeenDto => ({
  ...(event.completed === undefined ? {} : { completed: event.completed }),
  ...(event.sets === undefined ? {} : { sets: event.sets }),
  ...(event.medals === undefined ? {} : { medals: event.medals }),
})

/** The legs with how the AT the last of them won went, where it ended in one. */
const withSeen = (legs: readonly LegDto[], seen: AtSeenDto): readonly LegDto[] => {
  const last = legs.at(-1)
  return last?.end === "won-at" ? [...legs.slice(0, -1), { ...last, at: seen }] : legs
}

/** A log's walk so far: where the leg still going began, and the legs ended. */
interface Walked {
  readonly from: number
  readonly legs: readonly LegDto[]
}

const step = (sofar: Walked, checkpoint: Checkpoint): Walked => {
  if (checkpoint.event?.kind === "at-ended") return { ...sofar, legs: withSeen(sofar.legs, seenOf(checkpoint.event)) }
  const end = endOf(checkpoint)
  return end === undefined ? sofar : { from: checkpoint.spins, legs: [...sofar.legs, { games: checkpoint.spins - sofar.from, end }] }
}

/**
 * Where play stood at the seat. The games since the last CZ are the games
 * since the last AT when the counter does not give them: no CZ since.
 */
const startOf = (first: Checkpoint): PathDto["start"] => ({
  sinceTrigger: first.counter?.sinceCz ?? first.counter?.spins ?? 0,
  sinceAt: first.counter?.spins ?? 0,
  misses: first.counter?.misses ?? 0,
  afterReset: first.afterReset === true,
  ...(first.counter?.held === undefined ? {} : { held: first.counter.held }),
})

/**
 * An AT machine's play as the engine walks it: where it stood at the seat,
 * then the regular games up to each CZ missed and each AT won, and those
 * since. An event on no new games — an AT the counter showed only after the
 * line before was written — is a leg of none, which the engine takes as
 * having come unseen. None before the first line.
 *
 * The log is pachinko's shape: `spins` are the play's regular games, an AT
 * is a jackpot.
 */
export const pathOf = (ordered: readonly Checkpoint[]): PathDto | undefined => {
  const first = ordered.at(0)
  const last = ordered.at(-1)
  if (first === undefined || last === undefined) return undefined
  const walked = ordered.reduce<Walked>(step, { from: first.spins, legs: [] })
  const going = last.spins - walked.from
  return { start: startOf(first), legs: going > 0 ? [...walked.legs, { games: going, end: "going" }] : walked.legs }
}

/** Where an AT machine's play stands at the end of its path, what the 有利区間 holds from the last AT included where it is known. */
export type AtStanding = PathDto["start"]

/** Medals fifty a ベース's games take: what a regular game loses on average. */
const BASE_MEDALS = 50

/**
 * What the 有利区間 holds when an AT is won: what the last AT left, less the
 * regular games' loss since, while the window it carries on for lasts; none
 * once it has passed, or where nothing was held.
 */
const holdingAt = (standing: AtStanding, rules: AtRulesDto | undefined): number | undefined => {
  if (rules?.window === undefined || standing.held === undefined || standing.sinceAt >= rules.window) return undefined
  return Math.max(0, standing.held - (BASE_MEDALS / rules.base) * standing.sinceAt)
}

/**
 * What an AT left the 有利区間 holding: none once it reached the cap, else
 * what it held when the AT was won and the AT's medals — as seen, or as its
 * sets come to on a machine paid in sets.
 */
const heldAfter = (seen: AtSeenDto | undefined, before: number | undefined, payout: PayoutLawDto | undefined): number | undefined => {
  if (seen === undefined || seen.completed === true) return undefined
  const gained = seen.medals ?? (seen.sets !== undefined && payout?.type === "sets" ? payout.first + seen.sets * payout.set : undefined)
  return gained === undefined ? undefined : (before ?? 0) + gained
}

const afterLeg =
  (normalized: NormalizedSpecDto | undefined) =>
  (standing: AtStanding, leg: LegDto): AtStanding => {
    switch (leg.end) {
      case "going":
        return { ...standing, sinceTrigger: standing.sinceTrigger + leg.games, sinceAt: standing.sinceAt + leg.games }
      case "missed":
        return { ...standing, sinceTrigger: 0, sinceAt: standing.sinceAt + leg.games, misses: standing.misses + 1 }
      case "won-at": {
        const before = holdingAt({ ...standing, sinceAt: standing.sinceAt + Math.max(0, leg.games - 1) }, normalized?.atRules)
        const held = heldAfter(leg.at, before, normalized?.tables[0]?.at?.payout)
        return { sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false, ...(held === undefined ? {} : { held }) }
      }
    }
  }

/** Where a path leaves play; the machine, where given, turns an AT's sets into medals and carries what a 有利区間 held from one AT to the next. */
export const standingOf = (path: PathDto, normalized?: NormalizedSpecDto): AtStanding => path.legs.reduce(afterLeg(normalized), path.start)

/**
 * A mode's AT間天井 in regular games: its own, or — in a spec stored in
 * shape 2, before each mode held one — the machine's one.
 */
export const atCeilingOf = (rules: AtRulesDto, mode: ModeRuleDto): number | undefined => mode.atCeiling ?? rules.atCeiling

/** A mode's スルー天井: its own, or the one a spec stored before each mode said its own gave every mode. */
export const missesOf = (rules: AtRulesDto, mode: ModeRuleDto): number | undefined => mode.misses ?? rules.misses

/** The deepest スルー天井 over a machine's modes; none where some mode has none. */
export const deepestMisses = (rules: AtRulesDto): number | undefined => deepest(rules.modes.map((mode) => missesOf(rules, mode)))

/** The modes some setting allots play to, after a setting change or after an AT. */
const reachableModes = (normalized: NormalizedSpecDto, afterReset: boolean): readonly ModeRuleDto[] =>
  (normalized.atRules?.modes ?? []).filter((_, index) =>
    normalized.tables.some((table) => ((afterReset ? table.at?.allotments.afterReset : table.at?.allotments.afterAt)?.[index] ?? 0) > 0),
  )

/** The deepest of the ceilings given, the one reached latest; none where there are none, or one of them is none. */
const deepest = (ceilings: readonly (number | undefined)[]): number | undefined =>
  ceilings.length === 0 || ceilings.some((ceiling) => ceiling === undefined) ? undefined : Math.max(...ceilings.map((ceiling) => ceiling ?? 0))

/**
 * How far play is from each of an AT machine's ceilings: regular games left
 * to the deepest ceiling of the trigger and of the AT間天井 over the modes
 * play may be in, and the CZs missed against the スルー天井. Each is there
 * only where the machine has it.
 */
export interface Ceilings {
  readonly trigger: number | undefined
  readonly at: number | undefined
  readonly misses: { readonly missed: number; readonly limit: number } | undefined
  /** In a 有利区間 carrying on after an AT: the games it has left, and the medals an AT won in them could gain before the cap. */
  readonly zone: { readonly games: number; readonly headroom: number } | undefined
}

const zoneOf = (standing: AtStanding, rules: AtRulesDto | undefined): Ceilings["zone"] => {
  const held = holdingAt(standing, rules)
  if (rules?.cap === undefined || rules.window === undefined || held === undefined) return undefined
  return { games: rules.window - standing.sinceAt, headroom: Math.max(0, rules.cap - held) }
}

export const ceilingsOf = (standing: AtStanding, normalized: NormalizedSpecDto): Ceilings => {
  const rules = normalized.atRules
  const modes = reachableModes(normalized, standing.afterReset)
  const trigger = deepest(modes.map((mode) => mode.ceiling))
  const at = rules === undefined ? undefined : deepest(modes.map((mode) => atCeilingOf(rules, mode)))
  return {
    trigger: trigger === undefined ? undefined : Math.max(0, trigger - standing.sinceTrigger),
    at: at === undefined ? undefined : Math.max(0, at - standing.sinceAt),
    misses: ((limit) => (limit === undefined ? undefined : { missed: standing.misses, limit }))(rules === undefined ? undefined : deepest(modes.map((mode) => missesOf(rules, mode)))),
    zone: zoneOf(standing, rules),
  }
}

/**
 * The seats 天井狙い is weighed at down a table, by the games since the last
 * AT: from none, every 50 games — every 100 past a 500-game ceiling — short
 * of the deepest ceiling play may be under, the AT間天井 or, where the AT is
 * won directly, its 天井; up to 1000 games without one. With CZs missed,
 * each seat is just after the last of them; without, the CZ has come no
 * sooner than the AT, so no seat is past the CZ's own ceiling, where one
 * would have come.
 */
export const huntSeatsOf = (normalized: NormalizedSpecDto, afterReset: boolean, misses: number): readonly AtStanding[] => {
  const rules = normalized.atRules
  if (rules === undefined) return []
  const modes = reachableModes(normalized, afterReset)
  const atCeiling = deepest(modes.map((mode) => (rules.trigger === undefined ? mode.ceiling : atCeilingOf(rules, mode)))) ?? 1000
  const czCeiling = rules.trigger === undefined || misses > 0 ? undefined : deepest(modes.map((mode) => mode.ceiling))
  const ceiling = Math.min(atCeiling, czCeiling ?? atCeiling)
  const step = ceiling > 500 ? 100 : 50
  return Array.from({ length: Math.ceil(ceiling / step) }, (_, index) => index * step).map((sinceAt) => ({
    sinceTrigger: misses > 0 ? 0 : sinceAt,
    sinceAt,
    misses,
    afterReset,
  }))
}

/** Whether how an AT went tells the engine anything: on a machine with a 有利区間's cap, or one paid in sets. */
export const atResultMatters = (normalized: NormalizedSpecDto): boolean =>
  normalized.atRules?.cap !== undefined || normalized.tables.some((table) => table.at?.payout.type === "sets")

/**
 * Whether an AT machine's play is in an AT by its log: from the line it was
 * won on until a reading of the regular games after it, how it went said
 * or not. What is counted then is no regular game's.
 */
export const inAt = (ordered: readonly Checkpoint[]): boolean => {
  const kind = ordered.at(-1)?.event?.kind
  return kind === "jackpot" || kind === "at-ended"
}

/** Whether an AT machine's AT is brought by a CZ. */
export const hasCz = (normalized: NormalizedSpecDto): boolean => normalized.atRules?.trigger !== undefined

/** Whether a setting change makes a difference on an AT machine: some setting allots play otherwise after one. */
export const resetMatters = (normalized: NormalizedSpecDto): boolean =>
  normalized.tables.some((table) => JSON.stringify(table.at?.allotments.afterAt) !== JSON.stringify(table.at?.allotments.afterReset))
