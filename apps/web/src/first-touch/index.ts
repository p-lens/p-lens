/**
 * 操作の手引き, the first-touch notes: the first time a person touches a
 * field or a button that is hard to read at a glance, a loud yellow
 * bubble says what it is, once on the device. It may be taken out whole,
 * so the whole of it is here — its notes, where it keeps what was shown,
 * the bubble and the settings' screen that shows the notes again — and
 * it reads the screens from outside, never the other way round: no screen
 * carries anything for it. The app reaches it only through this index:
 * the services name its store (`FirstTouchStore`), the composition makes
 * it (`createLocalStorageFirstTouchStore`), `App` puts the bubble on the
 * page (`FirstTouch`), and the settings open its screen
 * (`FirstTouchSettings`, under `FIRST_TOUCH_RESET`).
 */
export type { FirstTouchStore } from "./port/first-touch-store"
export { createLocalStorageFirstTouchStore } from "./local/local-storage-first-touch-store"
export { FirstTouch } from "./ui/FirstTouch"
export { FirstTouchSettings } from "./ui/FirstTouchSettings"
export { FIRST_TOUCH_RESET } from "./ui/wording"
