import { createResource, createSignal, type JSX } from "solid-js"

import { consolidationKeepsTheoreticalValues, loadConsolidation } from "../../../application/consolidation"
import type { BookId } from "../../../core/book/book"
import { monthOf, type IsoMonth } from "../../../core/calendar/calendar"
import { rangeTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { monthQuery, ResultCalendar } from "../result-calendar"
import { ConsolidatedBooks } from "./ConsolidatedBooks"
import { mergedOf, unreadIn } from "./read"

/** What the calendar asks of the books: a month of those chosen, as they now stand. */
interface Asked {
  readonly bookIds: readonly BookId[] | undefined
  readonly month: IsoMonth
  readonly revision: number
}

/**
 * Several books' results a month at a time, as a book's calendar shows
 * its own: each day what the tallies of the books ticked made together, the
 * month's two figures above. Each book's days and month are its own, from
 * hledger, and one day of several books is those added. Which books are
 * the address's; the month is this screen's own, as it is in a book. A
 * day pressed goes to what each book made that day, there being no one
 * list of several books' tallies.
 */
export function ConsolidatedResultCalendarView(props: { readonly place: Place; readonly bookIds: readonly BookId[] | undefined }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [month, setMonth] = createSignal<IsoMonth>(monthOf(app.services.businessDay()))
  const asked = (): Asked => ({ bookIds: props.bookIds, month: month(), revision: app.revision() })
  const [days] = createResource(asked, (source) => loadConsolidation(app.services.session, source.bookIds, "day", monthQuery(source.month)))
  const [whole] = createResource(asked, (source) => loadConsolidation(app.services.session, source.bookIds, "month", monthQuery(source.month)))
  const [kept] = createResource(() => ({ bookIds: props.bookIds, revision: app.revision() }), (source) => consolidationKeepsTheoreticalValues(app.services.session, source.bookIds))
  /** Whether any of the books keeps theoretical values: taken to until hledger says none does. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  return (
    <ResultCalendar
      place={props.place}
      month={month()}
      onMonth={setMonth}
      days={mergedOf(days())}
      whole={mergedOf(whole())}
      theoreticalKept={theoreticalKept()}
      onOpen={(day) => moves.go({ kind: "consolidated-breakdown", by: "book", bookIds: props.bookIds }, rangeTerm(day, day))}
    >
      <ConsolidatedBooks bookIds={props.bookIds} unread={(id) => unreadIn(days(), id)} onChosen={(bookIds) => moves.go({ kind: "consolidated-result-calendar", bookIds })} />
    </ResultCalendar>
  )
}
