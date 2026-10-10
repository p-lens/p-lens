import type { HyenaHuntRowDto, HyenaHuntSummaryDto, PlayDto } from "@p-lens/contracts/pachinko"

import type { Basis } from "../../core/pachinko/formula"
import { huntOf, type Hunt } from "../../core/pachinko/hyena-hunt"
import { mapOk } from "../../core/result/result"
import type { EngineClient, RunningRun } from "../../pachinko-engine/client/client"
import type { RunEvent } from "../../pachinko-engine/protocol/messages"
import type { Outcome } from "../errors"
import { fromPachinkoEngine } from "../lift"

/** The 遊タイム's count of a basis, if its machine has one. */
export const reliefDriveOf = (basis: Basis): number | undefined => basis.normalized.reliefDrive?.gauge

/**
 * How far a counter stands from a basis' 遊タイム: so many spins short of
 * it, or past it — the 遊タイム come and gone without a jackpot, and not to
 * come again before one.
 */
export type ReliefDriveAhead = { readonly type: "ahead"; readonly spins: number } | { readonly type: "spent" }

export const reliefDriveAhead = (basis: Basis, initialSpins: number): ReliefDriveAhead | undefined => {
  const gauge = reliefDriveOf(basis)
  if (gauge === undefined) return undefined
  return initialSpins > gauge ? { type: "spent" } : { type: "ahead", spins: gauge - initialSpins }
}

/**
 * 遊タイム狙い solved exactly from a basis' stored normalised spec, for each of
 * several initial spins: what sitting down at each comes to on average.
 */
export const hyenaHuntTable = async (engine: EngineClient, basis: Basis, play: PlayDto, initialSpins: readonly number[]): Promise<Outcome<readonly HyenaHuntRowDto[]>> =>
  fromPachinkoEngine(await engine.call("hyenaHuntTable", { source: { type: "normalized", normalized: basis.normalized }, conditions: basis.conditions, play, initialSpins }))

/** The spin rate the engine is asked at where none is known: any does, since a hunt is read apart from it. */
const ANY_RATE = 20

/** A 遊タイム狙い from a count, apart from the spin rate, and how often it reaches the 遊タイム. */
export interface HuntAcrossRates {
  readonly hunt: Hunt
  readonly reliefDriveProbability: number
}

/**
 * 遊タイム狙い from a count, for every spin rate at once: the engine asked at
 * one rate, and the hunt read apart from it. Needs only what a ball
 * exchanges for.
 */
export const hyenaHuntAcrossRates = async (engine: EngineClient, basis: Basis, ballValue: number, initialSpins: number): Promise<Outcome<HuntAcrossRates | undefined>> => {
  const play = { spinPerformance: ANY_RATE, ballValue }
  return mapOk(await hyenaHuntTable(engine, basis, play, [initialSpins]), ([seated]) =>
    seated === undefined ? undefined : { hunt: huntOf(seated, play), reliefDriveProbability: seated.reliefDriveProbability },
  )
}

/**
 * 遊タイム狙い sampled on the device from initial spins: so many sittings from a seed, a
 * chunk at a time, each played until a first jackpot — or the 遊タイム — and
 * its combo are over.
 */
export const hyenaHuntFrom = (
  engine: EngineClient,
  basis: Basis,
  play: PlayDto,
  initialSpins: number,
  sampling: { readonly trials: number; readonly seed: string },
  onEvent: (event: RunEvent<HyenaHuntSummaryDto>) => void,
): RunningRun =>
  engine.hyenaHunt({ source: { type: "normalized", normalized: basis.normalized }, conditions: basis.conditions, play, initialSpins, trials: sampling.trials, seed: sampling.seed }, onEvent)

/** How far apart the rows of a 遊タイム狙い table are: every 50 spins, or every 100 for a long count. */
const rowStep = (reliefDrive: number): number => (reliefDrive > 1000 ? 100 : 50)

/** The initial spins a 遊タイム狙い table has a row for: from nothing to the 遊タイム itself, evenly. */
export const tableInitialSpins = (reliefDrive: number): readonly number[] =>
  Array.from({ length: Math.floor(reliefDrive / rowStep(reliefDrive)) + 1 }, (_, row) => row * rowStep(reliefDrive)).concat(reliefDrive % rowStep(reliefDrive) === 0 ? [] : [reliefDrive])
