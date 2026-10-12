import type { EstimateSummaryDto, HyenaHuntSummaryDto, InferenceSummaryDto } from "@p-lens/contracts/pachinko"

import { Err, Ok, type Result } from "../../core/result/result"
import type {
  FromWorker,
  Call,
  Calls,
  EngineFailure,
  EstimateOrder,
  HyenaHuntOrder,
  InferenceOrder,
  RunEvent,
  SimulationEvent,
  SimulationOrder,
  ToWorker,
} from "../protocol/messages"

export interface RunningRun {
  readonly cancel: () => void
}

/**
 * The only way to the pachinko engine. The worker — and with it the engine's
 * code — is not started until something is asked of it.
 */
export interface EngineClient {
  /** A call answered at once: a spec solved, 遊タイム狙い solved for several counts. */
  readonly call: <C extends Call>(call: C, request: Calls[C]["request"]) => Promise<Result<Calls[C]["answer"], EngineFailure>>
  /** The spread of a play's result, sampled on this device, reported as it goes and stoppable. */
  readonly simulate: (order: SimulationOrder, onEvent: (event: SimulationEvent) => void) => RunningRun
  /** A formula's figures estimated by sampling on this device, reported as it goes and stoppable. */
  readonly estimate: (order: EstimateOrder, onEvent: (event: RunEvent<EstimateSummaryDto>) => void) => RunningRun
  /** 遊タイム狙い sampled on this device, reported as it goes and stoppable. */
  readonly hyenaHunt: (order: HyenaHuntOrder, onEvent: (event: RunEvent<HyenaHuntSummaryDto>) => void) => RunningRun
  /** A play told of afterwards weighed for its spin performance on this device, reported as it goes and stoppable. */
  readonly infer: (order: InferenceOrder, onEvent: (event: RunEvent<InferenceSummaryDto>) => void) => RunningRun
}

type Listener = (message: FromWorker) => void

/**
 * What went wrong with the worker. A script that never loaded fires a plain
 * event with no message at all, whatever the type says.
 */
const failureOf = (event: ErrorEvent): string =>
  typeof event.message === "string" && event.message !== "" ? event.message : "the pachinko engine's worker could not be loaded"

/** Any run's event, by what it says happened. */
type Reported = { readonly type: SimulationEvent["type"] }

const isFinal = (event: Reported): boolean => event.type !== "started" && event.type !== "progress"

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
  const chunked = <E extends Reported>(
    message: (id: number) => ToWorker,
    read: (message: FromWorker) => E | undefined,
    failed: (failure: EngineFailure) => E,
    onEvent: (event: E) => void,
  ): RunningRun => {
    const id = counter.next++
    listeners.set(id, (received) => {
      const event = received.type === "refused" ? failed(received.failure) : read(received)
      if (event === undefined) return
      if (isFinal(event)) listeners.delete(id)
      onEvent(event)
    })
    const sent = send(message(id))
    if (!sent.ok) {
      listeners.delete(id)
      onEvent(failed(sent.error))
    }
    return { cancel: () => void send({ type: "cancel", id }) }
  }

  const failed = (failure: EngineFailure): { readonly type: "failed"; readonly failure: EngineFailure } => ({ type: "failed", failure })

  const simulate: EngineClient["simulate"] = (order, onEvent) =>
    chunked((id) => ({ type: "simulate", id, order }), (message) => (message.type === "simulation" ? message.event : undefined), failed, onEvent)

  const estimate: EngineClient["estimate"] = (order, onEvent) =>
    chunked((id) => ({ type: "estimate", id, order }), (message) => (message.type === "estimate" ? message.event : undefined), failed, onEvent)

  const hyenaHunt: EngineClient["hyenaHunt"] = (order, onEvent) =>
    chunked((id) => ({ type: "hyena-hunt", id, order }), (message) => (message.type === "hyena-hunt" ? message.event : undefined), failed, onEvent)

  const infer: EngineClient["infer"] = (order, onEvent) =>
    chunked((id) => ({ type: "infer", id, order }), (message) => (message.type === "inference" ? message.event : undefined), failed, onEvent)

  return { call, simulate, estimate, hyenaHunt, infer }
}
