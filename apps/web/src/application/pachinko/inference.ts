import type { InferenceSummaryDto, WayDto } from "@p-lens/contracts/pachinko"

import type { Catalog } from "../../catalog/port/catalog"
import type { PachinkoMachineDetail } from "../../core/catalog/catalog"
import { ranked } from "../../core/formula/standing"
import { basisOf, worthOf, type Basis, type Formula } from "../../core/pachinko/formula"
import { TRIALS_BEYOND, ballsPerSpinOf, beliefOf, PACE_BY_DEFAULT, RENTED_PER_THOUSAND, scaledBallValueOf, seedOf, toldDtoOf, verdictOf, type Told, type Verdict, type Weighed, type WeighingTerms } from "../../core/pachinko/inference"
import type { PlayId } from "../../core/play/play"
import type { EngineClient, RunningRun } from "../../pachinko-engine/client/client"
import type { RunEvent } from "../../pachinko-engine/protocol/messages"
import { Err } from "../../core/result/result"
import type { ApplicationError } from "../errors"
import { fromPachinkoEngine } from "../lift"
import { loadMachine } from "./formulas"

/** A formula a told play can be weighed by: one made from a basis, which the machine can be played out from. */
export interface Weighable {
  readonly formula: Formula
  readonly basis: Basis
}

/**
 * The formula a told play of a machine is weighed by: the best ranked of
 * its formulas that was made from a basis — the one the machine would open
 * with for anyone, whatever a person keeps as a favourite. None where the
 * machine has only figures typed in, which nothing can be played out from.
 */
export const weighableOf = (machine: PachinkoMachineDetail): Weighable | undefined =>
  ranked(machine.formulas, worthOf)
    .flatMap((listing) => ((basis) => (basis === undefined ? [] : [{ formula: listing.formula, basis }]))(basisOf(listing.formula)))
    .at(0)

/**
 * Weigh a play told of afterwards for what its cabinet was: the machine
 * played out for the play's hours so many times, on this device, from the
 * seed its id gives, reported as it goes and stoppable.
 */
export const weighPlay = (
  engine: EngineClient,
  weighable: Weighable,
  told: Told,
  terms: WeighingTerms,
  playId: PlayId,
  trials: number,
  onEvent: (event: RunEvent<InferenceSummaryDto>) => void,
): RunningRun =>
  engine.infer(
    {
      source: { type: "normalized", normalized: weighable.basis.normalized },
      conditions: weighable.basis.conditions,
      told: toldDtoOf(told, terms),
      belief: beliefOf(weighable.formula.figures, terms),
      spinsPerHour: weighable.formula.figures.spinsPerHour ?? PACE_BY_DEFAULT,
      rentedPerThousand: RENTED_PER_THOUSAND,
      ballValue: scaledBallValueOf(terms),
      ballsPerSpin: ballsPerSpinOf(weighable.formula.figures),
      trials,
      seed: seedOf(playId),
    },
    onEvent,
  )

/** Whether a told play took cash: one played on balls brought to it — carried from another cabinet, or drawn from savings — took none, and what its spins cost cannot be read from it. */
export const takesCash = (told: Pick<Told, "outlay">): boolean => told.outlay > 0

/** A play to weigh: of which machine, under which id, what was told of it and on what terms. */
export interface WeighingAsked {
  readonly machineId: string
  readonly playId: PlayId
  readonly told: Told
  readonly terms: WeighingTerms
}

/**
 * Where the weighing of a told play is: nothing to weigh; being played
 * out — the usual trials, or the many more a play is given that too few
 * of those came near (`beyond`); not to be weighed, its machine having no
 * formula made from a basis, or the play having taken no cash — one
 * played on balls brought to it says nothing of what its spins cost; weighed, with whether the cabinet's pace was assumed, its
 * formula saying none; found out of the ordinary, with how seldom such a
 * play comes and which way it is out; too little told to read, with whether its jackpots were told —
 * which is what a person can still add; or failed.
 */
