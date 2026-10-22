import type { Catalog } from "../../catalog/port/catalog"
import type { BookId } from "../../core/book/book"
import type { BusinessDayTurn, IsoDate } from "../../core/calendar/calendar"
import { bookNameOf, type MachineSummary } from "../../core/catalog/catalog"
import type { TitleProblem } from "../../core/journal/title"
import { renderEntry, type Entry } from "../../core/journal/entry"
import { withEntriesFiled } from "../../core/journal/filing"
import { BOOK_FILES } from "../../core/journal/layout"
import type { Coordinates } from "../../core/parlor/shared"
import { Err, Ok, type Result } from "../../core/result/result"
import { openingOf, type SampleWork } from "../../core/sample-book/book"
import type { DayProblem, Lineup } from "../../core/sample-book/day"
import { drawsFrom } from "../../core/sample-book/draws"
import type { OnSale } from "../../core/sample-book/lineup"
import * as Pachinko from "../../core/sample-book/pachinko"
import type * as Pachislot from "../../core/sample-book/pachislot"
import { sampleParlorsOf } from "../../core/sample-book/parlors"
import { daysBetween, threeYearsTo } from "../../core/sample-book/schedule"
import type { Locator } from "../../location/port/locator"
import type { ParlorDirectory } from "../../parlors/port/parlor-directory"
import type { DaySeen, SampleMaker } from "../../sample-book/port/sample-maker"
import type { StoredBook } from "../../storage/port/book-storage"
import { addBook } from "../add-book"
import type { BookSession, ProposedChange } from "../book-session"
import { loadEntry } from "../catalog"
import { deleteBook, type DeletionPorts } from "../delete-book"
import type { ApplicationError, Outcome } from "../errors"
import { fromCatalog, fromDirectory } from "../lift"
import { withAccountsFor } from "../record-tally"

/** Everything making a sample book reaches: the books, the catalog its machines come from, the parlor list and where the device is, where its days are played, and what deleting a book takes, for one left half made. */
export interface SamplePorts {
  readonly session: BookSession
  readonly maker: SampleMaker
  readonly catalog: Catalog
  readonly parlors: ParlorDirectory
  readonly locate: Locator
  readonly deletion: DeletionPorts
}

/** A sample book asked for: its title, the book it is made as, the business day its owner's books turn over at, its last day, and its seed. */
export interface SampleRequest {
  readonly title: string
  readonly fresh: StoredBook
  readonly businessDayTurn: BusinessDayTurn
  readonly through: IsoDate
  readonly seed: string
}

/** How far making a sample book has got: finding where the device is, the parlors chosen and whether that was by where it is, machines read from the catalog, the days about to be played, days played, years written. */
export type SampleReport =
  | { readonly type: "locating" }
  | { readonly type: "placed"; readonly located: boolean; readonly prefecture: string | undefined; readonly parlors: number }
  | { readonly type: "gathering"; readonly done: number; readonly of: number }
  /** The days about to be played: the wait before the first is told of. */
  | { readonly type: "starting" }
  | {
      readonly type: "making"
      readonly done: number
      readonly of: number
      readonly day: DaySeen | undefined
      readonly result: number
      readonly theoreticalValue: number
    }
  | { readonly type: "writing"; readonly done: number; readonly of: number }

/** Who is told how far it has got, a pause after each step of getting ready so the telling is seen, and the signal the person stops it by. */
export interface SampleWatch {
  readonly onReport: (report: SampleReport) => void
  readonly pause: () => Promise<void>
  readonly stopped: AbortSignal
}

const CANCELLED: Outcome<Result<SampleEnd, SampleProblem>> = Ok(Ok({ type: "cancelled" }))

/** Why no sample book was made: no parlors or no machines to play, a title that cannot be written, or the place its days are played in out of reach. */
export type SampleProblem = { readonly type: "no-parlors" } | { readonly type: "no-machines" } | { readonly type: "title"; readonly problem: TitleProblem } | { readonly type: "unreachable" }

/** What making a sample book came to: the book, its days and tallies, and what they came to and were worth in yen; or nothing, stopped before it was written. */
export type SampleEnd =
  | {
      readonly type: "made"
      readonly bookId: BookId
      readonly days: number
      readonly tallies: number
      readonly result: number
      readonly theoreticalValue: number
    }
  | { readonly type: "cancelled" }

