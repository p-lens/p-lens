import { createResource, createSignal, type JSX } from "solid-js"

import { loadDaysAndWhole, loadSenderNames, type Players } from "../../../application/breakdown"
import { keepsTheoreticalValues } from "../../../application/theoretical"
import type { BookId } from "../../../core/book/book"
import { monthOf, type IsoMonth } from "../../../core/calendar/calendar"
import { mapOk } from "../../../core/result/result"
import { UNSENT, type SenderNames } from "../../../core/report/senders"
import { rangeTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { TickFilter, type Offered } from "../../primitives/filter"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { senderName, unsentName } from "../../wording/breakdown"
import { monthQuery } from "./month"
import { ResultCalendar } from "./ResultCalendar"
import { BY_PLAYERS, NO_PLAYERS } from "./wording"

/** What the calendar asks hledger about: a month of a book, of the tallies of those chosen, as the book now stands. */
interface Asked {
  readonly bookId: BookId
  readonly month: IsoMonth
  readonly players: Players
  readonly revision: number
}

const NO_NAMES: SenderNames = new Map()

/** Who may be chosen among those that played a book: its own tallies, then each sender by id. */
const playersOffered = (names: SenderNames): readonly string[] => [UNSENT, ...names.keys()]

/**
 * A book's results a month at a time, as a calendar. The month shown is
 * this screen's own and is in no address: it opens on the month of the
 * business day, and a day pressed goes to that day's tallies. hledger does
 * every sum: the days are its breakdown by day, and the month's two
 * figures the totals of that same breakdown, asked once for the month. Where
 * someone has sent plays to the book, a funnel at the end of the month's
 * row chooses whose tallies are shown — the book's own, that name no
 * sender, and each sender's by the name on their last — and hledger is
 * asked of theirs alone; who is chosen is the address's.
 */
export function ResultCalendarView(props: { readonly place: Place; readonly bookId: BookId; readonly senders: readonly string[] | undefined }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [month, setMonth] = createSignal<IsoMonth>(monthOf(app.services.businessDay()))
  const [named] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => loadSenderNames(app.services.session, source.bookId))
  const [listed] = createResource(() => app.revision(), () => app.services.session.books())
  /** Who sent plays to the book, by their last names; none while they are awaited or could not be read. */
  const names = (): SenderNames => ((answer) => (answer?.ok === true ? answer.value : NO_NAMES))(named())
  const players = (): Players => ({ chosen: props.senders, offered: playersOffered(names()) })
  const asked = (): Asked => ({ bookId: props.bookId, month: month(), players: players(), revision: app.revision() })
  const [results] = createResource(asked, (source) => loadDaysAndWhole(app.services.session, source.bookId, monthQuery(source.month), source.players))
  const [kept] = createResource(() => ({ bookId: props.bookId, revision: app.revision() }), (source) => keepsTheoreticalValues(app.services.session, source.bookId))
  /** Whether the book keeps theoretical values: taken to until hledger says it does not. */
  const theoreticalKept = (): boolean => ((answer) => answer?.ok !== true || answer.value)(kept())
  /** What the book's own tallies are called among who played it: under its title, as a consolidation calls them. */
  const ownName = (): string => ((found) => unsentName(found?.ok === true ? bookTitle(found.value.find((book) => book.id === props.bookId) ?? { title: undefined }) : "--"))(listed())
  const offered = (): readonly Offered[] => playersOffered(names()).map((key) => ({ key, label: key === UNSENT ? ownName() : senderName(names(), key) }))
  return (
    <ResultCalendar
      place={props.place}
      month={month()}
      onMonth={setMonth}
      days={((found) => found && mapOk(found, (month) => month.days))(results())}
      whole={((found) => found && mapOk(found, (month) => month.whole))(results())}
      loading={results.loading}
      theoreticalKept={theoreticalKept()}
      onOpen={(day) => moves.go({ kind: "book-view", bookId: props.bookId, view: "tallies" }, rangeTerm(day, day))}
      filter={
        <TickFilter label={BY_PLAYERS} offered={names().size > 0 ? offered() : []} none={NO_PLAYERS} chosen={props.senders} onChosen={(senders) => moves.go({ kind: "book-view", bookId: props.bookId, view: "result-calendar", senders })} />
      }
    />
  )
}
