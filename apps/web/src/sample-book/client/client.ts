import { Err, Ok } from "../../core/result/result"
import type { SampleCall, SampleMessage } from "../protocol/messages"
import type { SampleMaker } from "../port/sample-maker"

/**
 * The sample book's worker, one for each book made: started for it, told
 * the work, listened to day by day, and let go once every day is played
 * or the person stops it — stopping lets the worker go at once, where it
 * stands.
 */
export const createSampleMakerClient = (spawn: () => Worker): SampleMaker => ({
  play: (work, watch) =>
    new Promise((settle) => {
      if (watch.stopped.aborted) return settle(Ok(undefined))
      const worker = spawn()
      const held: { settled: boolean } = { settled: false }
      const done = (outcome: Parameters<typeof settle>[0]): void => {
        if (held.settled) return
        held.settled = true
        worker.terminate()
        settle(outcome)
      }
      watch.stopped.addEventListener("abort", () => done(Ok(undefined)), { once: true })
      worker.onmessage = (event: MessageEvent<SampleMessage>) => {
        const message = event.data
        switch (message.type) {
          case "day":
            return watch.onDay(message)
          case "played":
            return done(Ok(message.played))
          case "failed":
            return done(Err({ type: "day", problem: message.problem }))
        }
      }
      worker.onerror = (event) => done(Err({ type: "unreachable", detail: typeof event.message === "string" && event.message !== "" ? event.message : "the sample book's worker could not be loaded" }))
      const call: SampleCall = { work }
      worker.postMessage(call)
    }),
})
