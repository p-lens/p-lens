import type { MachineId } from "../../core/machine/machine"
import type { Mark } from "../../core/formula/standing"
import type {
  CatalogTarget,
  GameKind,
  MachineEntry,
  MachineSummary,
  NewFormula,
  NewMachine,
  NewSettingDistribution,
} from "../../core/catalog/catalog"
import type { Quota, RegistrationKind } from "../../core/catalog/quota"
import type { Result } from "../../core/result/result"

/**
 * What was sent and taken in: the shared catalog has it, and it reaches this
 * device with the next delivery — usable from then on, like anyone's.
 */
export interface Submitted {
  readonly machineId: MachineId
  readonly id: string
}

export type CatalogError =
  | { readonly type: "unavailable"; readonly detail: string }
  /** No catalog to send to: the app was built without one. */
  | { readonly type: "no-catalog" }
  | { readonly type: "machine-missing"; readonly id: string }
  | { readonly type: "formula-missing"; readonly id: string }
  | { readonly type: "distribution-missing"; readonly id: string }
  /** A machine of another game than the one asked for. */
  | { readonly type: "other-game"; readonly id: string; readonly gameKind: GameKind }
  /** A machine of this name and game is already in the catalog; add a formula to it instead. */
  | { readonly type: "name-taken"; readonly name: string; readonly existing: MachineId | undefined }
  /** A machine already in the catalog has this model name: a model name is one machine's. */
  | { readonly type: "model-name-taken"; readonly modelName: string }
  /** Only a formula worked out from a basis can be verified or refuted: there is nothing else to check. */
  | { readonly type: "not-verifiable" }
  /** A check given stands: it is not taken back, only answered with the other. */
  | { readonly type: "check-stands" }
  /** A mark that cannot be put on what it was put on: rejecting or verifying a 設定配分. */
  | { readonly type: "not-markable"; readonly mark: Mark }
  /** This device, or its address, has registered as much of a kind as the shared catalog takes for now: `nextAt` is from when it takes the next. */
  | { readonly type: "quota-reached"; readonly kind: RegistrationKind; readonly nextAt: string }
  /** The shared catalog would not take it, as it said. */
  | { readonly type: "refused"; readonly reason: string }

/**
 * The shared catalog of both games as this device holds it: delivered whole,
 * read here without asking anyone, and refreshed when its version moves. What
 * is registered is sent to the shared catalog at once and comes back with the
 * next delivery; marks and uses are kept here at once and sent when they can
 * be. A machine never exists without a formula: it is registered together
 * with its first one.
 */
export interface Catalog {
  readonly search: (query: string, gameKind: GameKind) => Promise<Result<readonly MachineSummary[], CatalogError>>
  readonly read: (machineId: string) => Promise<Result<MachineEntry, CatalogError>>
  readonly register: (machine: NewMachine, formula: NewFormula) => Promise<Result<Submitted, CatalogError>>
  readonly addFormula: (machineId: MachineId, formula: NewFormula) => Promise<Result<Submitted, CatalogError>>
  readonly addDistribution: (machineId: MachineId, distribution: NewSettingDistribution) => Promise<Result<Submitted, CatalogError>>
  /** Where this device stands against the quotas on registering: asked of the shared catalog each time, never kept. */
  readonly quota: () => Promise<Result<Quota, CatalogError>>
  /**
   * Set or clear a voter's mark. Adopting one formula, or one 設定配分, of a
   * machine lets go of any other of its kind; a check either way is given
   * once and never cleared. The voter is whoever the mark is counted as:
   * one name for a person's book wherever it is opened, so the devices it
   * is on count once between them.
   */
  readonly mark: (target: CatalogTarget, mark: Mark, on: boolean, voter: string) => Promise<Result<void, CatalogError>>
  readonly recordUse: (target: CatalogTarget) => Promise<Result<void, CatalogError>>
  /** Sends what is waiting, and takes a new delivery if the shared catalog has moved on: whether it had. */
  readonly refresh: () => Promise<Result<{ readonly changed: boolean }, CatalogError>>
}
