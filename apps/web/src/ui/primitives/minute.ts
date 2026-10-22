import { createSignal, onCleanup, type Accessor } from "solid-js"

import { onShownAgain } from "./shown-again"

/** How long past the minute the clock is read, in milliseconds: a timer may go off a moment early, and the minute must have struck by then. */
const PAST_THE_MINUTE = 250

/** When the minute a moment is in began, in milliseconds. */
const minuteOf = (moment: Date): number => new Date(moment).setSeconds(0, 0)

const untilNextMinute = (moment: Date): number => new Date(moment).setSeconds(60, 0) - moment.getTime() + PAST_THE_MINUTE

/**
 * The minute the device's clock is in, as when it began: for what turns
 * on how long ago something was, read anew once a minute and no oftener.
 * One timer waits for the next minute, and the minute is looked at once
 * more whenever the page is before the person again, a device asleep
 * having struck nothing.
 */
export const createMinuteStruck = (): Accessor<number> => {
  const [minute, setMinute] = createSignal(minuteOf(new Date()))
  const held: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  const read = (): void => void setMinute(minuteOf(new Date()))
  const wait = (): void => {
    held.timer = setTimeout(strike, untilNextMinute(new Date()))
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
  return minute
}
