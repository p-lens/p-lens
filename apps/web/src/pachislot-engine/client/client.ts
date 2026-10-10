import type { EstimateSummaryDto, SummaryDto } from "@p-lens/contracts/pachislot"

import { Err, Ok, type Result } from "../../core/result/result"
import type {
  FromWorker,
  Call,
  Calls,
  EngineFailure,
  EstimateOrder,
  RunEvent,
  SimulationOrder,
  ToWorker,
} from "../protocol/messages"

export interface RunningRun {
  readonly cancel: () => void
}

/**
 * The only way to the pachislot engine. The worker — and with it the engine's
 * code — is not started until something is asked of it.
 */
export interface EngineClient {
  /** A call answered at once: a spec solved, a setting inferred, a play weighed. */
  readonly call: <C extends Call>(call: C, request: Calls[C]["request"]) => Promise<Result<Calls[C]["answer"], EngineFailure>>
  /** The spread of a play's result, sampled on this device, reported as it goes and stoppable. */
  readonly simulate: (order: SimulationOrder, onEvent: (event: RunEvent<SummaryDto>) => void) => RunningRun
  /** Each setting's payout rate sampled on this device, reported as it goes and stoppable. */
  readonly estimate: (order: EstimateOrder, onEvent: (event: RunEvent<EstimateSummaryDto>) => void) => RunningRun
}

type Listener = (message: FromWorker) => void

/**
 * What went wrong with the worker. A script that never loaded fires a plain
 * event with no message at all, whatever the type says.
 */
const failureOf = (event: ErrorEvent): string =>
  typeof event.message === "string" && event.message !== "" ? event.message : "the pachislot engine's worker could not be loaded"

const isFinal = (event: RunEvent<unknown>): boolean => event.type !== "progress"

export const createEngineClient = (spawn: () => Worker): EngineClient => {
  const listeners = new Map<number, Listener>()
  const counter = { next: 1 }
  const channel: { worker: Worker | undefined } = { worker: undefined }

  /** Everyone waiting hears that the engine is gone, rather than waiting forever. */
  const abandon = (detail: string): void => {
    const stranded = [...listeners.entries()]
    listeners.clear()
    channel.worker?.terminate()
    channel.worker = undefined
    stranded.forEach(([id, listen]) => listen({ type: "refused", id, failure: { type: "engine-unavailable", detail } }))
  }

  const worker = (): Worker => {
    const existing = channel.worker
    if (existing !== undefined) return existing
    const started = spawn()
    started.onmessage = (event: MessageEvent<FromWorker>) => listeners.get(event.data.id)?.(event.data)
    started.onerror = (event) => abandon(failureOf(event))
    channel.worker = started
    return started
  }

  const send = (message: ToWorker): Result<void, EngineFailure> => {
    try {
      worker().postMessage(message)
      return Ok(undefined)
    } catch (cause) {
      return Err({ type: "engine-unavailable", detail: String(cause) })
    }
  }

  const call: EngineClient["call"] = (name, request) => {
    const id = counter.next++
    return new Promise((settle) => {
      listeners.set(id, (message) => {
        listeners.delete(id)
        settle(
          message.type === "answered"
            ? Ok(message.answer as Calls[typeof name]["answer"])
            : message.type === "refused"
              ? Err(message.failure)
              : Err({ type: "engine-unavailable", detail: `unexpected ${message.type}` }),
        )
      })
      const sent = send({ type: "call", id, call: name, request } as ToWorker)
      if (!sent.ok) {
        listeners.delete(id)
        settle(sent)
      }
    })
  }

  /** A chunked run: its events passed on until one ends it. A worker gone ends it as failed. */
  const chunked = <S>(
    message: (id: number) => ToWorker,
    read: (message: FromWorker) => RunEvent<S> | undefined,
    onEvent: (event: RunEvent<S>) => void,
  ): RunningRun => {
    const id = counter.next++
    listeners.set(id, (received) => {
      const event = received.type === "refused" ? { type: "failed" as const, failure: received.failure } : read(received)
      if (event === undefined) return
      if (isFinal(event)) listeners.delete(id)
      onEvent(event)
    })
    const sent = send(message(id))
    if (!sent.ok) {
      listeners.delete(id)
      onEvent({ type: "failed", failure: sent.error })
    }
    return { cancel: () => void send({ type: "cancel", id }) }
  }

  const simulate: EngineClient["simulate"] = (order, onEvent) =>
    chunked((id) => ({ type: "simulate", id, order }), (message) => (message.type === "simulation" ? message.event : undefined), onEvent)

  const estimate: EngineClient["estimate"] = (order, onEvent) =>
    chunked((id) => ({ type: "estimate", id, order }), (message) => (message.type === "estimate" ? message.event : undefined), onEvent)

  return { call, simulate, estimate }
}
