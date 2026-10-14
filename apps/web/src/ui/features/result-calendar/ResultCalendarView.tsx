import { createResource, createSignal, type JSX } from "solid-js"

import { loadBreakdown } from "../../../application/breakdown"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { monthOf, type IsoMonth } from "../../../core/calendar/calendar"
import { rangeTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { monthQuery } from "./month"
import { ResultCalendar } from "./ResultCalendar"

/** What the calendar asks hledger about: a month of a book, as the book now stands. */
interface Asked {
  readonly bookId: BookId
  readonly month: IsoMonth
  readonly revision: number
}

/**
 * A book's results a month at a time, as a calendar. The month shown is
 * this screen's own and is in no address: it opens on the month of the
 * business day, and a day pressed goes to that day's tallies. hledger does
 * every sum: the days are its breakdown by day and the month's two
 * figures its breakdown by month, both asked for the one month.
 */
export function ResultCalendarView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [month, setMonth] = createSignal<IsoMonth>(monthOf(app.services.businessDay()))
  const asked = (): Asked => ({ bookId: props.bookId, month: month(), revision: app.revision() })
  const [days] = createResource(asked, (source) => loadBreakdown(app.services.session, source.bookId, "day", monthQuery(source.month)))
  const [whole] = createResource(asked, (source) => loadBreakdown(app.services.session, source.bookId, "month", monthQuery(source.month)))
  const [kept] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => keepsTheoreticalValues(app.services.session, source.bookId))
  /** Whether the book keeps theoretical values: taken to until hledger says it does not. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  return (
    <ResultCalendar
      place={props.place}
      month={month()}
      onMonth={setMonth}
      days={days()}
      whole={whole()}
      theoreticalKept={theoreticalKept()}
      onOpen={(day) => moves.go({ kind: "book-view", bookId: props.bookId, view: "tallies" }, rangeTerm(day, day))}
    />
  )
}
