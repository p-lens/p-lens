/**
 * The shapes crossing the pachislot engine's boundary, as JSON. Mirrors
 * `crates/pachislot-wasm/src/dto.rs`; a change there is a change here, and the
 * fixtures under `fixtures/pachislot/made-up/` are read by the tests on both sides.
 *
 * Kept apart from the pachinko shapes: the two games share nothing but how a
 * probability is written.
 */

import type { ProbabilityDto } from "../probability.ts"

export type { ProbabilityDto }

/** One setting's value. Settings are `1` to `6`; a machine lists the ones it has. */
export interface BySettingLevelDto<T> {
  readonly settingLevel: number
  readonly value: T
}

/**
 * The version of the shape a spec is written in — its entities, a table per
 * component, its resources — which every spec says of itself in `v`. An
 * engine met with another version refuses the spec by that number rather
 * than misread it. A component added is no new version: a table an engine
 * does not know is refused by its name. Only the shape itself changing is.
 */
export const SPEC_VERSION = 1

/**
 * A pachislot machine as an ECS world: its entities — the bonuses and small
 * wins a regular game can come up with — a table per component keyed by
 * entity, and the resources the whole machine shares. A table no entity has
 * is left out; a table the engine does not know is refused as
 * `unsupported-component`. A feature is a component, not a new shape.
 */
export interface SpecDto {
  readonly v: number
  readonly entities: readonly string[]
  readonly components: ComponentsDto
  readonly resources: {
    /** The settings the machine has: `1` to `6`, or some of them. */
    readonly settingLevels: readonly number[]
    /** Medals a regular game takes. */
    readonly bet: number
    /** ベース, for a machine of an AT: regular games fifty medals last. */
    readonly base?: number
    /** For ceilings counted on the screen: the screen's games a regular game comes to on average, one or more. */
    readonly lcdRate?: number
    /** For the trigger's ceilings counted in something other than games — points, periods — what it is and how much of it a regular game comes to on average. Not beside `lcdRate`. */
    readonly ceilingUnit?: { readonly name: string; readonly perGame: number }
    /** 有利区間の上限: medals a 有利区間 may gain from its lowest point before it ends. */
    readonly cap?: number
  }
}

/** A share of an AT's medals won at another 純増: the medals a game gains there, and the share in hundredths of a percent. */
export interface OtherNetDto {
  readonly net: number
  readonly shareBasisPoints: number
}

