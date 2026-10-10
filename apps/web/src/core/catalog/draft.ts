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

/** The shape a draft is written in; one written in another is not read back. */
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

/**
 * A game's draft read back, or none: nothing written, written in another
 * shape, or another game's. The formula's basis is not checked here — the
 * engine refuses one it cannot read when the form is filled from it.
 */
export const readDraft = (written: string | undefined, gameKind: GameKind): FormulaDraft | undefined => {
  const read = written === undefined ? undefined : parsed(written)
  if (!isRecord(read) || read["v"] !== DRAFT_VERSION) return undefined
  const { target, formula } = read
  if (!isRecord(target) || (target["type"] !== "catalog" && target["type"] !== "new")) return undefined
  if (!isRecord(formula) || formula["gameKind"] !== gameKind || !isRecord(formula["formula"])) return undefined
  return { target, formula } as unknown as FormulaDraft
}
