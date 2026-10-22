/** How long a tap buzzes, in milliseconds: short enough to feel as a click. */
const TAP = 10

/** How long a hold buzzes once it has lasted, in milliseconds: longer than a tap, so a take-back is felt apart. */
const HOLD = 30

/** How something turning hot buzzes, in milliseconds, buzzing and resting by turns: a short one, a breath, and a long one, as a pachinko cabinet shakes when a held spin turns purple. */
const HOT = [40, 70, 160]

/** Buzzes for so long, or by turns, where the device can; a browser without vibration (iOS Safari among them) does nothing. */
const buzz = (pattern: number | readonly number[]): void => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([pattern].flat())
}

/** Lets a finger feel a tap that counted. */
export const feelTap = (): void => buzz(TAP)

/** Lets a finger feel a hold that did its own thing. */
export const feelHold = (): void => buzz(HOLD)

/** Lets a finger feel something turn hot: what is pressed has gone nerdpro's purple. */
export const feelHot = (): void => buzz(HOT)
