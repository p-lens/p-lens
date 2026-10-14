import type { CatalogDto, CreatedDto, QuotaDto, RegisteredDto, RegisterMachineDto } from "@p-lens/contracts"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

import type { Result } from "../../core/result/result"

/**
 * Why the shared catalog did not answer as asked: there is none to ask, it
 * could not be reached, or it answered with an error of its own, as it said it.
 */
export type ApiFailure =
  | { readonly type: "absent" }
  | { readonly type: "unreachable"; readonly detail: string }
  | { readonly type: "answered"; readonly status: number; readonly error: { readonly type: string } & Readonly<Record<string, unknown>> }
  /** An answer that says it went through and is not what was asked for: a page a hall's network put in its place, or one cut short. */
  | { readonly type: "unreadable-answer" }

/** A mark or a use, as it is sent: what to ask of which path, and — a mark — the voter it is asked as, in place of this device. */
export interface CatalogRequest {
  readonly method: "PUT" | "DELETE" | "POST"
  readonly path: string
  readonly as?: string
}

/**
 * The shared catalog as the device reaches it: its version and the whole of
 * it, delivered; what is registered, sent; and a mark or a use, sent on its
 * turn. Every write names this device, and so does asking where it stands
 * against the quotas.
 */
export interface CatalogApi {
  readonly version: () => Promise<Result<string, ApiFailure>>
  readonly catalog: () => Promise<Result<CatalogDto, ApiFailure>>
  /** Where this device stands against the quotas on registering, asked before anything is typed. */
  readonly quota: () => Promise<Result<QuotaDto, ApiFailure>>
  readonly register: (machine: RegisterMachineDto) => Promise<Result<RegisteredDto, ApiFailure>>
  readonly addFormula: (machineId: string, formula: PachinkoContract.NewFormulaDto | PachislotContract.NewFormulaDto) => Promise<Result<CreatedDto, ApiFailure>>
  readonly addDistribution: (machineId: string, distribution: PachislotContract.NewSettingDistributionDto) => Promise<Result<CreatedDto, ApiFailure>>
  readonly send: (request: CatalogRequest) => Promise<Result<void, ApiFailure>>
}
