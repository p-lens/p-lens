import type { AtRulesDto, AtSeenDto, LegDto, ModeRuleDto, NormalizedSpecDto, PathDto, PayoutLawDto } from "@p-lens/contracts/pachislot"

import type { Checkpoint } from "../play-log/checkpoint"
import { Err, Ok, type Result } from "../result/result"

/**
 * Where an AT machine stands at the seat, read off its counter and history:
 * the games since the last AT, the games since the last CZ and the CZs
 * missed since that AT where a CZ brings the AT, whether the settings had
 * been changed with no AT since, what the 有利区間 held at the end of the
 * last AT where it still carries on, where a bonus that missed the AT
 * started the counter again the games since the AT itself across it, and
 * the mode play is in, by its id, where the person knows it.
 */
export interface AtSeat {
  readonly sinceAt: number
  readonly sinceCz: number | undefined
  readonly misses: number
  readonly afterReset: boolean
  readonly held: number | undefined
  readonly sinceAtAcrossBonuses: number | undefined
  readonly mode: string | undefined
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
    ...(seat.sinceAtAcrossBonuses === undefined ? {} : { sinceAtAcrossBonuses: seat.sinceAtAcrossBonuses }),
    ...(seat.mode === undefined ? {} : { mode: seat.mode }),
  },
  ...(seat.afterReset ? { afterReset: true as const } : {}),
})

/** A trigger that did not win the AT: a CZ that failed, or a bonus a CZ's success brought that missed it. */
export type Missed = "cz-missed" | "bonus-missed"

/** A reading's lines with a trigger that did not win the AT on the last of them. */
export const missedOn = (checkpoints: readonly Checkpoint[], kind: Missed): readonly Checkpoint[] =>
  checkpoints.map((checkpoint, index) => (index === checkpoints.length - 1 ? { ...checkpoint, event: { kind } } : checkpoint))

/** A reading's lines with a CZ that did not win the AT on the last of them. */
export const czMissedAt = (checkpoints: readonly Checkpoint[]): readonly Checkpoint[] => missedOn(checkpoints, "cz-missed")

/** What an AT machine's tiles keep and take back: an AT won, a CZ failed, or a bonus that missed the AT. */
export type TakenBack = "at" | Missed

/** Why the last of them cannot be taken back: there is none, or the play has gone on past it. */
export type TakeBackRefusal = { readonly type: "none"; readonly taken: TakenBack } | { readonly type: "played-on"; readonly taken: TakenBack }

const EVENT_OF: Readonly<Record<TakenBack, "jackpot" | Missed>> = { at: "jackpot", "cz-missed": "cz-missed", "bonus-missed": "bonus-missed" }

/** What may follow the last of them and go with it: how an AT went, said when it ended; nothing after a CZ. */
const GOES_WITH: Readonly<Record<TakenBack, readonly string[]>> = { at: ["at-ended"], "cz-missed": [], "bonus-missed": [] }

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
    case "bonus-missed":
      return "bonus"
    case "at-ended":
    case "finished":
    case undefined:
      return undefined
  }
}