/** What the activity says a sample book's tallies were taken in from. */
const SAMPLE_SOURCE = "サンプル帳簿"

/** How long before the first day a machine may have come out and still be played: older ones are not read from the catalog. */
const OLDEST_MACHINE_DAYS = 365

/** Machines read from the catalog at once. */
const READ_AT_ONCE = 6

const dayProblemOf = (problem: DayProblem): ApplicationError => (problem.type === "tally" ? { type: "tally", error: problem.error } : { type: "prize-exchange", problem: problem.problem })

const hereOf = async (locate: Locator): Promise<Coordinates | undefined> => ((found) => (found.ok ? found.value : undefined))(await locate())

/** The catalog's machines of both games with a formula, out by the last day and not long before the first. */
const summariesOf = async (catalog: Catalog, from: IsoDate, through: IsoDate): Promise<Outcome<readonly MachineSummary[]>> => {
  const [pachinko, pachislot] = await Promise.all([catalog.search("", "pachinko"), catalog.search("", "pachislot")])
  const balls = fromCatalog(pachinko)
  if (!balls.ok) return balls
  const medals = fromCatalog(pachislot)
  if (!medals.ok) return medals
  return Ok([...balls.value, ...medals.value].filter((machine) => machine.formulaCount > 0 && machine.releasedOn <= through && daysBetween(machine.releasedOn, from) <= OLDEST_MACHINE_DAYS))
}

type Seated = { readonly gameKind: "pachinko"; readonly onSale: OnSale<Pachinko.Seat> } | { readonly gameKind: "pachislot"; readonly onSale: OnSale<Pachislot.Seat> }

/** A machine as a sample book sits at it: its first formula. None where it cannot be read or has no formula, or where a pachinko machine's border is under 16 (`seatsAt`). */
const seatedOf = async (catalog: Catalog, machine: MachineSummary): Promise<Seated | undefined> => {
  const onSale = {
    id: machine.id,
    name: bookNameOf(machine),
    releasedOn: machine.releasedOn,
  }
  if (machine.gameKind === "pachinko") {
    const entry = await loadEntry(catalog, machine.id, "pachinko")
    const figures = entry.ok ? entry.value.formulas[0]?.formula.figures : undefined
    return figures === undefined || !Pachinko.seatsAt(figures) ? undefined : { gameKind: "pachinko", onSale: { ...onSale, seat: { figures } } }
  }
  const entry = await loadEntry(catalog, machine.id, "pachislot")
  const levels = entry.ok ? entry.value.formulas[0]?.formula.figures : undefined
  return levels === undefined || !entry.ok
    ? undefined
    : {
        gameKind: "pachislot",
        onSale: {
          ...onSale,
          seat: { levels },
        },
      }
}

/** Every machine read, a few at a time, each read told. */
const lineupOf = async (catalog: Catalog, machines: readonly MachineSummary[], watch: SampleWatch): Promise<Lineup> => {
  const read = async (from: number, seated: readonly Seated[]): Promise<readonly Seated[]> => {
    if (from >= machines.length || watch.stopped.aborted) return seated
    const batch = await Promise.all(machines.slice(from, from + READ_AT_ONCE).map((machine) => seatedOf(catalog, machine)))
    watch.onReport({
      type: "gathering",
      done: Math.min(machines.length, from + READ_AT_ONCE),
      of: machines.length,
    })
    return read(from + READ_AT_ONCE, [...seated, ...batch.filter((found) => found !== undefined)])
  }
  const seated = await read(0, [])
  return {
    pachinko: seated.flatMap((found) => (found.gameKind === "pachinko" ? [found.onSale] : [])),
    pachislot: seated.flatMap((found) => (found.gameKind === "pachislot" ? [found.onSale] : [])),
  }
}

const yearsOf = (entries: readonly Entry[]): readonly (readonly Entry[])[] =>
  [...new Set(entries.map((entry) => entry.date.slice(0, 4)))].map((year) => entries.filter((entry) => entry.date.startsWith(year)))