export interface ComponentsDto {
  readonly label?: Readonly<Record<string, string>>
  /** How often a regular game comes up with it, under each setting. On a CZ, an AT won directly or a side bonus, in place of its `firstHit`: its chance a regular game below its ceilings, taken as it is, the 合算 then worked out. */
  readonly chance?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** Medals a small win pays, or a bonus gains over its own games — a CZ that is a bonus too, each time it comes; a bonus needs none when the rate is measured. */
  readonly payout?: Readonly<Record<string, number>>
  /** A bonus: BIG, REG. Its chance is its own, or the sum of its parts'. Beside `cz`, a bonus that brings the AT in a CZ's place. */
  readonly bonus?: readonly string[]
  /** A replay: the next game costs nothing. */
  readonly replay?: readonly string[]
  /** One way a bonus is won — 単独, チェリー重複 — counted apart by a player who tells them apart. */
  readonly partOf?: Readonly<Record<string, string>>
  /** An AT: won from regular games, gaining its payout over games of its own. A machine of an AT is its AT, its CZ if one brings it, and its ベース. */
  readonly at?: readonly string[]
  /** A CZ: a trigger from regular games that wins the AT at a setting's success rate. */
  readonly cz?: readonly string[]
  /** On a CZ whose success brings a bonus: a bonus that misses the AT starts play again as after an AT — its ceilings, スルー天井 and modes counted from the bonus. */
  readonly restart?: readonly string[]
  /** On a CZ: the CZ its ceiling counted from the AT — or from the last bonus, where play starts again at one — brings certainly succeeds. */
  readonly ceilingWins?: readonly string[]
  /** On an AT a CZ brings: its AT間天井 — after an AT or a setting change, in games or in the unit, a mode's own included — brings the trigger, which certainly wins it, rather than the AT outright: counted in the published 合算 and paying the trigger's medals as any other. */
  readonly ceilingTriggers?: readonly string[]
  /** On an AT whose AT間天井 brings the trigger (`ceilingTriggers`), a bonus that pays: what the bonus brought there pays, where it is one of its own rather than the trigger's average — BIRDIE WING's BB at its ceiling. Its games are counted at the trigger's 純増. */
  readonly ceilingPayout?: Readonly<Record<string, number>>
  /** A side bonus on an AT machine — a フランボーナス — drawn beside its trigger at its own chance a regular game: its `chance` below its own `ceiling`, or its `firstHit` as published, that ceiling included. The ceiling counts regular games from the last of it, and no AT starts it again. It pays its `payout`, over games of its own where its `netPerGame` is given, and wins nothing. One at the most. */
  readonly sideBonus?: readonly string[]
  /** On an AT a CZ brings, where a bonus that misses the AT starts play again (`restart`): an AT間天井 in regular games counted from the last AT across those bonuses, which none of them starts again — 1600G from the AT beside an 800G ceiling counted from each bonus. Whichever AT間天井 comes first wins it. */
  readonly ceilingAcrossBonuses?: Readonly<Record<string, number>>
  /** 初当たり: how often an AT — or the CZ that brings it, or a side bonus — comes up, ceilings included, as analysis sheets publish it, under each setting; read back to its chance below the ceilings. */
  readonly firstHit?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** A CZ's chance of winning the AT, in hundredths of a percent, under each setting. */
  readonly success?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** On a CZ whose success brings a bonus before the AT: how often that bonus wins the AT, in hundredths of a percent, under each setting. The bonus pays the CZ's `payout` over its `netPerGame` each time a CZ succeeds, and one missing the AT is a CZ missed. */
  readonly bonusShare?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** 天井: on the trigger — a CZ, or an AT without one — the regular game since the last one on which it comes at the latest; on an AT a CZ brings, the AT間天井 in regular games since the last AT. */
  readonly ceiling?: Readonly<Record<string, number>>
  /** The trigger's ceiling after the settings are changed, until the first AT. */
  readonly resetCeiling?: Readonly<Record<string, number>>
  /** スルー天井: the CZs missed since the last AT after which the next one wins it. */
  readonly misses?: Readonly<Record<string, number>>
  /** An AT paid in sets: its first set's medals, and each further set's. Given with its `continuationRate`, in place of a `payout`. */
  readonly sets?: Readonly<Record<string, { readonly first: number; readonly set: number }>>
  /** 継続率: how often an AT in sets carries on to one more, in hundredths of a percent, under each setting. */
  readonly continuationRate?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** An AT's medals as a table under each setting — so many medals, so often in hundredths of a percent — in place of a `payout`. */
  readonly payoutTable?: Readonly<Record<string, readonly BySettingLevelDto<readonly PayoutRowDto[]>[]>>
  /** 純増: medals a game of an AT gains. It says the games an AT of so many medals takes, so with it an AT's gain and the machine's 機械割 each follow from the other. On a CZ that is a bonus, the games its medals take. */
  readonly netPerGame?: Readonly<Record<string, number>>
  /** 上位AT, or a bonus inside the AT: shares of an AT's medals won at another 純増 than its `netPerGame`, which the rest are won at. */
  readonly otherNet?: Readonly<Record<string, readonly OtherNetDto[]>>
  /** 機械割 as published, in hundredths of a percent under each setting: what an AT gains is what it and the `netPerGame` imply, in place of a `payout`. */
  readonly rate?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** 引き戻し: regular games after an AT short of the cap for which its 有利区間 carries on. Needs a `cap`. */
  readonly window?: Readonly<Record<string, number>>
  /** ATs after which, on reaching the cap, play starts again as after a setting change. Needs a `cap`. */
  readonly resetOnCap?: readonly string[]
  /** A mode: a hidden state between ATs with a ceiling of its own — 天国, 通常A — inferred, never seen. */
  readonly mode?: readonly string[]
  /** 振り分け: how often play enters a mode after an AT, in hundredths of a percent, under each setting; on every mode, or — where every mode is allotted after every ending — on none, the endings' mix standing for it. */
  readonly allotment?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** How often play enters a mode after a setting change, where that differs; every mode has one, or none does. */
  readonly resetAllotment?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** An ending: one way an AT ends — 駆け抜け, 上位AT — with its share of ATs in hundredths of a percent under each setting, a machine's endings the whole of them. Only on a machine of modes, which some mode is allotted otherwise after. */
  readonly ending?: Readonly<Record<string, readonly BySettingLevelDto<number>[]>>
  /** On a mode: how often play enters it after an AT that ended a given way, by the ending, in hundredths of a percent under each setting, in place of its `allotment` after that ending; an ending a mode leaves out takes its `allotment`. */
  readonly endingAllotment?: Readonly<Record<string, Readonly<Record<string, readonly BySettingLevelDto<number>[]>>>>
  /** A mode's own AT間天井 in regular games, in place of the AT's, on a machine a CZ brings the AT on: an AT間天井 drawn after each AT is a mode for each. */
  readonly atCeiling?: Readonly<Record<string, number>>
  /** A watch: what a player watches over each of a bonus — its games for a スイカ, its side lamp once — named by the bonus, and never a regular game's. */
  readonly watch?: Readonly<Record<string, string>>
  /** The trials each of a watch's bonus gives it — a BIG's games — one where left out. */
  readonly trials?: Readonly<Record<string, number>>
  /** On an AT a CZ brings: how often a regular game wins it outright, before the CZ is drawn, below the ceilings, under each setting. */
  readonly direct?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** On an AT a CZ brings, whose success brings a bonus: how often a regular game brings that bonus outright, past the CZ, below the ceilings, under each setting — drawn after the AT outright, before the CZ. It pays the CZ's `payout` and wins the AT at its `bonusShare`; one that misses leaves play where it stood. */
  readonly directBonus?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** On a CZ: the regular game since the last AT on which it comes at the latest, once — a bonus's ceiling that a bonus missing the AT does not start again. Needs an AT間天井 beyond it. On a mode, the same for play in it, in place of the CZ's. */
  readonly sinceAtCeiling?: Readonly<Record<string, number>>
  /** On the CZ of a machine without modes: its `sinceAtCeiling` after a setting change, until the first AT — 979G from the AT, 579G after a reset. Only beside `sinceAtCeiling`; with modes, each mode carries its own. */
  readonly resetSinceAtCeiling?: Readonly<Record<string, number>>
  /** On a CZ: a meter its misses fill — 宿怨ポイント — the points that fill it, and what a miss adds, each so many points at its share of misses in hundredths of a percent under each setting; the rest add none. Full, it makes the next trigger certainly win the AT; an AT empties it. */
  readonly meter?: Readonly<Record<string, MeterDto>>
  /** ゾーン: on a mode, or on the CZ of a machine without modes, the regular games since the last AT it draws at besides its chance a game. */
  readonly gates?: Readonly<Record<string, readonly GateDto[]>>
  /** On a mode: where a missed trigger in it moves play — the mode drawn again at each failed CZ — each mode it may go to with its share under each setting, the whole of it. A mode without stays. */
  readonly redraw?: Readonly<Record<string, readonly RedrawDto[]>>
  /** On a mode: where a missed trigger that came on its ceiling moves play, where that differs from `redraw` — a ceiling CZ that shortens the next ceiling. */
  readonly ceilingRedraw?: Readonly<Record<string, readonly RedrawDto[]>>
  /** A ceiling counted in the machine's `ceilingUnit` — points, 周期 — reaching what `ceiling` does, whichever comes first: on the trigger its ceiling, on an AT a CZ brings its AT間天井, on a mode its trigger's. Beside one anywhere in a spec, every `ceiling` counts games; a spec with a unit and none counts its trigger's `ceiling` in the unit. */
  readonly unitCeiling?: Readonly<Record<string, number>>
  /** The same after the settings are changed, until the first AT. */
  readonly resetUnitCeiling?: Readonly<Record<string, number>>
  /** A mode's own AT間天井 counted in the machine's unit. */
  readonly atUnitCeiling?: Readonly<Record<string, number>>
  /** On a mode: the trigger's chance a regular game in it, under each setting, in place of the one read back from the 合算 — a CZ連 at 1/19.7 a game. */
  readonly triggerChance?: Readonly<Record<string, readonly BySettingLevelDto<ProbabilityDto>[]>>
  /** On a mode: the games since its last trigger after which, none come, play moves to the mode `to` names. */
  readonly expiry?: Readonly<Record<string, { readonly games: number; readonly to: string }>>
  /** A cue: one thing a watch may show on a trial — a スイカ, a lamp's colour — named by the watch. Its `chance` is a trial's; a watch's cues never share a trial. */
  readonly cue?: Readonly<Record<string, string>>
}

