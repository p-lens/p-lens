import type { Catalog } from "../catalog/port/catalog"
import type { BookId } from "../core/book/book"
import { bookNameOf } from "../core/catalog/catalog"
import { broughtIn, nameProblems, type KnownNames, type NameProblem } from "../core/names/known"
import { identityKey, parlorsFromDeclarations, type ParlorId } from "../core/parlor/parlor"
import type { PlayGameKind } from "../core/play/play"
import { cashRaisedBy, cashRaisedIn, type CashRaised } from "../core/report/cash-raised"
import { playSummariesOf } from "../core/report/plays"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import type { JournalAccess } from "../hledger/client/client"
import { accountsRequest, cashEntriesRequest, playsRequest } from "../hledger/query/requests"
import type { CommitId } from "../history/port/history-port"
import type { ParlorDirectory } from "../parlors/port/parlor-directory"
import type { SubmissionStore } from "../parlors/port/submission-store"
import type { BookSession } from "./book-session"
import type { Outcome } from "./errors"
import { fromCatalog, fromDirectory, fromHledger } from "./lift"

/** Everything the names a book may hold are read from: the parlor list, this device's submissions, and the shared catalog as delivered. */
export interface NamePorts {
  readonly parlors: ParlorDirectory
  readonly submissions: SubmissionStore
  readonly catalog: Catalog
}

/** Every play of a book, however many: a name is checked wherever it stands. */
const EVERY_PLAY = { limit: 1_000_000, offset: 0 } as const

const CATALOG_GAMES = { pachinko: "pachinko", slot: "pachislot" } as const

const machinesOf = async (catalog: Catalog, gameKind: PlayGameKind): Promise<Outcome<ReadonlySet<string>>> =>
  mapOk(fromCatalog(await catalog.search("", CATALOG_GAMES[gameKind])), (machines) => new Set(machines.flatMap((machine) => [bookNameOf(machine), machine.name])))

/** The names a book may hold, as the lists stand on this device now. */
const knownNames = async (ports: NamePorts): Promise<Outcome<KnownNames>> => {
  const list = fromDirectory(await ports.parlors.list())
  if (!list.ok) return list
  const submissions = await ports.submissions.list()
  if (!submissions.ok) return Err({ type: "submissions", detail: submissions.error.detail })
  const [pachinko, slot] = await Promise.all([machinesOf(ports.catalog, "pachinko"), machinesOf(ports.catalog, "slot")])
  if (!pachinko.ok) return pachinko
  if (!slot.ok) return slot
  return Ok({
    parlors: new Map([
      ...list.value.parlors.map((parlor) => [identityKey({ type: "listed", id: parlor.id as string as ParlorId }), parlor.name] as const),
      ...submissions.value.map((kept) => [identityKey({ type: "submitted", submission: kept.submission }), kept.name] as const),
    ]),
    machines: { pachinko: pachinko.value, slot: slot.value },
  })
}

/** The names a journal holds that the lists do not have, as hledger reads it. */
const problemsIn = async (journal: JournalAccess, known: KnownNames): Promise<Outcome<readonly NameProblem[]>> => {
  const [accounts, plays] = await Promise.all([journal.ask(accountsRequest), journal.ask(playsRequest("", EVERY_PLAY))])
  return andThen(fromHledger(accounts), (declared) => mapOk(fromHledger(plays), (page) => nameProblems(parlorsFromDeclarations(declared), playSummariesOf(page.items), known)))
}

/** The postings in a journal that raise cash, as hledger reads it. */
const cashRaisedOf = async (journal: JournalAccess): Promise<Outcome<readonly CashRaised[]>> => mapOk(fromHledger(await journal.ask(cashEntriesRequest)), (page) => cashRaisedIn(page.items))

/** What a hand's edit may not bring into a book, as the book stands: names the lists lack, and cash that rose. */
interface Standing {
  readonly names: readonly NameProblem[]
  readonly cash: readonly CashRaised[]
}

const standingOf = async (journal: JournalAccess, known: KnownNames): Promise<Outcome<Standing>> => {
  const names = await problemsIn(journal, known)
  if (!names.ok) return names
  return mapOk(await cashRaisedOf(journal), (cash) => ({ names: names.value, cash }))
}

const refusalOf = (before: Standing, after: Standing): Outcome<void> => {
  const names = broughtIn(before.names, after.names)
  if (names.length > 0) return Err({ type: "unknown-names", problems: names })
  const cash = cashRaisedBy(before.cash, after.cash)
  return cash.length === 0 ? Ok(undefined) : Err({ type: "cash-raised", raised: cash })
}

/**
 * Put a file's text, typed by hand, in place of what the book has: one
 * change like any other, read by hledger before it is kept. A book's
 * parlors are the parlor list's and its machines the catalog's, so an edit
 * that brings in a parlor the list lacks, a listed parlor under another
 * name, or a machine the catalog has none of is refused, and says which.
 * A name the book already held is not the edit's doing and does not stop
 * it. Nor may a hand raise cash, which nothing the app writes does: an
 * edit that brings in a positive amount to `資産:現金` is refused, and one
 * the book already held — written before the rule — is left as it is.
 */
export const editFile = async (session: BookSession, ports: NamePorts, bookId: BookId, path: string, text: string): Promise<Outcome<CommitId>> => {
  const known = await knownNames(ports)
  if (!known.ok) return known
  return session.write(bookId, async (journal, stored) =>
    mapOk(await standingOf(journal, known.value), (before) => ({
      files: { ...stored.files, [path]: text },
      intent: { type: "file-edited" as const, path },
      accept: async (proposed: JournalAccess): Promise<Outcome<void>> => andThen(await standingOf(proposed, known.value), (after) => refusalOf(before, after)),
    })),
  )
}