export type Weighing =
  | { readonly type: "resting" }
  | { readonly type: "weighing"; readonly done: number; readonly planned: number; readonly beyond: boolean }
  | { readonly type: "unweighable"; readonly why: "no-basis" | "no-outlay" }
  | { readonly type: "weighed"; readonly weighed: Weighed; readonly formulaId: string; readonly paceAssumed: boolean }
  | { readonly type: "anomalous"; readonly oneIn: number; readonly beyond: boolean; readonly way: WayDto }
  | { readonly type: "vague"; readonly jackpotsTold: boolean }
  | { readonly type: "failed"; readonly error: ApplicationError }

const weighingAs = (verdict: Verdict, weighable: Weighable, asked: WeighingAsked): Weighing => {
  switch (verdict.type) {
    case "weighed":
      return { type: "weighed", weighed: verdict.weighed, formulaId: weighable.formula.id, paceAssumed: weighable.formula.figures.spinsPerHour === undefined }
    case "anomalous":
      return { type: "anomalous", oneIn: verdict.oneIn, beyond: verdict.beyond, way: verdict.way }
    case "vague":
      return { type: "vague", jackpotsTold: asked.told.jackpots !== undefined }
  }
}

/**
 * Weigh a told play from start to finish: its machine looked up, the formula
 * to weigh it by chosen, the machine played out, each step said as it
 * happens. A play too few of the trials came near is played out again,
 * many more times, before anything is said of it: each run is a whole one
 * from the play's seed, so what it comes to never depends on where a run
 * happened to be stopped. Stopping it says nothing more.
 */
export const weighToldPlay = (catalog: Catalog, engine: EngineClient, asked: WeighingAsked, trials: number, onWeighing: (weighing: Weighing) => void): RunningRun => {
  const held: { run: RunningRun | undefined; stopped: boolean } = { run: undefined, stopped: false }
  const say = (weighing: Weighing): void => {
    if (!held.stopped) onWeighing(weighing)
  }
  const played = (weighable: Weighable, planned: number, beyond: boolean): void => {
    held.run = weighPlay(engine, weighable, asked.told, asked.terms, asked.playId, planned, (event) => {
      if (event.type === "progress") return say({ type: "weighing", done: event.summary.trials, planned: event.summary.planned, beyond })
      if (event.type === "cancelled") return
      if (event.type === "failed") return ((failed) => (failed.ok ? undefined : say({ type: "failed", error: failed.error })))(fromPachinkoEngine(Err(event.failure)))
      const verdict = verdictOf(weighable.formula.figures, asked.terms, event.summary)
      if (verdict.type === "vague" && verdict.why === "few-near" && !beyond) return played(weighable, TRIALS_BEYOND, true)
      say(weighingAs(verdict, weighable, asked))
    })
  }
  const begin = async (): Promise<void> => {
    if (!takesCash(asked.told)) return say({ type: "unweighable", why: "no-outlay" })
    say({ type: "weighing", done: 0, planned: trials, beyond: false })
    const machine = await loadMachine(catalog, asked.machineId)
    if (held.stopped) return
    if (!machine.ok) return say({ type: "failed", error: machine.error })
    const weighable = weighableOf(machine.value)
    if (weighable === undefined) return say({ type: "unweighable", why: "no-basis" })
    played(weighable, trials, false)
  }
  void begin()
  return {
    cancel: () => {
      held.stopped = true
      held.run?.cancel()
    },
  }
}

/** Weigh a told play and wait for what it comes to; nothing where the engine failed — a play taken in with others is then taken in unweighed. */
export const verdictOn = (engine: EngineClient, weighable: Weighable, told: Told, terms: WeighingTerms, playId: PlayId, trials: number): Promise<Verdict | undefined> =>
  new Promise((settle) => {
    weighPlay(engine, weighable, told, terms, playId, trials, (event) => {
      if (event.type === "progress") return
      settle(event.type === "completed" ? verdictOf(weighable.formula.figures, terms, event.summary) : undefined)
    })
  })
