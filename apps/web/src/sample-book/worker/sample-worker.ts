/// <reference lib="webworker" />

import { RANDOM_BYTES, formatUuidV7 } from "@p-lens/uuidv7"

import type { IsoDate } from "../../core/calendar/calendar"
import type { Entry } from "../../core/journal/entry"
import type { PlayId } from "../../core/play/play"
import { NOTHING_TALLIED, madeAll, makingOf, nextDayOf, withDay, type Making, type SampleOrder, type Tallied } from "../../core/sample-book/book"
import type { SampleCall, SampleMessage } from "../protocol/messages"

/**
 * A sample book's days are played here, never on the page's thread: three
 * years of draws and entries take long enough to freeze a screen, and a
 * phone's browser offers to stop a page that does. A day is told as it is
 * played, and the worker rests a moment after each, so the telling is seen
 * and the page is never kept waiting; then every entry is handed over at
 * once.
 */

/** A play's id, a UUIDv7 placed in its day, as a play added by hand afterwards is: so it sorts among that day's. */
const playIdOn = (date: IsoDate): PlayId => {
  const made = formatUuidV7(Date.parse(`${date}T00:00:00Z`), crypto.getRandomValues(new Uint8Array(RANDOM_BYTES)))
  return (made.ok ? made.value : crypto.randomUUID()) as string as PlayId
}

const tell = (message: SampleMessage): void => {
  self.postMessage(message)
}

const rest = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const play = async (call: SampleCall): Promise<void> => {
  const order: SampleOrder = { ...call.work, playIdOn }
  const held: { making: Making; tallied: Tallied; entries: Entry[] } = { making: makingOf(order), tallied: NOTHING_TALLIED, entries: [] }
  while (!madeAll(held.making)) {
    const next = nextDayOf(order, held.making)
    if (!next.ok) return tell({ type: "failed", problem: next.error })
    held.making = next.value.making
    held.tallied = withDay(held.tallied, next.value.day)
    held.entries.push(...(next.value.day?.entries ?? []))
    const day = next.value.day
    tell({ type: "day", done: held.making.at, of: held.making.days.length, day: day === undefined ? undefined : { date: day.date, parlor: day.parlor, machines: day.machines }, tallied: held.tallied })
    await rest()
  }
  tell({ type: "played", played: { entries: held.entries, tallied: held.tallied } })
}

self.onmessage = (event: MessageEvent<SampleCall>): void => {
  void play(event.data)
}
