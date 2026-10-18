import type { IsoDate } from "../../src/core/calendar/calendar"
import type { Entry } from "../../src/core/journal/entry"
import type { PlayId } from "../../src/core/play/play"
import { Err, Ok } from "../../src/core/result/result"
import { NOTHING_TALLIED, madeAll, makingOf, nextDayOf, withDay, type Making, type SampleOrder, type Tallied } from "../../src/core/sample-book/book"
import type { SampleMaker } from "../../src/sample-book/port/sample-maker"

/** The days played in this process, as the worker plays them, each play's id counted from one. */
export const inProcessMaker = (): SampleMaker => ({
  play: async (work, watch) => {
    const counter = { next: 0 }
    const playIdOn = (date: IsoDate): PlayId => {
      counter.next += 1
      return `sample-${date}-${String(counter.next)}` as PlayId
    }
    const order: SampleOrder = { ...work, playIdOn }
    const held: { making: Making; tallied: Tallied; entries: Entry[] } = { making: makingOf(order), tallied: NOTHING_TALLIED, entries: [] }
    while (!madeAll(held.making)) {
      if (watch.cancelled()) return Ok(undefined)
      const next = nextDayOf(order, held.making)
      if (!next.ok) return Err({ type: "day", problem: next.error })
      held.making = next.value.making
      held.tallied = withDay(held.tallied, next.value.day)
      held.entries.push(...(next.value.day?.entries ?? []))
      watch.onDay({ done: held.making.at, of: held.making.days.length, day: next.value.day, tallied: held.tallied })
    }
    return Ok({ entries: held.entries, tallied: held.tallied })
  },
})
