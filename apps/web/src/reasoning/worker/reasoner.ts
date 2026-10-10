/// <reference lib="webworker" />

import type { FromReasoner, ToReasoner } from "../protocol/messages"

/**
 * The reasoner, run off the page's thread by a game's worker: Trealla
 * Prolog, compiled to WebAssembly, with the rules that worker serves. It is
 * imported on the first message, so nothing of it is fetched until grounds
 * are opened. Each goal is proved in an interpreter of its own, so one
 * formula's facts never meet another's. No game is known here: a game's
 * rules are its worker's to bring.
 */

type Trealla = typeof import("trealla")

const loaded: { trealla: Promise<Trealla> | undefined } = { trealla: undefined }

const trealla = (): Promise<Trealla> => {
  const pending =
    loaded.trealla ??
    import("trealla").then(async (module) => {
      await module.load()
      return module
    })
  loaded.trealla = pending
  pending.catch(() => {
    loaded.trealla = undefined
  })
  return pending
}

const post = (message: FromReasoner): void => self.postMessage(message)

const prove = async (rules: string, message: ToReasoner): Promise<void> => {
  const { Prolog } = await trealla()
  const prolog = new Prolog()
  await prolog.consultText(rules)
  await prolog.consultText(message.facts)
  const answer = await prolog.queryOnce(message.goal, { format: "json" })
  post(
    answer.status === "success"
      ? { type: "proved", id: message.id, bindings: answer.answer }
      : answer.status === "failure"
        ? { type: "failed", id: message.id, failure: { type: "not-proved" } }
        : { type: "failed", id: message.id, failure: { type: "reasoner-unavailable", detail: JSON.stringify(answer.error ?? answer.stderr ?? answer.status) } },
  )
}

/** Answer every goal sent to this worker from `rules` and the facts sent with it. */
export const serveReasoner = (rules: string): void => {
  self.onmessage = (event: MessageEvent<ToReasoner>): void => {
    const message = event.data
    prove(rules, message).catch((cause: unknown) => post({ type: "failed", id: message.id, failure: { type: "reasoner-unavailable", detail: String(cause) } }))
  }
}
