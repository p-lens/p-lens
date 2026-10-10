import { readFile } from "node:fs/promises"

import type { Envelope } from "@p-lens/contracts/pachislot"
import * as engine from "@p-lens/pachislot-engine/pachislot.js"

import { Err, Ok } from "../../../src/core/result/result"
import type { EngineClient } from "../../../src/pachislot-engine/client/client"
import type { Call } from "../../../src/pachislot-engine/protocol/messages"

engine.initSync({ module: await readFile(new URL("../../../../../packages/pachislot-engine/pachislot_bg.wasm", import.meta.url)) })

const CALLS: Readonly<Record<Call, (request: string) => string>> = {
  analyze: engine.analyze,
  posterior: engine.posterior,
  theoreticalValue: engine.theoreticalValue,
}

const refused = (): never => {
  throw new Error("runs are not answered in-process")
}

/** The real pachislot engine answered on the test's own thread: calls only, no runs. */
export const inProcessEngine: EngineClient = {
  call: async (name, request) => {
    const envelope = JSON.parse(CALLS[name](JSON.stringify(request))) as Envelope<never>
    return envelope.ok ? Ok(envelope.value) : Err({ type: "engine", error: envelope.error })
  },
  simulate: refused,
  estimate: refused,
}
