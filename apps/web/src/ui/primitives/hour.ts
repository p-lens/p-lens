import { createSignal, onCleanup, type Accessor } from "solid-js"

import { onShownAgain } from "./shown-again"

/** How long past the hour the clock is read, in milliseconds: a timer may go off a moment early, and the hour must have struck by then. */
const PAST_THE_HOUR = 250

/** When the hour a moment is in began, in milliseconds. */
const hourOf = (moment: Date): number => new Date(moment).setMinutes(0, 0, 0)

const untilNextHour = (moment: Date): number => new Date(moment).setMinutes(60, 0, 0) - moment.getTime() + PAST_THE_HOUR

/**
 * The hour the device's clock is in, as when it began: what is read with
 * it is read anew when the day may have turned — the calendar's at
 * midnight, a business day's at its own hour. The clock is not watched:
 * one timer waits for the next hour, and the hour is looked at once more
 * whenever the page is before the person again, a device asleep having
 * struck nothing. Within the same hour nothing is told to anyone.
 */
export const createHourStruck = (): Accessor<number> => {
  const [hour, setHour] = createSignal(hourOf(new Date()))
  const held: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  const read = (): void => void setHour(hourOf(new Date()))
  const wait = (): void => {
    held.timer = setTimeout(strike, untilNextHour(new Date()))
  }
  const strike = (): void => {
    read()
    wait()
  }
  const stopListening = onShownAgain(read)
  wait()
  onCleanup(() => {
    clearTimeout(held.timer)
    stopListening()
  })
  return hour
}