export interface PayoutRowDto {
  readonly medals: number
  readonly share: number
}

/** What an outcome is: a bonus, a small win — with no payout of its own on an AT machine, whose ベース counts it — or a replay. */
export type EventKindDto =
  | { readonly type: "bonus"; readonly payout?: number }
  | { readonly type: "role"; readonly payout?: number }
  | { readonly type: "replay" }

export interface EventDto {
  readonly id: string
  /** The bonus a part belongs to. */
  readonly group?: string
  readonly kind: EventKindDto
  readonly chance: number
}

export interface TableDto {
  readonly settingLevel: number
  readonly events: readonly EventDto[]
  /** An AT machine's setting; its events are then the small wins and replays counted in its regular games. */
  readonly at?: AtTableDto
  /** Each watch's cues and their chances on a trial. */
  readonly cues?: readonly CueDto[]
}

/** One cue of a watch and its chance on a trial. */
export interface CueDto {
  readonly id: string
  readonly watch: string
  readonly chance: number
}

/**
 * A watch: the bonus it is watched over, the trials each of the bonus
 * gives, and whether a trial shows one of its cues certainly — then a trial
 * with none counted was not watched, and otherwise it showed none.
 */
export interface WatchDto {
  readonly id: string
  readonly bonus: string
  readonly trials: number
  readonly whole: boolean
}

