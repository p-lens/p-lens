import type { SunkSummaryDto } from "@p-lens/contracts/pachinko"

import { RENTED_PER_THOUSAND, seedOf, TERMS_BY_DEFAULT, ballValueOf } from "../../core/pachinko/inference"
import { borderOf } from "../../core/pachinko/theoretical-value"
import type { EngineClient, RunningRun } from "../../pachinko-engine/client/client"
import type { RunEvent } from "../../pachinko-engine/protocol/messages"
import type { Weighable } from "../../application/pachinko/inference"
import { keyOf, type Asked } from "../core/counter"
import { ENOUGH, TRIALS } from "../core/reading"

/** The spin performance a counter is played out at until a person says another: the formula's border, at the ball value given, or at the terms a told play is weighed on where none is. */
export const borderFor = (weighable: Weighable, ballValue: number | undefined): number => borderOf(weighable.formula.figures, ballValue ?? ballValueOf(TERMS_BY_DEFAULT))

/** Play out a counter's day on this device, from the seed the counter gives, reported as it goes and stoppable. */
export const playCounter = (engine: EngineClient, weighable: Weighable, asked: Asked, onEvent: (event: RunEvent<SunkSummaryDto>) => void): RunningRun =>
  engine.sunk(
    {
      source: { type: "normalized", normalized: weighable.basis.normalized },
      conditions: weighable.basis.conditions,
      counter: {
        spins: asked.counter.spins,
        jackpots: asked.counter.jackpots,
        ...(asked.counter.sinceLast === undefined ? {} : { sinceLast: asked.counter.sinceLast }),
      },
      spinPerformance: asked.spinPerformance,
      rentedPerThousand: RENTED_PER_THOUSAND,
      trials: TRIALS,
      enough: ENOUGH,
      seed: seedOf(keyOf(weighable.formula.id, asked)),
    },
    onEvent,
  )
