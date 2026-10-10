import { isUuidV7 } from "@p-lens/uuidv7"

import type { ApiError } from "../domain/errors"
import { Err, Ok, type Result } from "../domain/result"

/** Who is asking: a device, by the UUIDv7 it made for itself. There is no login. */
export interface Identity {
  readonly provider: "device"
  readonly subject: string
}

export type Authenticate = (request: Request) => Result<Identity, ApiError>

/**
 * The device named by the `X-P-Lens-Device` header. Not proof of anything
 * but continuity: the same device marks the same way, once per mark.
 */
export const byDevice: Authenticate = (request) => {
  const device = request.headers.get("X-P-Lens-Device")?.trim()
  return device !== undefined && isUuidV7(device) ? Ok({ provider: "device", subject: device }) : Err({ type: "unauthenticated" })
}