/** A zone: the regular game since the last AT it is on, and the shares of play still going there that it brings the trigger to and wins the AT outright on, in hundredths of a percent under each setting — the two together no more than the whole. */
export interface GateDto {
  readonly game: number
  /** The games the zone draws over, evenly game by game, from `game` on — a 引き戻し of 66 games; one where it is left out. */
  readonly span?: number
  readonly trigger: readonly BySettingLevelDto<number>[]
  readonly at?: readonly BySettingLevelDto<number>[]
}

/** One mode a missed trigger may move play to, and how often, in hundredths of a percent under each setting. */
/** A meter a CZ's misses fill: the points that fill it, and what a miss adds. */
export interface MeterDto {
  readonly full: number
  readonly gains: readonly { readonly points: number; readonly share: readonly BySettingLevelDto<number>[] }[]
}

export interface RedrawDto {
  readonly to: string
  readonly share: readonly BySettingLevelDto<number>[]
}

/** A zone under one setting: its game, and the chances play still going there brings the trigger and wins the AT outright. */
export interface GateChanceDto {
  readonly game: number
  readonly trigger: number
  readonly at?: number
}

/**
 * An AT machine's setting: the trigger's chance a regular game below its
 * ceilings, its chance of winning the AT (one for an AT won directly), and
 * how play is allotted between the modes in the order of its rules, after an
 * AT and after a setting change; each sums to one.
 */
export interface AtTableDto {
  readonly chance: number
  readonly success: number
  /** How often a regular game wins the AT outright; none where only the trigger does. */
  readonly direct?: number
  /** How often a regular game brings the bonus a CZ's success brings outright, those that win the AT counted in `direct` too; none where only a CZ brings it. */
  readonly directBonus?: number
  /** The share of triggers that pay the trigger's medals: the CZ's success where it brings a bonus; every one where it is left out. */
  readonly paid?: number
  /** Where a CZ's success brings a bonus, the share of those bonuses that win the AT; all of them where it is left out. */
  readonly bonusShare?: number
  /** Each mode's zones under the setting, in the order of the rules' modes; left out where no mode has any. */
  readonly gates?: readonly (readonly GateChanceDto[])[]
  /** Each mode's own chance a trigger wins the AT, in the order of the rules' modes; left out where every mode takes `success`. */
  readonly successes?: readonly number[]
  /** Where a missed trigger moves play, a row of shares over the modes for each; left out where play stays in its mode from one AT to the next. */
  readonly redraws?: readonly (readonly number[])[]
  /** Where a missed trigger that came on its mode's ceiling moves play; left out where `redraws` says. */
  readonly ceilingRedraws?: readonly (readonly number[])[]
  /** Each mode's own chance a game brings the trigger, `null` for one at the table's `chance`; left out where no mode has one. */
  readonly ownChances?: readonly (number | null)[]
  /** The side bonus's chance a regular game below its ceiling; left out where the machine has none. */
  readonly sideChance?: number
  /** Where the trigger has a meter: the chance the trigger after so many misses since the AT comes with it full, the last holding past it; left out where it has none. */
  readonly meterWins?: readonly number[]
  /**
   * How play is allotted between the modes after an AT and after a setting
   * change; where the modes are allotted by how an AT ended, each ending's
   * share and allotment in the order of `atRules.endings` — `afterAt` being
   * them weighed by their shares, which every figure is worked from.
   */
  readonly allotments: {
    readonly afterAt: readonly number[]
    readonly afterReset: readonly number[]
    readonly afterEndings?: readonly { readonly share: number; readonly afterAt: readonly number[] }[]
  }
  readonly payout: PayoutLawDto
}

/** What an AT gains under a setting: a fixed figure, sets carried on at a 継続率, or a table of medals and their chances. */
export type PayoutLawDto =
  | { readonly type: "fixed"; readonly medals: number }
  | { readonly type: "sets"; readonly first: number; readonly set: number; readonly continuationRate: number }
  | { readonly type: "table"; readonly rows: readonly { readonly medals: number; readonly probability: number }[] }

export interface NormalizedSpecDto {
  readonly schemaVersion: number
  readonly bet: number
  readonly tables: readonly TableDto[]
  /** An AT machine's regular games; each table then holds its setting's `at`. */
  readonly atRules?: AtRulesDto
  /** What a player watches over each of a bonus; each table then holds its cues. */
  readonly watches?: readonly WatchDto[]
}

