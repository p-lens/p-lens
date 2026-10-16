/** How long a tap buzzes, in milliseconds: short enough to feel as a click. */
const TAP = 10

/** How long a hold buzzes once it has lasted, in milliseconds: longer than a tap, so a take-back is felt apart. */
const HOLD = 30

/** Buzzes for so long where the device can; a browser without vibration (iOS Safari among them) does nothing. */
const buzz = (milliseconds: number): void => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(milliseconds)
}

/** Lets a finger feel a tap that counted. */
export const feelTap = (): void => buzz(TAP)

/** Lets a finger feel a hold that did its own thing. */
export const feelHold = (): void => buzz(HOLD)
