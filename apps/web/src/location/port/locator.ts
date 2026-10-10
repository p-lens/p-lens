import type { Coordinates } from "../../core/parlor/shared"
import type { Result } from "../../core/result/result"

/** Why the device could not say where it is. */
export type LocateError = { readonly type: "denied" } | { readonly type: "unavailable" } | { readonly type: "timed-out" } | { readonly type: "unsupported" }

/** Where the device is now, asked of the device itself; the answer is used on the device and sent nowhere. */
export type Locator = () => Promise<Result<Coordinates, LocateError>>
