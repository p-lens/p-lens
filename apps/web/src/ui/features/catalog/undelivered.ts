import type { Outcome } from "../../../application/errors"
import { Err } from "../../../core/result/result"
import type { DeliveryState } from "../../context"
import { isUnreached } from "./unreached"

const MISSING: ReadonlySet<string> = new Set(["machine-missing", "formula-missing", "distribution-missing"])

/**
 * What a machine, a formula or a 設定配分 not found on the device is,
 * where the catalog's last delivery failed: not missing, only not in what
 * the device has received — said so, rather than that it was never
 * registered or will come if waited for. Where the delivery failed for want
 * of a connection that is what is said; where it failed for anything else —
 * the device's own storage, the catalog failing itself — that failure is
 * said in its place.
 */
export const missingUndelivered = <T>(outcome: Outcome<T> | undefined, delivery: DeliveryState): Outcome<T> | undefined => {
  if (outcome?.ok !== false || outcome.error.type !== "catalog" || !MISSING.has(outcome.error.error.type) || delivery.type !== "failed") return outcome
  return isUnreached(Err(delivery.error)) ? Err({ type: "catalog", error: { type: "undelivered" } }) : Err(delivery.error)
}
