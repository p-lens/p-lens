import type { FirstTouchNote } from "../core/notes"

/**
 * What a device keeps of 操作の手引き: the notes it has shown. It is this
 * device's alone, goes with it when the device is emptied, and is
 * forgotten when the person asks to see the notes again.
 */
export interface FirstTouchStore {
  readonly seen: (note: FirstTouchNote) => boolean
  readonly see: (note: FirstTouchNote) => void
  readonly forget: () => void
}
