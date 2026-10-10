import { Err, Ok, type Result } from "../../core/result/result"
import type { WorkerCall, WorkerReply } from "../protocol/messages"
import type { Answer, JournalSummary, Request, Trouble } from "../protocol/wire"

export type Reply<T> = Result<T, Trouble>

/** What may be done with the journal while holding a turn at it. */
export interface JournalAccess {
  /** Replace the journal hledger holds with these files, read from `entry`. */
  readonly open: (files: Readonly<Record<string, string>>, entry: string) => Promise<Reply<JournalSummary>>
  readonly ask: <K extends Request["kind"]>(request: Extract<Request, { kind: K }>) => Promise<Reply<Answer[K]>>
}

/**
 * The only way to hledger.
 *
 * hledger holds a single parsed journal, so everything touching it waits in
 * one line: `inTurn` runs a piece of work with the journal to itself. Opening
 * a candidate, asking about it and putting the old one back is three calls
 * meaning one thing, and a turn keeps them together. Nothing here throws or
 * rejects; a dead worker answers everyone waiting on it.
 */
export interface HledgerClient {
  readonly inTurn: <T>(work: (journal: JournalAccess) => Promise<T>) => Promise<T>
}

type WithoutId<T> = T extends { readonly id: number } ? Omit<T, "id"> : never

/**
 * What went wrong with the worker. A script that never loaded fires a plain
 * event with no message at all, whatever the type says.
 */
const failureOf = (event: ErrorEvent): string =>
  typeof event.message === "string" && event.message !== "" ? event.message : "hledger's worker could not be loaded"

export const createHledgerClient = (spawn: () => Worker): HledgerClient => {
  const waiting = new Map<number, (reply: Reply<unknown>) => void>()
  const counter = { next: 1 }
  const channel: { worker: Worker | undefined } = { worker: undefined }
  const turns: { last: Promise<unknown> } = { last: Promise.resolve() }

  const abandon = (trouble: Trouble): void => {
    const stranded = [...waiting.values()]
    waiting.clear()
    channel.worker?.terminate()
    channel.worker = undefined
    stranded.forEach((settle) => settle(Err(trouble)))
  }

  const connect = (): Worker => {
    const worker = spawn()
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const settle = waiting.get(event.data.id)
      waiting.delete(event.data.id)
      settle?.(event.data.ok ? Ok(event.data.value) : Err(event.data.trouble))
    }
    worker.onerror = (event) => abandon({ kind: "unreachable", detail: failureOf(event) })
    return worker
  }

  const send = <T>(call: WithoutId<WorkerCall>): Promise<Reply<T>> => {
    const id = counter.next++
    try {
      const worker = channel.worker ?? connect()
      channel.worker = worker
      return new Promise<Reply<T>>((settle) => {
        waiting.set(id, settle as (reply: Reply<unknown>) => void)
        worker.postMessage({ ...call, id })
      })
    } catch (cause) {
      waiting.delete(id)
      return Promise.resolve(Err({ kind: "unreachable", detail: String(cause) }))
    }
  }

  const access: JournalAccess = {
    open: (files, entry) => send<JournalSummary>({ op: "open", files, entry }),
    ask: <K extends Request["kind"]>(request: Extract<Request, { kind: K }>) => send<Answer[K]>({ op: "query", request }),
  }

  const inTurn = <T>(work: (journal: JournalAccess) => Promise<T>): Promise<T> => {
    const mine = turns.last.then(() => work(access))
    turns.last = mine.then(
      () => undefined,
      () => undefined,
    )
    return mine
  }

  return { inTurn }
}