/** What was seen of an AT, as the engine takes it: only what was. */
const seenOf = (event: { readonly completed?: boolean; readonly sets?: number; readonly medals?: number; readonly ending?: string }): AtSeenDto => ({
  ...(event.completed === undefined ? {} : { completed: event.completed }),
  ...(event.sets === undefined ? {} : { sets: event.sets }),
  ...(event.medals === undefined ? {} : { medals: event.medals }),
  ...(event.ending === undefined ? {} : { ending: event.ending }),
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
 * since the last AT when the counter does not give them: no CZ since. The
 * games since the AT itself across the bonuses that started the counter
 * again are there only where the seat gave them, and never fewer than
 * those since the last of them: a line written before the seat said so is
 * read as it always was. The mode is there where the seat said it.
 */
const startOf = (first: Checkpoint): PathDto["start"] => {
  const sinceAt = first.counter?.spins ?? 0
  const across = first.counter?.sinceAtAcrossBonuses
  return {
    sinceTrigger: first.counter?.sinceCz ?? sinceAt,
    sinceAt,
    misses: first.counter?.misses ?? 0,
    afterReset: first.afterReset === true,
    ...(first.counter?.held === undefined ? {} : { held: first.counter.held }),
    ...(across === undefined ? {} : { sinceAtAcrossBonuses: Math.max(across, sinceAt) }),
    ...(first.counter?.mode === undefined ? {} : { mode: first.counter.mode }),
  }
}

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

/** The games since the AT itself across the bonuses that started play again, where one did, so many games on. */
const acrossOn = (standing: AtStanding, games: number): Pick<AtStanding, "sinceAtAcrossBonuses"> =>
  standing.sinceAtAcrossBonuses === undefined ? {} : { sinceAtAcrossBonuses: standing.sinceAtAcrossBonuses + games }

/** Where a bonus starts play again on a machine with an AT間天井 counted from the AT across bonuses: the games since the AT itself, which it does not start again. */
const acrossBonus = (standing: AtStanding, games: number, rules: AtRulesDto): Pick<AtStanding, "sinceAtAcrossBonuses"> =>
  rules.ceilingAcrossBonuses === undefined ? {} : { sinceAtAcrossBonuses: (standing.sinceAtAcrossBonuses ?? standing.sinceAt) + games }

/** Where play stands with how the last AT ended let go of: after a bonus that starts play again, every ending's allotment mixed. */
const unended = ({ ending: _ending, ...standing }: AtStanding): AtStanding => standing

/** Where play stands with the mode it was said to be in let go of: after an AT, a bonus that starts play again, or a trigger missed where a miss may move play between modes. */
const unmoded = ({ mode: _mode, ...standing }: AtStanding): AtStanding => standing

/** Whether a missed trigger may move play between the machine's modes: where any setting gives a mode a row to move by. */
const missMoves = (normalized: NormalizedSpecDto | undefined): boolean =>
  (normalized?.tables ?? []).some((table) => (table.at?.redraws ?? []).length > 0 || (table.at?.ceilingRedraws ?? []).length > 0)

/** How an AT ended, where it was said. */
const endedAs = (seen: AtSeenDto | undefined): Pick<AtStanding, "ending"> => (seen?.ending === undefined ? {} : { ending: seen.ending })

const afterLeg =
  (normalized: NormalizedSpecDto | undefined) =>
  (standing: AtStanding, leg: LegDto): AtStanding => {
    switch (leg.end) {
      case "going":
        return { ...standing, sinceTrigger: standing.sinceTrigger + leg.games, sinceAt: standing.sinceAt + leg.games, ...acrossOn(standing, leg.games) }
      case "missed":
        return { ...(missMoves(normalized) ? unmoded(standing) : standing), sinceTrigger: 0, sinceAt: standing.sinceAt + leg.games, misses: standing.misses + 1, ...acrossOn(standing, leg.games) }
      case "bonus":
        return normalized?.atRules?.bonusMiss === "restarts"
          ? { ...unmoded(unended(standing)), sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false, ...acrossBonus(standing, leg.games, normalized.atRules) }
          : { ...(missMoves(normalized) ? unmoded(standing) : standing), sinceTrigger: 0, sinceAt: standing.sinceAt + leg.games, misses: standing.misses + 1, ...acrossOn(standing, leg.games) }
      case "won-at": {
        const before = holdingAt({ ...standing, sinceAt: standing.sinceAt + Math.max(0, leg.games - 1) }, normalized?.atRules)
        const held = heldAfter(leg.at, before, normalized?.tables[0]?.at?.payout)
        return { sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false, ...(held === undefined ? {} : { held }), ...endedAs(leg.at) }
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

/**
 * The games left to a mode's trigger ceiling where play stands: to its own,
 * counted from the last trigger, or to one counted from the last AT while
 * no trigger has come since its game; none where the mode has neither.
 */
const triggerCeilingOf = (mode: ModeRuleDto, standing: AtStanding): number | undefined => {
  const own = mode.ceiling === undefined ? undefined : mode.ceiling - standing.sinceTrigger
  const fromAt = mode.sinceAtCeiling !== undefined && standing.sinceAt < mode.sinceAtCeiling ? mode.sinceAtCeiling - standing.sinceAt : undefined
  return own === undefined ? fromAt : fromAt === undefined ? own : Math.min(own, fromAt)
}

/** The deepest スルー天井 over a machine's modes; none where some mode has none. */
export const deepestMisses = (rules: AtRulesDto): number | undefined => deepest(rules.modes.map((mode) => missesOf(rules, mode)))

/**
 * The modes some setting allots play to, after a setting change or after an
 * AT — one that ended the way `ending` names, where it names one.
 */
const reachableModes = (normalized: NormalizedSpecDto, afterReset: boolean, ending?: string): readonly ModeRuleDto[] => {
  const ended = ending === undefined || afterReset ? -1 : (normalized.atRules?.endings ?? []).indexOf(ending)
  return (normalized.atRules?.modes ?? []).filter((_, index) =>
    normalized.tables.some((table) => {
      const allotments = table.at?.allotments
      const shares = afterReset ? allotments?.afterReset : (allotments?.afterEndings?.[ended]?.afterAt ?? allotments?.afterAt)
      return (shares?.[index] ?? 0) > 0
    }),
  )
}

/** The mode play was said to be in, where it was said and the machine has it; else the modes given. */
const saidOr = (normalized: NormalizedSpecDto, mode: string | undefined, modes: readonly ModeRuleDto[]): readonly ModeRuleDto[] =>
  ((said) => (said === undefined ? modes : [said]))((normalized.atRules?.modes ?? []).find((each) => each.id === mode))

/** The deepest of the ceilings given, the one reached latest; none where there are none, or one of them is none. */
const deepest = (ceilings: readonly (number | undefined)[]): number | undefined =>
  ceilings.length === 0 || ceilings.some((ceiling) => ceiling === undefined) ? undefined : Math.max(...ceilings.map((ceiling) => ceiling ?? 0))

/**
 * How far play is from each of an AT machine's ceilings: regular games left
 * to the deepest ceiling of the trigger and of the AT間天井 over the modes
 * play may be in — or to the AT間天井 counted from the AT across bonuses,
 * where it comes sooner — and the CZs missed against the スルー天井. Each is
 * there only where the machine has it.
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

/** The sooner of two ceilings, where either is. */
const sooner = (one: number | undefined, other: number | undefined): number | undefined => (one === undefined ? other : other === undefined ? one : Math.min(one, other))

export const ceilingsOf = (standing: AtStanding, normalized: NormalizedSpecDto): Ceilings => {
  const rules = normalized.atRules
  const modes = saidOr(normalized, standing.mode, reachableModes(normalized, standing.afterReset, standing.ending))
  const trigger = deepest(modes.map((mode) => triggerCeilingOf(mode, standing)))
  const at = rules === undefined ? undefined : deepest(modes.map((mode) => atCeilingOf(rules, mode)))
  const across = rules?.ceilingAcrossBonuses === undefined ? undefined : rules.ceilingAcrossBonuses - (standing.sinceAtAcrossBonuses ?? standing.sinceAt)
  const left = sooner(at === undefined ? undefined : at - standing.sinceAt, across)
  return {
    trigger: trigger === undefined ? undefined : Math.max(0, trigger),
    at: left === undefined ? undefined : Math.max(0, left),
    misses: ((limit) => (limit === undefined ? undefined : { missed: standing.misses, limit }))(rules === undefined ? undefined : deepest(modes.map((mode) => missesOf(rules, mode)))),
    zone: zoneOf(standing, rules),
  }
}

/**
 * The seats 天井狙い is weighed at down a table, by the games since the last
 * AT: from none, every 50 games — every 100 past a 500-game ceiling — short
 * of the deepest ceiling play may be under, the AT間天井 — or the one counted
 * from the AT across bonuses, where it comes sooner — or, where the AT is
 * won directly, its 天井; up to 1000 games without one. With CZs missed,
 * each seat is just after the last of them; without, the CZ has come no
 * sooner than the AT, so no seat is past the CZ's own ceiling, where one
 * would have come. Where the CZ a ceiling counted from the AT forces
 * certainly succeeds, no seat is at or past it in every mode play may be
 * in, whatever was missed: that CZ ends the count. Where the last AT is
 * said to have ended a given way, the seats say so and reach only the
 * modes an AT that ended so allots play to; after a setting change, how it
 * ended is of no account. Where the machine has a side bonus with a
 * ceiling and the games since the last of it are said, every seat says
 * them — never past that ceiling, which brings it on the next game at the
 * latest; unsaid, it is as likely on any game as in the long run. Where the
 * mode play is in is said, the seats say so and reach that mode alone.
 */
export const huntSeatsOf = (normalized: NormalizedSpecDto, afterReset: boolean, misses: number, ending?: string, sinceSideBonus?: number, mode?: string): readonly AtStanding[] => {
  const rules = normalized.atRules
  if (rules === undefined) return []
  const ended = afterReset || ending === undefined || !(rules.endings ?? []).includes(ending) ? undefined : ending
  const said = rules.modes.find((each) => each.id === mode)?.id
  const modes = saidOr(normalized, said, reachableModes(normalized, afterReset, ended))
  const atCeiling = sooner(deepest(modes.map((mode) => (rules.trigger === undefined ? mode.ceiling : atCeilingOf(rules, mode)))), rules.ceilingAcrossBonuses) ?? 1000
  const czCeiling = rules.trigger === undefined || misses > 0 ? undefined : deepest(modes.map((mode) => (mode.ceiling === undefined ? mode.sinceAtCeiling : mode.sinceAtCeiling === undefined ? mode.ceiling : Math.min(mode.ceiling, mode.sinceAtCeiling))))
  const sure = rules.forcedCz === "wins" ? deepest(modes.map((mode) => mode.sinceAtCeiling)) : undefined
  const ceiling = Math.min(atCeiling, czCeiling ?? atCeiling, sure ?? atCeiling)
  const step = ceiling > 500 ? 100 : 50
  const sideCeiling = rules.sideBonus?.ceiling
  return Array.from({ length: Math.ceil(ceiling / step) }, (_, index) => index * step).map((sinceAt) => ({
    sinceTrigger: misses > 0 ? 0 : sinceAt,
    sinceAt,
    misses,
    afterReset,
    ...(ended === undefined ? {} : { ending: ended }),
    ...(said === undefined ? {} : { mode: said }),
    ...(sinceSideBonus === undefined || sideCeiling === undefined ? {} : { sinceSideBonus: Math.min(sinceSideBonus, sideCeiling - 1) }),
  }))
}

/** One way an AT of the machine ends, by its id and as its sheet names it. */
export interface AtEnding {
  readonly id: string
  readonly label: string
}

/** One mode of the machine, by its id and as its sheet names it. */
export interface AtMode {
  readonly id: string
  readonly label: string
}

/** The modes of an AT machine that has more than one, in the engine's order, named as the spec's labels name them; none where it has one or none. */
export const atModesOf = (normalized: NormalizedSpecDto, labels: Readonly<Record<string, string>>): readonly AtMode[] =>
  ((modes) => (modes.length > 1 ? modes.map(({ id }) => ({ id, label: labels[id]?.trim() || id })) : []))(normalized.atRules?.modes ?? [])

/** The ways an AT of the machine ends, where its modes are allotted by them, in the engine's order, named as the spec's labels name them; none where they are not. */
export const atEndingsOf = (normalized: NormalizedSpecDto, labels: Readonly<Record<string, string>>): readonly AtEnding[] =>
  (normalized.atRules?.endings ?? []).map((id) => ({ id, label: labels[id]?.trim() || id }))

/** Whether what an AT gained tells the engine anything: on a machine with a 有利区間's cap, or one paid in sets. */
export const atGainMatters = (normalized: NormalizedSpecDto): boolean =>
  normalized.atRules?.cap !== undefined || normalized.tables.some((table) => table.at?.payout.type === "sets")

/** Whether how an AT went tells the engine anything: what it gained, or how it ended on a machine whose modes are allotted by it. */
export const atResultMatters = (normalized: NormalizedSpecDto): boolean => atGainMatters(normalized) || (normalized.atRules?.endings ?? []).length > 0

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
