import { Err, Ok, type Result } from "../../core/result/result"
import type { Handover, HandoverFailure } from "../port/handover"

/** How long a download's address is kept after it is pressed, for the browser to have begun reading it, in milliseconds. */
const HELD_FOR = 60_000

/**
 * Whether the device's share sheet is the way to save a file here: a
 * device used by touch whose sheet takes this file. A desk's share sheet
 * offers people and apps but no folder, so a desk is given a download.
 */
const sharesFiles = (file: File): boolean => navigator.maxTouchPoints > 0 && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })

const downloaded = (file: File): Result<void, HandoverFailure> => {
  try {
    const address = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = address
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(address), HELD_FOR)
    return Ok(undefined)
  } catch (cause) {
    return Err({ type: "handover-unavailable", detail: String(cause) })
  }
}

/**
 * A file put before the share sheet, and downloaded where the sheet would
 * not have it: a sheet may say it takes a file and then refuse it — an
 * Android browser does so with a zip, as a permission denied — and the
 * person is still owed their file. A sheet they closed themselves is their
 * answer, and nothing is downloaded behind it.
 */
const shared = async (file: File): Promise<Result<void, HandoverFailure>> => {
  try {
    await navigator.share({ files: [file] })
    return Ok(undefined)
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "AbortError" ? Err({ type: "handover-cancelled" }) : downloaded(file)
  }
}

/**
 * A file handed over by the browser: through the share sheet on a phone or
 * a tablet that takes it — where 「"ファイル"に保存」 reaches iCloud Drive —
 * and as a download everywhere else, which the browser puts where the
 * person has told it downloads go.
 */
export const createBrowserHandover = (): Handover => ({
  give: async ({ name, type, bytes }) => {
    const file = new File([bytes], name, { type })
    return sharesFiles(file) ? shared(file) : downloaded(file)
  },
})
