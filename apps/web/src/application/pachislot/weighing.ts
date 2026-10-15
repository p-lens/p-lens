import type {
  HuntDto,
  PlayDto,
  PlayedDto,
  SegmentDto,
  PathDto,
  WeightDto,
} from "@p-lens/contracts/pachislot"

import { countedSegmentsOf, segmentsOf } from "../../core/pachislot/observation"
import { pathOf, standingOf } from "../../core/pachislot/path"
import { priorFor } from "../../core/pachislot/prior"
import { counterBonusOf, GAMES_PER_HOUR, huntPlayOf, playOf, settingLevelsOf, type Weighing } from "../../core/pachislot/weighing"
import type { PlayTerms } from "../../core/parlor/terms"
import type { Checkpoint } from "../../core/play-log/checkpoint"
import { Err, Ok, mapOk } from "../../core/result/result"
import type { EngineClient } from "../../pachislot-engine/client/client"
import type { Outcome } from "../errors"
import { fromPachislotEngine } from "../lift"

/**
 * What a cabinet looks like by what has been seen at it: how likely each
 * setting level is, the theoretical 機械割 and medals of a game under those
 * odds, and — with the play's terms — the yen an hour of play is worth and
 * the theoretical value of the games played so far.
 */
export interface PlayOutlook {
  /**
   * Whether the figures below rest on anything: something seen at the
   * cabinet, or a 設定配分 the player chose for it. With neither they are an
   * even spread's alone, which says nothing of this cabinet.
   */
  readonly grounded: boolean
  readonly settingLevels: readonly WeightDto[]
  readonly payoutRate: number
  /** Theoretical medals a game; none on an AT machine before a game is played, its games being worth what their count makes them. */
  readonly netPerGame: number | undefined
  readonly theoreticalValuePerHour: number | undefined
  /** Whether the play has terms to put its theoretical value in yen. */
  readonly priced: boolean
  /** What the games played so far are worth; none before a game is played, or without terms. */
  readonly theoreticalValue: number | undefined
  /**
   * On an AT machine, what playing on from where the play stands until the
   * next AT is over is worth — 天井狙い — under the same odds, its regular
   * games played from cash as `huntPlayOf` says: its yen only with terms.
   * None on a machine of bonuses.
   */
  readonly hunt: HuntDto | undefined
}

/**
 * Terms for a play that has none: a medal at a yen, nothing rented. The
 * engine takes only positive prices, and the yen it gives back for these is
 * never shown — only the 機械割 and medals, which no terms change.
 */
const UNPRICED: PlayDto = { medalValue: 1, rentalPrice: 1, cashShare: 0 }

/** What a play's log says was seen, as the engine takes it, and the games it is to weigh. */
interface Observed {
  readonly seen: boolean
  readonly segments: readonly SegmentDto[]
  readonly path: PathDto | undefined
  readonly played: PlayedDto
}

/**
 * What was seen: on an AT machine, the path its play went through, which is
 * also the games weighed, and what was counted in its regular games; on a
 * machine of bonuses, what the counter and the counting show, and the games
 * played — or an hour's, before any.
 */
const observedOf = (weighing: Weighing, ordered: readonly Checkpoint[], played: number): Outcome<Observed> => {
  if (weighing.formula.normalized.atRules !== undefined) {
    const path = pathOf(ordered) ?? { start: { sinceTrigger: 0, sinceAt: 0, misses: 0, afterReset: false }, legs: [] }
    const counted = countedSegmentsOf(ordered)
    const walked = path.legs.length > 0 || Object.values(path.start).some((said) => said !== undefined && said !== 0 && said !== false)
    return Ok({ seen: walked || counted.length > 0, segments: counted, path, played: { type: "path", path } })
  }
  const segments = segmentsOf(ordered, counterBonusOf(weighing.formula.normalized))
  if (!segments.ok) return Err({ type: "pachislot-play", problem: segments.error })
  return Ok({ seen: segments.value.some((segment) => segment.games > 0), segments: segments.value, path: undefined, played: { type: "games", games: played > 0 ? played : GAMES_PER_HOUR } })
}

/**
 * A pachislot play weighed by its log: the setting levels inferred from what
 * was seen, under the play's prior, then the theoretical value of the games
 * played under those odds — on a machine of bonuses, of an hour's play
 * before any — and on an AT machine what playing on from where it stands
 * until the next AT is over is worth. The outlay and the savings drawn the
 * log last gives say how much of the play was rented for cash and how much
 * drawn from savings.
 */
export const weighPlay = async (
  engine: EngineClient,
  weighing: Weighing,
  ordered: readonly Checkpoint[],
  terms: PlayTerms | undefined,
): Promise<Outcome<PlayOutlook>> => {
  const played = ordered.at(-1)?.spins ?? 0
  const observed = observedOf(weighing, ordered, played)
  if (!observed.ok) return observed
  const { segments, path } = observed.value
  const prior = priorFor(weighing.prior, settingLevelsOf(weighing.formula))
  if (!prior.ok) return Err({ type: "pachislot-play", problem: prior.error })
  const source = { type: "normalized", normalized: weighing.formula.normalized } as const
  const posterior = fromPachislotEngine(
    await engine.call("posterior", {
      source,
      segments,
      ...(path === undefined ? {} : { path }),
      ...(prior.value === undefined ? {} : { prior: prior.value }),
    }),
  )
  if (!posterior.ok) return posterior
  const weigh = async (play: PlayDto) =>
    fromPachislotEngine(
      await engine.call("theoreticalValue", { source, conditions: weighing.formula.conditions, weights: posterior.value.settingLevels, play, played: observed.value.played }),
    )
  const unpriced = await weigh(UNPRICED)
  if (!unpriced.ok) return unpriced
  const play = playOf(terms, {
    bet: weighing.formula.normalized.bet,
    games: played,
    outlay: ordered.findLast((checkpoint) => checkpoint.outlay !== undefined)?.outlay,
    replay: ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay,
    payoutRate: unpriced.value.payoutRate,
  })
  const valued = play === undefined ? unpriced : await weigh(play)
  if (!valued.ok) return valued
  const rules = weighing.formula.normalized.atRules
  const hunted =
    path === undefined || rules === undefined
      ? Ok(undefined)
      : mapOk(
          fromPachislotEngine(
            await engine.call("hunt", {
              source,
              weights: posterior.value.settingLevels,
              play: terms === undefined ? UNPRICED : huntPlayOf(terms, rules, weighing.formula.normalized.bet),
              seats: [standingOf(path, weighing.formula.normalized)],
            }),
          ),
          (rows) => rows[0],
        )
  if (!hunted.ok) return hunted
  return mapOk(valued, (value) => ({
    grounded: observed.value.seen || weighing.prior.type !== "even",
    settingLevels: posterior.value.settingLevels,
    payoutRate: value.payoutRate,
    netPerGame: weighing.formula.normalized.atRules !== undefined && played === 0 ? undefined : value.netPerGame,
    theoreticalValuePerHour: play === undefined ? undefined : value.yenPerHour,
    priced: play !== undefined,
    theoreticalValue: play === undefined || played === 0 ? undefined : value.yen,
    hunt: hunted.value,
  }))
}