/** One mode of an AT machine: its trigger's ceiling and its AT間天井, in regular games, where it has them. */
export interface ModeRuleDto {
  readonly id: string
  readonly ceiling?: number
  readonly atCeiling?: number
  /** スルー天井: the triggers missed since the last AT after which the next wins it, the mode's own or the CZ's. */
  readonly misses?: number
  /** The regular game since the last AT on which the trigger comes at the latest, once. */
  readonly sinceAtCeiling?: number
  /** Where play moves — `to`, by its place among the rules' modes — once so many games since the trigger bring none in it. */
  readonly expiry?: { readonly games: number; readonly to: number }
}

/**
 * An AT machine's regular games: its ベース, its AT, the CZ that brings it
 * if one does, its modes with the trigger's ceiling and their AT間天井 in
 * regular games — a machine without modes has one, and a second for the
 * shorter ceilings of a setting change — its スルー天井, its 純増 where the
 * 機械割 is to follow from what its AT gains, and its 有利区間: the cap,
 * the games it carries on after an AT short of it, and whether play starts
 * again as after a setting change once an AT reaches it.
 */
export interface AtRulesDto {
  readonly base: number
  readonly at: string
  readonly trigger?: string
  readonly modes: readonly ModeRuleDto[]
  /** The one AT間天井 of a spec stored in shape 2, which every mode is read to have; never written since. */
  readonly atCeiling?: number
  /** The one スルー天井 of a spec stored before each mode said its own, which every mode is read to have; never written since. */
  readonly misses?: number
  readonly netPerGame?: number
  readonly cap?: number
  readonly window?: number
  readonly resetOnCap?: boolean
  /** Whether the trigger is a bonus that wins the AT at a share, rather than a CZ. */
  readonly triggerIsBonus?: boolean
  /** What the trigger pays each time it comes, where it is a bonus whose medals are known: its medals, and its 純増 where its games are counted. A win on the AT間天井 pays it in full where the AT間天井 brings the trigger (`ceilingAt`), and none otherwise. */
  readonly triggerPayout?: { readonly medals: number; readonly netPerGame?: number }
  /** What a bonus a CZ's success brings does when it misses the AT: counted as a miss, or — `restarts` — starting play again as after an AT. Counted where left out. */
  readonly bonusMiss?: "counted" | "restarts"
  /** How the CZ a ceiling counted from the AT forces fares: at the CZ's rate, or — `wins` — certainly succeeding. Drawn where left out. */
  readonly forcedCz?: "drawn" | "wins"
  /** How the AT間天井 wins the AT: outright, or — `triggered` — by the trigger it brings, which certainly wins, counted in the 合算 and paying its medals. Outright where left out. */
  readonly ceilingAt?: "outright" | "triggered"
  /** Where a bonus that misses the AT starts play again: an AT間天井 in regular games counted from the last AT across those bonuses, beside each mode's own counted from the bonus. None where left out. */
  readonly ceilingAcrossBonuses?: number
  /** What the trigger the AT間天井 brings pays, where it is a bonus of its own rather than the trigger's medals. None where left out. */
  readonly ceilingPayout?: number
  /** The ways an AT ends, where the modes are allotted by them: each table's `allotments.afterEndings` in this order. Left out where they are not. */
  readonly endings?: readonly string[]
  /** A bonus beside the trigger, drawn at each table's `sideChance` a game, certain on its own ceiling in regular games since the last of it — which no AT starts again — paying its medals and winning nothing. Left out where the machine has none. */
  readonly sideBonus?: { readonly id: string; readonly ceiling?: number; readonly payout: { readonly medals: number; readonly netPerGame?: number } }
}

export type SourceDto =
  | { readonly type: "spec"; readonly spec: SpecDto }
  | { readonly type: "normalized"; readonly normalized: NormalizedSpecDto }

/** How each setting's payout rate is come to: from the spec, or as measured, in hundredths of a percent. */
export type PayoutBasisDto =
  | { readonly type: "from-spec" }
  | { readonly type: "measured"; readonly bySettingLevel: readonly BySettingLevelDto<number>[] }

export interface ConditionsDto {
  readonly payoutRate: PayoutBasisDto
}

/**
 * The player's terms: yen a medal is exchanged for, yen renting one costs, the
 * share of the medals played that was rented for cash (`0..=1`), the share
 * drawn from savings and the medals a replay takes off them for each it pays
 * out (none and one where left out), and games an hour.
 */
export interface PlayDto {
  readonly medalValue: number
  readonly rentalPrice: number
  readonly cashShare: number
  readonly replayShare?: number
  readonly replayRate?: number
  readonly gamesPerHour?: number
}

export interface AnalyzeRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  /** The work the call may take, in steps of walking play game by game; none where it may take as much as it needs. */
  readonly steps?: number
}

export interface BonusFigureDto {
  readonly id: string
  readonly chance: number
}

export interface ContributionDto {
  /** Absent for the games that pay nothing. */
  readonly id?: string
  readonly chance: number
  readonly medalsPerGame: number
}

