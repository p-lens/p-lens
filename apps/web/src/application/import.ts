import type { Catalog } from "../catalog/port/catalog"
import type { BookId } from "../core/book/book"
import { bookNameOf } from "../core/catalog/catalog"
import { PRECORD, readPrecord } from "../core/import/precord"
import { importedIdsOf, importedPlayEntry, type ImportedPlay, type MatchedMachine, type SourcePlay } from "../core/import/source-play"
import { renderEntry } from "../core/journal/entry"
import { appendEntry, BOOK_FILES } from "../core/journal/layout"
import type { PlayGameKind, PlayId } from "../core/play/play"
import { playSummariesOf } from "../core/report/plays"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import { playsRequest } from "../hledger/query/requests"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromCatalog, fromHledger } from "./lift"

/** Everything taking plays in from another app reaches: the book, and the catalog their machines are looked up in. */
export interface ImportPorts {
  readonly session: BookSession
  readonly catalog: Catalog
}

/** What taking a file in came to: the plays written, and those the book already had from an earlier taking in of the same file. */
export interface Imported {
  readonly written: number
  readonly alreadyHere: number
}

const CATALOG_GAMES = { pachinko: "pachinko", slot: "pachislot" } as const

const GAME_KINDS: readonly PlayGameKind[] = ["pachinko", "slot"]

/**
 * The catalog's machines by the name the halls call them, which is what a
 * source writes, each with its game and the name it goes into a book under
 * — those whose name is one game's alone. A name both games have says
 * nothing of which was played, and matches neither.
 */
const cataloguedMachines = async (catalog: Catalog): Promise<Outcome<ReadonlyMap<string, MatchedMachine>>> => {
  const [pachinko, slot] = await Promise.all(GAME_KINDS.map((gameKind) => catalog.search("", CATALOG_GAMES[gameKind])))
  if (pachinko === undefined || slot === undefined) return Ok(new Map())
  return andThen(fromCatalog(pachinko), (balls) =>
    mapOk(fromCatalog(slot), (medals) => {
      const [ballNames, medalNames] = [new Set(balls.map((machine) => machine.name)), new Set(medals.map((machine) => machine.name))]
      return new Map<string, MatchedMachine>([
        ...balls.filter((machine) => !medalNames.has(machine.name)).map((machine) => [machine.name, { name: bookNameOf(machine), gameKind: "pachinko" }] as const),
        ...medals.filter((machine) => !ballNames.has(machine.name)).map((machine) => [machine.name, { name: bookNameOf(machine), gameKind: "slot" }] as const),
      ])
    }),
  )
}

/** Every play of a book, however many: an id is looked for wherever it stands. */
const EVERY_PLAY = { limit: 1_000_000, offset: 0 } as const

const oldestFirst = (plays: readonly ImportedPlay[]): readonly ImportedPlay[] => plays.toSorted((left, right) => left.source.date.localeCompare(right.source.date))

/**
 * Write a source's plays into a book as one commit, oldest first after
 * what the book holds, each under an id that the same play always gets —
 * so a file taken in twice writes nothing the second time. A play whose
 * machine's name is the catalog's is tied to it; every other name is kept
 * as the source wrote it, in tags of its own.
 */
const importPlays = async (ports: ImportPorts, bookId: BookId, from: string, sources: readonly SourcePlay[]): Promise<Outcome<Imported>> => {
  const machines = await cataloguedMachines(ports.catalog)
  if (!machines.ok) return machines
  const ids = importedIdsOf(from, sources)
  const plays = sources.map((source, index): ImportedPlay => ({ id: ids[index] as PlayId, from, source, machine: machines.value.get(source.machine.name) }))
  const counted: { written: number } = { written: 0 }
  const kept = await ports.session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(playsRequest("", EVERY_PLAY))), (page): Outcome<ProposedChange> => {
      const here = new Set(playSummariesOf(page.items).map((play) => play.id))
      const fresh = oldestFirst(plays.filter((play) => !here.has(play.id)))
      counted.written = fresh.length
      return fresh.length === 0
        ? Err({ type: "import", problem: { type: "nothing-new", count: plays.length } })
        : Ok({
            files: { ...stored.files, [BOOK_FILES.transactions]: fresh.reduce((text, play) => appendEntry(text, renderEntry(importedPlayEntry(play))), stored.files[BOOK_FILES.transactions] ?? "") },
            intent: { type: "plays-imported", from, count: fresh.length },
          })
    }),
  )
  return mapOk(kept, () => ({ written: counted.written, alreadyHere: plays.length - counted.written }))
}

/**
 * Take the plays of a pRecord CSV into a book. Nothing of a file is taken
 * in while any row of it does not read: half a history is worse than none,
 * and the rows that do not read are said by their lines.
 */
export const importPrecord = async (ports: ImportPorts, bookId: BookId, text: string): Promise<Outcome<Imported>> => {
  const sources = readPrecord(text)
  return sources.ok ? importPlays(ports, bookId, PRECORD, sources.value) : Err({ type: "import", problem: sources.error })
}
