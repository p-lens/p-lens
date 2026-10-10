/// <reference lib="webworker" />

import type {
  Envelope,
  EstimateRequest,
  EstimateResponse,
  HyenaHuntRequest,
  HyenaHuntResponse,
  ProgressDto,
  SimulateRequest,
  SimulateResponse,
} from "@p-lens/contracts/pachinko"

import type { Call, FromWorker, EngineFailure, EstimateOrder, HyenaHuntOrder, RunEvent, SimulationOrder, ToWorker } from "../protocol/messages"

/**
 * The pachinko engine runs here, never on the page's thread: a Monte Carlo
 * run is seconds of arithmetic. The engine itself is imported on the first
 * message, so nothing of it is fetched until a pachinko formula or play
 * needs it.
 */

type Engine = typeof import("@p-lens/pachinko-engine/pachinko.js")

const loaded: { engine: Promise<Engine> | undefined } = { engine: undefined }

const engine = (): Promise<Engine> => {
  const pending =
    loaded.engine ??
    import("@p-lens/pachinko-engine/pachinko.js").then(async (module) => {
      await module.default()
      return module
    })
  loaded.engine = pending
  pending.catch(() => {
    loaded.engine = undefined
  })
  return pending
}

const unavailable = (cause: unknown): EngineFailure => ({ type: "engine-unavailable", detail: String(cause) })

/** An engine answer read back; text that is not an envelope is the engine failing, not the input. */
const opened = <T>(text: string): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: EngineFailure } => {
  try {
    const envelope = JSON.parse(text) as Envelope<T>
    return envelope.ok ? { ok: true, value: envelope.value } : { ok: false, failure: { type: "engine", error: envelope.error } }
  } catch (cause) {
    return { ok: false, failure: unavailable(cause) }
  }
}

const post = (message: FromWorker): void => self.postMessage(message)

const cancelled = new Set<number>()

/** How long one chunk should take: short enough to cancel promptly, long enough to waste little time on messages. */
const CHUNK_MILLIS = 50

/** The size every run's first chunk is, before any has been timed. */
const FIRST_CHUNK = 100

/** The next chunk's size, from how long the last one took. */
const nextChunk = (size: number, millis: number): number => Math.max(1, Math.min(1_000_000, Math.round((size * CHUNK_MILLIS) / Math.max(millis, 1))))

/** Let the message loop run, so a cancellation sent meanwhile is heard. */
const yieldToMessages = (): Promise<void> => new Promise((resume) => setTimeout(resume, 0))

type Run = { readonly progress: ProgressDto; readonly summary: { readonly finished: boolean } }

/**
 * Run the engine a chunk at a time, each sized to take about `CHUNK_MILLIS`,
 * reporting after each and hearing a cancellation between them.
 */
const runInChunks = async <R extends Run>(
  id: number,
  call: (chunk: number, progress: ProgressDto | undefined) => string,
  report: (event: RunEvent<R["summary"]>) => void,
): Promise<void> => {
  const step = async (last: R | undefined, chunk: number): Promise<void> => {
    if (cancelled.delete(id)) {
      report({ type: "cancelled", summary: last?.summary })
      return
    }
    const started = performance.now()
    const reply = opened<R>(call(chunk, last?.progress))
    if (!reply.ok) {
      report({ type: "failed", failure: reply.failure })
      return
    }
    if (reply.value.summary.finished) {
      report({ type: "completed", summary: reply.value.summary })
      return
    }
    report({ type: "progress", summary: reply.value.summary })
    await yieldToMessages()
    await step(reply.value, nextChunk(chunk, performance.now() - started))
  }
  await step(undefined, FIRST_CHUNK)
}

const progressOf = (progress: ProgressDto | undefined): { readonly progress?: ProgressDto } => (progress === undefined ? {} : { progress })

const simulate = async (id: number, order: SimulationOrder): Promise<void> => {
  const run = await engine()
  post({ type: "simulation", id, event: { type: "started", planned: order.plan.sessions } })
  await runInChunks<SimulateResponse>(
    id,
    (chunk, progress) => run.simulateChunk(JSON.stringify({ ...order, chunk, ...progressOf(progress) } satisfies SimulateRequest)),
    (event) => post({ type: "simulation", id, event }),
  )
}

const estimate = async (id: number, order: EstimateOrder): Promise<void> => {
  const run = await engine()
  await runInChunks<EstimateResponse>(
    id,
    (chunk, progress) => run.estimateChunk(JSON.stringify({ ...order, chunk, ...progressOf(progress) } satisfies EstimateRequest)),
    (event) => post({ type: "estimate", id, event }),
  )
}

const hyenaHunt = async (id: number, order: HyenaHuntOrder): Promise<void> => {
  const run = await engine()
  await runInChunks<HyenaHuntResponse>(
    id,
    (chunk, progress) => run.hyenaHuntChunk(JSON.stringify({ ...order, chunk, ...progressOf(progress) } satisfies HyenaHuntRequest)),
    (event) => post({ type: "hyena-hunt", id, event }),
  )
}

const answer = async (id: number, call: Call, request: unknown): Promise<void> => {
  const run = await engine()
  const reply = opened<unknown>(run[call](JSON.stringify(request)))
  post(reply.ok ? { type: "answered", id, answer: reply.value } : { type: "refused", id, failure: reply.failure })
}

const failedAs = (message: ToWorker, failure: EngineFailure): FromWorker | undefined => {
  switch (message.type) {
    case "call":
      return { type: "refused", id: message.id, failure }
    case "simulate":
      return { type: "simulation", id: message.id, event: { type: "failed", failure } }
    case "estimate":
      return { type: "estimate", id: message.id, event: { type: "failed", failure } }
    case "hyena-hunt":
      return { type: "hyena-hunt", id: message.id, event: { type: "failed", failure } }
    case "cancel":
      return undefined
  }
}

self.onmessage = (event: MessageEvent<ToWorker>): void => {
  const message = event.data
  const work =
    message.type === "call"
      ? answer(message.id, message.call, message.request)
      : message.type === "simulate"
        ? simulate(message.id, message.order)
        : message.type === "estimate"
          ? estimate(message.id, message.order)
          : message.type === "hyena-hunt"
            ? hyenaHunt(message.id, message.order)
            : Promise.resolve(void cancelled.add(message.id))
  work.catch((cause: unknown) => {
    const failure = failedAs(message, unavailable(cause))
    if (failure !== undefined) post(failure)
  })
}
