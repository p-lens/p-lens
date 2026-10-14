import type { MachineId } from "../machine/machine"
import type { GameKind, NewFormula } from "./catalog"

/** A new machine as it was typed, field by field, so it goes back into the form as it stood. */
export interface TypedMachine {
  readonly name: string
  readonly modelName: string
  readonly keywords: string
  readonly hitChance: string
  readonly releasedOn: string
}

/** What a formula that could not be sent was for: a machine in the catalog, or a new one as typed. */
export type DraftTarget = { readonly type: "catalog"; readonly machineId: MachineId; readonly name: string } | { readonly type: "new"; readonly machine: TypedMachine }

/**
 * A formula the shared catalog did not take — the quota was reached, the
 * hall had no network — kept on the device so that hours of work are not
 * typed twice: what it was for, and the formula as it was sent.
 */
export interface FormulaDraft {
  readonly target: DraftTarget
  readonly formula: NewFormula
}

/** What a game's kept draft comes to: none written, one that reads, or one written that does not read. */
export type KeptFormulaDraft = { readonly type: "none" } | { readonly type: "kept"; readonly draft: FormulaDraft } | { readonly type: "unreadable" }

/** The shape a draft is written in; one written in another does not read. */
const DRAFT_VERSION = 1

export const writtenDraft = (draft: FormulaDraft): string => JSON.stringify({ v: DRAFT_VERSION, ...draft })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const parsed = (written: string): unknown => {
  try {
    return JSON.parse(written)
  } catch {
    return undefined
  }
}

const MACHINE_FIELDS = ["name", "modelName", "keywords", "hitChance", "releasedOn"] as const

const isTarget = (value: unknown): value is DraftTarget =>
  isRecord(value) &&
  ((value["type"] === "catalog" && typeof value["machineId"] === "string" && typeof value["name"] === "string") ||
    (value["type"] === "new" && isRecord(value["machine"]) && MACHINE_FIELDS.every((field) => typeof (value["machine"] as Readonly<Record<string, unknown>>)[field] === "string")))

/**
 * A game's draft read back: none where nothing is written, and one that
 * does not read where what is written is in another shape, another game's,
 * or for no machine it can name. The formula's basis is not checked here —
 * the engine refuses one it cannot read when the form is filled from it.
 */
export const readDraft = (written: string | undefined, gameKind: GameKind): KeptFormulaDraft => {
  if (written === undefined) return { type: "none" }
  const read = parsed(written)
  if (!isRecord(read) || read["v"] !== DRAFT_VERSION) return { type: "unreadable" }
  const { target, formula } = read
  if (!isTarget(target) || !isRecord(formula) || formula["gameKind"] !== gameKind || !isRecord(formula["formula"])) return { type: "unreadable" }
  return { type: "kept", draft: { target, formula } as unknown as FormulaDraft }
}
