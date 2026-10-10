import { Err, Ok } from "../../core/result/result"
import type { LocateError, Locator } from "../port/locator"

/**
 * How long a position is waited for once it is being looked for, how long
 * the whole asking may take — a permission prompt left unanswered pauses the
 * browser's own wait — and how old a remembered position may be, in
 * milliseconds.
 */
const WAIT = 10_000
const GIVE_UP = 15_000
const FRESH_ENOUGH = 60_000

const errorOf = (error: GeolocationPositionError): LocateError =>
  error.code === error.PERMISSION_DENIED ? { type: "denied" } : error.code === error.TIMEOUT ? { type: "timed-out" } : { type: "unavailable" }

/**
 * The browser's own geolocation, coarse and quick: a parlor is chosen by which
 * is nearest, not by the metre. Never waits for ever: a prompt nobody answers
 * is given up on, and the parlors are searched by name instead.
 */
export const browserLocator: Locator = () =>
  new Promise((settle) => {
    if (!("geolocation" in navigator)) {
      settle(Err({ type: "unsupported" }))
      return
    }
    setTimeout(() => settle(Err({ type: "timed-out" })), GIVE_UP)
    navigator.geolocation.getCurrentPosition(
      (position) => settle(Ok({ latitude: position.coords.latitude, longitude: position.coords.longitude })),
      (error) => settle(Err(errorOf(error))),
      { enableHighAccuracy: false, timeout: WAIT, maximumAge: FRESH_ENOUGH },
    )
  })