/** One year's entries written as one commit, the book's parlors and their rates with the first; the year's entries are laid after the book's at once, as they would be one at a time. */
const writeYear = (session: BookSession, bookId: BookId, order: SampleWork, entries: readonly Entry[], first: boolean): Promise<Outcome<unknown>> =>
  session.write(bookId, async (_, stored) => {
    const opening = openingOf(order)
    const files = first
      ? {
          ...stored.files,
          [BOOK_FILES.accounts]: `${(stored.files[BOOK_FILES.accounts] ?? "").replace(/\n*$/, "\n")}${opening.declarations}`,
          [BOOK_FILES.prices]: `${stored.files[BOOK_FILES.prices] ?? ""}${opening.prices}`,
        }
      : stored.files
    return Ok<ProposedChange>({
      files: withEntriesFiled(
        entries.reduce(withAccountsFor, files),
        entries.map((entry) => ({ date: entry.date, text: renderEntry(entry) })),
      ),
      intent: {
        type: "plays-imported",
        from: SAMPLE_SOURCE,
        count: entries.length,
      },
    })
  })

const writeYears = async (ports: SamplePorts, bookId: BookId, order: SampleWork, years: readonly (readonly Entry[])[], watch: SampleWatch, done: number): Promise<Outcome<void>> => {
  const year = years[done]
  if (year === undefined) return Ok(undefined)
  watch.onReport({ type: "writing", done, of: years.length })
  const written = await writeYear(ports.session, bookId, order, year, done === 0)
  if (!written.ok) return written
  return writeYears(ports, bookId, order, years, watch, done + 1)
}

/**
 * Make a sample book: three years of plays at eight or nine parlors near
 * where the device is, at the machines out on each day, newest likeliest,
 * written as a book of the person's own beside the others — so a person
 * who has kept nothing yet sees what keeping comes to. The days are played
 * away from the screen, by the maker, and every one before anything is written, so a person who stops it is left with
 * nothing; then the book is made, and its years written one commit each,
 * each tried in hledger first. A book any of whose years is refused is
 * deleted again: half a sample is no sample.
 */
export const makeSampleBook = async (ports: SamplePorts, request: SampleRequest, watch: SampleWatch): Promise<Outcome<Result<SampleEnd, SampleProblem>>> => {
  const from = threeYearsTo(request.through)
  watch.onReport({ type: "locating" })
  await watch.pause()
  if (watch.stopped.aborted) return CANCELLED
  const here = await hereOf(ports.locate)
  const listed = fromDirectory(await ports.parlors.list())
  if (!listed.ok) return listed
  const [{ prefecture, parlors }] = sampleParlorsOf(listed.value.parlors, here, from, request.through, drawsFrom(`${request.seed}:parlors`))
  if (parlors.length === 0) return Ok(Err({ type: "no-parlors" }))
  watch.onReport({ type: "placed", located: here !== undefined, prefecture, parlors: parlors.length })
  await watch.pause()
  if (watch.stopped.aborted) return CANCELLED
  const summaries = await summariesOf(ports.catalog, from, request.through)
  if (!summaries.ok) return summaries
  const lineup = await lineupOf(ports.catalog, summaries.value, watch)
  if (lineup.pachinko.length === 0 && lineup.pachislot.length === 0) return Ok(Err({ type: "no-machines" }))
  await watch.pause()
  if (watch.stopped.aborted) return CANCELLED
  const order: SampleWork = { from, through: request.through, parlors, lineup, seed: request.seed }
  watch.onReport({ type: "starting" })
  const played = await ports.maker.play(order, {
    onDay: (made) => watch.onReport({ type: "making", done: made.done, of: made.of, day: made.day, result: made.tallied.result, theoreticalValue: made.tallied.theoreticalValue }),
    stopped: watch.stopped,
  })
  if (!played.ok) return played.error.type === "day" ? Err(dayProblemOf(played.error.problem)) : Ok(Err({ type: "unreachable" }))
  if (played.value === undefined || watch.stopped.aborted) return CANCELLED
  const added = await addBook(ports.session, request.fresh, request.title, request.businessDayTurn)
  if (!added.ok) return added
  if (!added.value.ok) return Ok(Err({ type: "title", problem: added.value.error }))
  const bookId = added.value.value
  const written = await writeYears(ports, bookId, order, yearsOf(played.value.entries), watch, 0)
  if (!written.ok) {
    await deleteBook(ports.deletion, bookId)
    return written
  }
  return Ok(
    Ok({
      type: "made",
      bookId,
      days: played.value.tallied.days,
      tallies: played.value.tallied.tallies,
      result: played.value.tallied.result,
      theoreticalValue: played.value.tallied.theoreticalValue,
    }),
  )
}