export interface SettingLevelFiguresDto {
  readonly settingLevel: number
  readonly netPerGame: number
  /** 機械割 as a ratio: `1.055` is 105.5%. */
  readonly payoutRate: number
  readonly bonuses: readonly BonusFigureDto[]
  readonly combined: number
  readonly derivation: readonly ContributionDto[]
  /**
   * On an AT machine: the medals an AT gains on average, cap and carried
   * 有利区間 included, the share that reach the cap, and the triggers a
   * cycle's AT間天井 brings where it brings one — none where it wins the AT
   * outright — the bonuses a cycle's games bring outright, past the CZ,
   * where they do, and the side bonuses they bring in the long run, where
   * the machine has one.
   */
  readonly at?: { readonly gain: number; readonly completion: number; readonly ceilingTriggers?: number; readonly directBonuses?: number; readonly sideBonuses?: number }
}

export interface AnalysisDto {
  readonly engineVersion: number
  readonly schemaVersion: number
  readonly normalized: NormalizedSpecDto
  readonly settingLevels: readonly SettingLevelFiguresDto[]
}

export interface CountDto {
  readonly id: string
  readonly count: number
}

/** A stretch of regular games seen the same way, and what was counted in it. */
export interface SegmentDto {
  readonly games: number
  readonly counts: readonly CountDto[]
}

/**
 * What an AT machine's play went through: where it stood when first seen —
 * regular games since the last trigger and since the last AT, triggers missed
 * since that AT, and whether the settings had been changed with no AT since —
 * then each leg of regular games and how its last game ended.
 */
export interface PathDto {
  readonly start: {
    readonly sinceTrigger: number
    readonly sinceAt: number
    readonly misses: number
    readonly afterReset: boolean
    /** What the 有利区間 held at the end of the last AT, where it carries on into the games since. */
    readonly held?: number
    /** Where a bonus that missed the AT started play again since it: the regular games since the AT itself, across those bonuses, `sinceAt` counting from the last of them. Left out where none did. */
    readonly sinceAtAcrossBonuses?: number
    /** How the last AT ended, by the ending's id, where it is said: play then starts from that ending's allotment rather than every ending's mixed. Of no account after a setting change. */
    readonly ending?: string
    /** The regular games since the last side bonus, where the machine has one and the seat says; left out, its next is as likely on any game as in the long run. */
    readonly sinceSideBonus?: number
    /** The mode play is in, by the mode's id, where the person knows it — the shortened ceiling after a ceiling CZ, a 天国 told on screen: play is taken to be in it, whatever the allotment and the games since would have made likely, and past its trigger's ceiling stands just short of it. */
    readonly mode?: string
  }
  readonly legs: readonly LegDto[]
}

export interface LegDto {
  readonly games: number
  readonly end: "going" | "missed" | "bonus" | "won-at"
  /** What was seen of the AT a leg ending in one won. */
  readonly at?: AtSeenDto
}

/** Whether an AT reached the cap, the sets it carried on to past its first, the medals it gained, and how it ended — each where it was seen. */
export interface AtSeenDto {
  readonly completed?: boolean
  readonly sets?: number
  readonly medals?: number
  /** How the AT ended, by the ending's id, where it was said: play after it then starts from that ending's allotment rather than every ending's mixed. */
  readonly ending?: string
}

/** 設定配分: shares in hundredths of a percent, summing to `10000`. */
export interface DistributionDto {
  readonly shares: readonly BySettingLevelDto<number>[]
}

export interface PosteriorRequest {
  readonly source: SourceDto
  readonly prior?: DistributionDto
  readonly segments: readonly SegmentDto[]
  /** An AT machine's path. */
  readonly path?: PathDto
  /** An AT machine's play told by its totals afterwards, read in place of the segments and the path. */
  readonly told?: ToldPathDto
}

/**
 * An AT machine's play told by its totals, as a data counter's history gives
 * it: whether play began after a setting change, then each leg of regular
 * games to an AT won, or still going at the finish, with the triggers
 * missed in it where they were counted — a leg whose misses are not told
 * is read over every number it might have had.
 */
export interface ToldPathDto {
  readonly afterReset: boolean
  /** The regular games since the last AT, or the setting change, when play was first seen; none where left out. */
  readonly sinceAt?: number
  readonly legs: readonly ToldLegDto[]
}

export interface ToldLegDto {
  readonly games: number
  readonly won: boolean
  readonly misses?: number
}

export interface WeightDto {
  readonly settingLevel: number
  readonly probability: number
}

export interface PosteriorDto {
  readonly settingLevels: readonly WeightDto[]
}

export interface TheoreticalValueRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly played: PlayedDto
}

/** The regular games a theoretical value is of: so many, every one worth the same, or an AT machine's path. */
export type PlayedDto = { readonly type: "games"; readonly games: number } | { readonly type: "path"; readonly path: PathDto }

