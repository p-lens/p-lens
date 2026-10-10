import { Err, Ok, type Result } from "../../core/result/result"
import type { FromReasoner, ReasonerFailure, ToReasoner } from "../protocol/messages"

/**
 * The only way to the reasoner. Its worker — and with it Trealla — is not
 * started until a goal is asked of it.
 */
export interface ReasonerClient {
  /** Prove `goal` from the rules and `facts`; the goal's bindings, as JSON terms. */
  readonly prove: (facts: string, goal: string) => Promise<Result<unknown, ReasonerFailure>>
}

const failureOf = (event: ErrorEvent): string =>
  typeof event.message === "string" && event.message !== "" ? event.message : "the reasoner's worker could not be loaded"

export const createReasonerClient = (spawn: () => Worker): ReasonerClient => {
  const waiting = new Map<number, (message: FromReasoner) => void>()
  const counter = { next: 1 }
  const channel: { worker: Worker | undefined } = { worker: undefined }

  /** Everyone waiting hears that the reasoner is gone, rather than waiting forever. */
  const abandon = (detail: string): void => {
    const stranded = [...waiting.entries()]
    waiting.clear()
    channel.worker?.terminate()
    channel.worker = undefined
    stranded.forEach(([id, settle]) => settle({ type: "failed", id, failure: { type: "reasoner-unavailable", detail } }))
  }

  const worker = (): Worker => {
    const existing = channel.worker
    if (existing !== undefined) return existing
    const started = spawn()
    started.onmessage = (event: MessageEvent<FromReasoner>) => waiting.get(event.data.id)?.(event.data)
    started.onerror = (event) => abandon(failureOf(event))
    channel.worker = started
    return started
  }

  const send = (message: ToReasoner): Result<void, ReasonerFailure> => {
    try {
      worker().postMessage(message)
      return Ok(undefined)
    } catch (cause) {
      return Err({ type: "reasoner-unavailable", detail: String(cause) })
    }
  }

  const prove = (facts: string, goal: string): Promise<Result<unknown, ReasonerFailure>> => {
    const id = counter.next++
    return new Promise((settle) => {
      waiting.set(id, (message) => {
        waiting.delete(id)
        settle(message.type === "proved" ? Ok(message.bindings) : Err(message.failure))
      })
      const sent = send({ type: "prove", id, facts, goal })
      if (!sent.ok) {
        waiting.delete(id)
        settle(sent)
      }
    })
  }

  return { prove }
}
