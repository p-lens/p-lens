/// <reference lib="webworker" />

import { fetchUnlessStalled } from "../../download/unless-stalled"
import type { WorkerCall, WorkerReply } from "../protocol/messages"
import { startEngine, type Engine, type EngineReply } from "./engine"

/**
 * hledger runs here, never on the page's thread: compiling the module and
 * parsing a journal both take long enough to freeze a screen. The instance is
 * kept alive between calls so the parsed journal stays in its memory.
 */

const started: { engine: Promise<Engine> | undefined } = { engine: undefined }

/** How long the module may go without a byte arriving, in milliseconds, where the service worker does not have it yet and it comes over the network: a signal gone must not leave every book waiting for good, and a slow one must not be cut off while it still brings the module in. */
const STALLED_AFTER = 30_000

/** A start that failed is not kept, so the next call tries again — once the signal is back, or the service worker has the module. */
const forgotten = (cause: unknown): Promise<never> => {
  started.engine = undefined
  return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)))
}

const engine = (): Promise<Engine> => {
  const running =
    started.engine ??
    WebAssembly.compileStreaming(fetchUnlessStalled(`${import.meta.env.BASE_URL}hledger.wasm`, STALLED_AFTER))
      .then(startEngine)
      .catch(forgotten)
  started.engine = running
  return running
}

const serve = async (call: WorkerCall): Promise<EngineReply> => {
  const hledger = await engine()
  return call.op === "open" ? hledger.open(call.files, call.entry) : hledger.query(call.request)
}

const answer = (id: number, reply: EngineReply): void => {
  const message: WorkerReply = { id, ...reply }
  self.postMessage(message)
}

const queue: { last: Promise<void> } = { last: Promise.resolve() }

/**
 * One call at a time. Every call shares one filesystem and one parsed journal,
 * and an open replaces both, so two in flight would clear the files from under
 * each other. A failure anywhere is answered rather than thrown, so it cannot
 * break the chain and strand the calls behind it.
 */
self.onmessage = (event: MessageEvent<WorkerCall>): void => {
  const call = event.data
  queue.last = queue.last
    .then(() => serve(call))
    .then(
      (reply) => answer(call.id, reply),
      (cause: unknown) => answer(call.id, { ok: false, trouble: { kind: "unreachable", detail: String(cause) } }),
    )
}