export interface TheoreticalValueDto {
  readonly payoutRate: number
  readonly netPerGame: number
  readonly medals: number
  readonly yen: number
  readonly yenPerHour?: number
}

/** Where play stands at an AT machine, as a path starts from it. */
export type PathStartDto = PathDto["start"]

/** What sitting down at an AT machine is worth from each seat, played on until the next AT is won and over, given how likely each setting is, on the player's terms. */
export interface HuntRequest {
  readonly source: SourceDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly seats: readonly PathStartDto[]
}

/** What a seat comes to: the regular games played on average, the AT's medals and what the bonuses that are its trigger and a side bonus pay on the way, the medals over them and in yen, and the chance the AT is won by a ceiling. */
export interface HuntDto {
  readonly games: number
  readonly atMedals: number
  readonly triggerMedals: number
  /** What a side bonus pays on the way; left out where the machine has none. */
  readonly sideMedals?: number
  readonly medals: number
  readonly yen: number
  readonly byCeiling: number
}

/** A run in progress, carried across chunks and handed back as received. */
export interface ProgressDto {
  readonly rng: readonly [string, string, string, string]
}

export interface SimulateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly weights: readonly WeightDto[]
  readonly play: PlayDto
  readonly plan: { readonly sessions: number; readonly games: number }
  /** A 64-bit seed as a decimal string. */
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface BucketDto {
  readonly fromYen: number
  readonly toYen: number
  readonly count: number
}

export interface SummaryDto {
  readonly sessions: number
  readonly planned: number
  readonly finished: boolean
  readonly meanYen: number | null
  readonly standardDeviationYen: number | null
  readonly winRate: number | null
  readonly minYen: number | null
  readonly maxYen: number | null
  readonly histogram: readonly BucketDto[]
}

export interface SimulateResponse {
  readonly progress: ProgressDto
  readonly summary: SummaryDto
}

export interface EstimateRequest {
  readonly source: SourceDto
  readonly conditions: ConditionsDto
  readonly gamesPerSettingLevel: number
  readonly seed: string
  readonly chunk: number
  readonly progress?: ProgressDto
}

export interface SettingLevelEstimateDto {
  readonly settingLevel: number
  readonly games: number
  readonly payoutRate: number | null
  /** The 95% margin of `payoutRate`. */
  readonly payoutRateMargin: number | null
}

export interface EstimateSummaryDto {
  readonly gamesPerSettingLevel: number
  readonly finished: boolean
  readonly settingLevels: readonly SettingLevelEstimateDto[]
}

export interface EstimateResponse {
  readonly progress: ProgressDto
  readonly summary: EstimateSummaryDto
}

