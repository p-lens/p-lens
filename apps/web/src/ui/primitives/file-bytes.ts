import type { Outcome } from "../../application/errors"
import { Err, Ok } from "../../core/result/result"

/** A file a person picked, read whole; one that cannot be read — a file kept in a cloud and not on the device, read with no signal, or one the picker took back — says so rather than leaving the press waiting. */
export const bytesOfFile = async (file: Blob): Promise<Outcome<Uint8Array<ArrayBuffer>>> => {
  try {
    return Ok(new Uint8Array(await file.arrayBuffer()))
  } catch {
    return Err({ type: "backup", problem: { type: "file-unopened" } })
  }
}
