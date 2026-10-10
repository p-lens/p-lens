import type { Request, Trouble } from "./wire"

/** What crosses into the worker. */
export type WorkerCall =
  | { readonly id: number; readonly op: "open"; readonly files: Readonly<Record<string, string>>; readonly entry: string }
  | { readonly id: number; readonly op: "query"; readonly request: Request }

/** What comes back, carrying the id it was asked under. */
export type WorkerReply =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly trouble: Trouble }