export type EngineErrorDto =
  | { readonly type: "malformed-request"; readonly detail: string }
  /** Solving the 解析値 would take more work than the call was given. */
  | { readonly type: "too-heavy" }
  | { readonly type: "invalid-value"; readonly field: string }
  | { readonly type: "unsupported-component"; readonly field: string }
  | { readonly type: "unsupported-spec-version"; readonly version: number; readonly known: number }
  | { readonly type: "no-setting-levels" }
  | { readonly type: "duplicate-setting-level"; readonly at?: string; readonly settingLevel: number }
  | { readonly type: "missing-setting-level"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "unknown-setting-level"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "duplicate-entity"; readonly entity: string }
  | { readonly type: "missing-component"; readonly entity: string; readonly component: string }
  | { readonly type: "conflicting-components"; readonly entity: string; readonly first: string; readonly second: string }
  | { readonly type: "stray-component"; readonly entity: string; readonly component: string }
  | { readonly type: "part-of-non-bonus"; readonly entity: string; readonly of: string }
  | { readonly type: "watch-of-non-bonus"; readonly entity: string; readonly of: string }
  | { readonly type: "cue-of-non-watch"; readonly entity: string; readonly of: string }
  | { readonly type: "cues-exceed-one"; readonly entity: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "watch-partly-whole"; readonly entity: string }
  | { readonly type: "invalid-probability"; readonly at: string; readonly settingLevel: number; readonly problem: "not-finite" | "out-of-range" }
  | { readonly type: "probabilities-exceed-one"; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "missing-payout"; readonly at: string }
  | { readonly type: "missing-rate"; readonly settingLevel: number }
  | { readonly type: "unknown-rate"; readonly settingLevel: number }
  | { readonly type: "rate-not-from-spec" }
  | { readonly type: "at-not-alone"; readonly entity: string }
  | { readonly type: "missing-base" }
  | { readonly type: "base-without-at" }
  | { readonly type: "first-hit-beyond-ceiling"; readonly at: string; readonly settingLevel: number }
  | { readonly type: "path-without-at" }
  | { readonly type: "at-never-comes" }
  | { readonly type: "played-mismatch" }
  | { readonly type: "mode-without-at"; readonly entity: string }
  | { readonly type: "ceiling-beside-modes"; readonly entity: string }
  | { readonly type: "allotment-not-whole"; readonly settingLevel: number; readonly afterReset: boolean; readonly sum: number }
  | { readonly type: "reset-allotment-partial"; readonly entity: string }
  | { readonly type: "ending-without-modes"; readonly entity: string }
  | { readonly type: "endings-not-whole"; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "ending-allotment-to-unknown"; readonly entity: string; readonly ending: string }
  | { readonly type: "ending-allotment-not-whole"; readonly ending: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "endings-without-allotment"; readonly entity: string }
  /** A mode's allotment after an AT beside one after every ending that is not the endings' mix (`mix`, in basis points). */
  | { readonly type: "allotment-against-endings"; readonly entity: string; readonly settingLevel: number; readonly mix: number }
  | { readonly type: "unknown-ending"; readonly ending: string }
  | { readonly type: "unknown-mode"; readonly mode: string }
  /** A seat with more games since the last CZ than since the last AT. */
  | { readonly type: "seat-trigger-above-since-at"; readonly sinceTrigger: number; readonly sinceAt: number }
  /** A seat with fewer games since the AT itself, across bonuses, than since the last bonus. */
  | { readonly type: "seat-across-bonuses-below-since-at"; readonly sinceAt: number; readonly sinceAtAcrossBonuses: number }
  | { readonly type: "cz-without-at"; readonly entity: string }
  | { readonly type: "first-hit-beside-cz"; readonly entity: string }
  | { readonly type: "payout-beside-at"; readonly entity: string }
  | { readonly type: "reset-ceiling-beside-modes"; readonly entity: string }
  | { readonly type: "at-ceiling-without-cz"; readonly entity: string }
  | { readonly type: "misses-without-cz"; readonly entity: string }
  | { readonly type: "since-at-ceiling-beyond-at-ceiling"; readonly entity: string }
  | { readonly type: "reset-since-at-ceiling-without-since-at-ceiling"; readonly entity: string }
  | { readonly type: "reset-since-at-ceiling-beside-modes"; readonly entity: string }
  | { readonly type: "direct-without-cz"; readonly entity: string }
  | { readonly type: "direct-bonus-without-bonus-share"; readonly entity: string }
  | { readonly type: "side-bonus-without-at"; readonly entity: string }
  | { readonly type: "side-bonus-not-alone"; readonly entity: string }
  | { readonly type: "ceiling-triggers-without-cz"; readonly entity: string }
  | { readonly type: "ceiling-across-bonuses-without-restart"; readonly entity: string }
  | { readonly type: "ceiling-payout-without-ceiling-triggers"; readonly entity: string }
  | { readonly type: "ceiling-unit-beside-lcd-rate" }
  | { readonly type: "unit-ceiling-without-unit"; readonly entity: string }
  | { readonly type: "gate-beyond-whole"; readonly entity: string; readonly game: number; readonly settingLevel: number }
  | { readonly type: "gate-twice"; readonly entity: string; readonly game: number }
  | { readonly type: "gates-beside-modes"; readonly entity: string }
  | { readonly type: "needs-cz"; readonly entity: string; readonly component: string }
  | { readonly type: "redraw-to-unknown"; readonly entity: string; readonly to: string }
  | { readonly type: "redraw-not-whole"; readonly entity: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "meter-gains-over-whole"; readonly entity: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "empty-set"; readonly entity: string }
  | { readonly type: "empty-net-per-game"; readonly entity: string }
  | { readonly type: "other-net-beyond-whole"; readonly entity: string; readonly sum: number }
  | { readonly type: "unattainable-rate"; readonly entity: string; readonly settingLevel: number }
  | { readonly type: "endless-continuation"; readonly entity: string; readonly settingLevel: number }
  | { readonly type: "payout-table-not-whole"; readonly entity: string; readonly settingLevel: number; readonly sum: number }
  | { readonly type: "needs-cap"; readonly entity: string; readonly component: string }
  | { readonly type: "cap-without-at" }
  | { readonly type: "unknown-count"; readonly segment: number; readonly id: string }
  | { readonly type: "overlapping-counts"; readonly segment: number; readonly id: string }
  | { readonly type: "counts-exceed-games"; readonly segment: number }
  | { readonly type: "cues-exceed-trials"; readonly segment: number; readonly id: string }
  | { readonly type: "prior-mismatch"; readonly settingLevel: number }
  | { readonly type: "invalid-prior"; readonly sum: number }
  | { readonly type: "contradictory-evidence" }

export type Envelope<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EngineErrorDto }

export type * from "./catalog.ts"
