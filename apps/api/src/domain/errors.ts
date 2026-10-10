import type { RegistrationKindDto } from "@p-lens/contracts"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

/** What a request can fail with. Each case says what happened; `statusOf` says how HTTP says it. */
export type ApiError =
  | { readonly type: "not-found"; readonly what: "route" | "machine" | "formula" | "distribution" | "tag" | "target" | "tagging" }
  | { readonly type: "method-not-allowed" }
  | {
      readonly type: "invalid-body"
      readonly field: string
      readonly reason: "missing" | "not-text" | "too-long" | "not-an-id" | "not-json" | "unknown-value" | "not-positive" | "not-a-date" | "too-early" | "too-far-ahead" | "forbidden" | "not-a-list" | "too-many" | "not-a-chance"
    }
  | { readonly type: "unauthenticated" }
  /** A request from anywhere but the pages this deployment serves the app from. */
  | { readonly type: "forbidden-origin" }
  /** More writes from one address than its limit takes, for now. */
  | { readonly type: "too-many-requests" }
  /** Registering something without the check that a person on the app's page is doing it. */
  | { readonly type: "human-check-failed" }
  /** More of one kind registered by a device, or from its address, than its quota takes: `nextAt` is from when the next is taken. */
  | { readonly type: "quota-reached"; readonly kind: RegistrationKindDto; readonly nextAt: string }
  | { readonly type: "conflict"; readonly what: "machine-name" | "model-name" | "tag-name" | "tagging" }
  /** A formula whose basis its game's engine refuses. */
  | { readonly type: "basis-rejected"; readonly error: PachinkoContract.EngineErrorDto | PachislotContract.EngineErrorDto }
  /** A formula whose figures are not what its basis comes to, named by the figure's path. */
  | { readonly type: "figures-disagree-with-basis"; readonly field: string }
  /** Something only the other game's machine has: a 設定配分 on a pachinko machine. */
  | { readonly type: "not-for-game"; readonly what: "distribution" }
  /** A mark that cannot be put on what it was put on: rejecting or verifying a 設定配分. */
  | { readonly type: "not-markable"; readonly mark: string }
  /** Verifying a formula that has no basis to check. */
  | { readonly type: "not-verifiable" }
  /** Taking back a check: one given stands, and is answered only with the other. */
  | { readonly type: "check-stands" }
  | { readonly type: "storage"; readonly detail: string }

export const statusOf = (error: ApiError): number => {
  switch (error.type) {
    case "not-found":
      return 404
    case "method-not-allowed":
      return 405
    case "invalid-body":
    case "not-verifiable":
    case "check-stands":
    case "not-for-game":
    case "not-markable":
      return 400
    case "unauthenticated":
      return 401
    case "forbidden-origin":
    case "human-check-failed":
      return 403
    case "too-many-requests":
    case "quota-reached":
      return 429
    case "conflict":
      return 409
    case "basis-rejected":
    case "figures-disagree-with-basis":
      return 422
    case "storage":
      return 500
  }
}
