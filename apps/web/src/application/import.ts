import type { Catalog } from "../catalog/port/catalog"
import type { BookId } from "../core/book/book"
import { bookNameOf, type MachineSummary } from "../core/catalog/catalog"
import { machineKeyOf } from "../core/catalog/description"
import { PRECORD, readPrecord } from "../core/import/precord"
import { withAccountsFor } from "./record-tally"
import { importedIdsOf, importedTallyEntry, type ImportedTally, type MatchedMachine, type SourceTally } from "../core/import/source-tally"
import { renderEntry } from "../core/journal/entry"
import { withEntriesFiled } from "../core/journal/filing"
import type { PlayGameKind, PlayId } from "../core/play/play"
import { tallySummariesOf } from "../core/report/tallies"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import { talliesRequest } from "../hledger/query/requests"
import { toPlainString } from "../core/decimal/decimal"
import * as Pachinko from "../core/pachinko"
import { TRIALS_BY_HAND, TRIALS_ON_IMPORT, type Verdict } from "../core/pachinko/inference"
import type { InferredWorth } from "../core/tally/tally"
import type * as PachinkoEngine from "../pachinko-engine/client/client"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"
import { fromCatalog, fromHledger } from "./lift"
import { loadMachine } from "./pachinko/formulas"
import { takesCash, verdictOn, weighableOf, type Weighable } from "./pachinko/inference"

/** Everything taking tallies in from another app reaches: the book, and the catalog their machines are looked up in. */
export interface ImportPorts {
  readonly session: BookSession
  readonly catalog: Catalog
}

/**
 * Weighing the tallies taken in for what each was worth, where a person
 * asked for it: the engine their machines are played out by, and whoever
 * is told how far it has got — so many of the tallies that can be weighed,
 * and whether the one now being weighed is being played out again, many
 * more times, the usual trials not having been enough.
 */
export interface Weighing {
  readonly engine: PachinkoEngine.EngineClient
  readonly onWeighed: (done: number, of: number, beyond: boolean) => void
}

/** What taking a file in came to: the tallies written, those of them given an inferred theoretical value, those that were weighed and could not be read, and those the book already had from an earlier taking in of the same file. */
export interface Imported {
  readonly written: number
  readonly inferred: number
  readonly unread: number
  readonly alreadyHere: number
}

const GAME_KINDS: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** The catalog's machines of both games, and each by every writing it alone goes by. */
interface Catalogue {
  readonly machines: readonly MachineSummary[]
  readonly byKey: ReadonlyMap<string, MachineSummary>
}

/** What a machine goes by, as a search compares text: its name and the words it is searched by — widths, case, kana, spaces and stars aside. */
const keysOf = (machine: MachineSummary): readonly string[] => [...new Set([machine.name, ...machine.keywords].map(machineKeyOf))].filter((key) => key !== "")

/**
 * The catalog's machines, each by what it goes by — its name and its
 * search words, as a search compares them, so one app's `e 東京喰種` is
 * the catalog's `e東京喰種` and a word a machine is searched by names it
 * as its name does. What two machines both go by, of one game or of two,
 * says nothing of which was played, and names neither.
 */
const catalogueOf = async (catalog: Catalog): Promise<Outcome<Catalogue>> => {
  const [pachinko, pachislot] = await Promise.all(GAME_KINDS.map((gameKind) => catalog.search("", gameKind)))
  if (pachinko === undefined || pachislot === undefined) return Ok({ machines: [], byKey: new Map() })
  return andThen(fromCatalog(pachinko), (balls) =>
    mapOk(fromCatalog(pachislot), (medals) => {
      const machines = [...balls, ...medals]
      const claims = machines.flatMap((machine) => keysOf(machine).map((key) => [key, machine] as const))
      return { machines, byKey: new Map(claims.filter(([key]) => claims.filter(([other]) => other === key).length === 1)) }
    }),
  )
}

const matchedOf = (machine: MachineSummary): MatchedMachine => ({ name: bookNameOf(machine), gameKind: machine.gameKind === "pachinko" ? "pachinko" : "pachislot" })

/** The machines a person said a source's names are, by the name as the source wrote it: each a machine of the catalog, by its id. */
export type Named = ReadonlyMap<string, string>

/** The catalog's machine a source's name is: the one a person said it is, or else the one that alone goes by it. */
const machineFor = (catalogue: Catalogue, named: Named, name: string): MachineSummary | undefined =>
  ((chosen) => (chosen === undefined ? catalogue.byKey.get(machineKeyOf(name)) : catalogue.machines.find((machine) => machine.id === chosen)))(named.get(name))

/** A tally that can be weighed: a pachinko tally of a machine the catalog has, whose hours the source said, that took cash. */
interface Candidate {
  readonly tally: ImportedTally
  readonly machineId: string
  readonly told: Pachinko.Told
}

const candidateOf = (tally: ImportedTally, machineId: string | undefined): readonly Candidate[] => {
  if (tally.machine?.gameKind !== "pachinko" || machineId === undefined || tally.source.hours === undefined) return []
  const told = { hours: Number(toPlainString(tally.source.hours)), outlay: Number(toPlainString(tally.source.outlay)), takings: Number(toPlainString(tally.source.takings)), jackpots: undefined }
  return takesCash(told) ? [{ tally, machineId, told }] : []
}

/** The formula each machine is weighed by, each machine looked up once: none where it has no formula made from a basis, or could not be read. */
const weighablesOf = async (catalog: Catalog, machineIds: readonly string[]): Promise<ReadonlyMap<string, Weighable>> => {
  const found = await Promise.all([...new Set(machineIds)].map(async (id) => [id, ((machine) => (machine.ok ? weighableOf(machine.value) : undefined))(await loadMachine(catalog, id))] as const))
  return new Map(found.flatMap(([id, weighable]) => (weighable === undefined ? [] : [[id, weighable] as const])))
}

/** What weighing a file's tallies came to: what each that was read was worth, by id, and how many were weighed and could not be read. */
interface Weighed {
  readonly worth: ReadonlyMap<PlayId, InferredWorth>
  readonly unread: number
}

const NONE_WEIGHED: Weighed = { worth: new Map(), unread: 0 }

/**
 * A tally's verdict at the trials a file's tallies are given — and, where too
 * few of those came near it to say, at as many as a tally typed in by hand
 * is given: a tally is not left unread for want of trials alone.
 */
const verdictAt = async (weighing: Weighing, candidate: Candidate & { readonly weighable: Weighable }, onBeyond: () => void): Promise<Verdict | undefined> => {
  const on = (trials: number): Promise<Verdict | undefined> => verdictOn(weighing.engine, candidate.weighable, candidate.told, Pachinko.TERMS_BY_DEFAULT, candidate.tally.id, trials)
  const first = await on(TRIALS_ON_IMPORT)
  if (first?.type !== "vague" || first.why !== "few-near") return first
  onBeyond()
  return on(TRIALS_BY_HAND)
}

/**
 * What each of the tallies that can be weighed was worth, by id: one after
 * another, each from the seed its id gives, on the terms a tally is weighed
 * on until a person says otherwise. A tally that could not be read — out
 * of the ordinary, or telling too little — is counted, and is taken in as
 * it would have been.
 */
const weighedAmong = async (catalog: Catalog, weighing: Weighing, tallies: readonly ImportedTally[], machineIdOf: (name: string) => string | undefined): Promise<Weighed> => {
  const candidates = tallies.flatMap((tally) => candidateOf(tally, machineIdOf(tally.source.machine.name)))
  const weighables = await weighablesOf(catalog, candidates.map((candidate) => candidate.machineId))
  const ready = candidates.flatMap((candidate) => ((weighable) => (weighable === undefined ? [] : [{ ...candidate, weighable }]))(weighables.get(candidate.machineId)))
  weighing.onWeighed(0, ready.length, false)
  const next = async (index: number, found: readonly (readonly [PlayId, InferredWorth])[]): Promise<readonly (readonly [PlayId, InferredWorth])[]> => {
    const candidate = ready[index]
    if (candidate === undefined) return found
    const verdict = await verdictAt(weighing, candidate, () => weighing.onWeighed(index, ready.length, true))
    weighing.onWeighed(index + 1, ready.length, false)
    return next(index + 1, verdict?.type === "weighed" ? [...found, [candidate.tally.id, Pachinko.inferredWorthOf(verdict.weighed, candidate.weighable.formula.id, Pachinko.TERMS_BY_DEFAULT)]] : found)
  }
  const worth = new Map(await next(0, []))
  return { worth, unread: ready.length - worth.size }
}

/** Every tally of a book, however many: an id is looked for wherever it stands. */
const EVERY_TALLY = { limit: 1_000_000, offset: 0 } as const

const oldestFirst = (tallies: readonly ImportedTally[]): readonly ImportedTally[] => tallies.toSorted((left, right) => left.source.date.localeCompare(right.source.date))

/**
 * Write a source's tallies into a book as one commit, oldest first after
 * what the book holds, each under an id that the same tally always gets —
 * so a file taken in twice writes nothing the second time. A tally whose
 * machine's name is one the catalog's machine goes by, or one a person
 * said is a machine of the catalog, is tied to it; every other name is
 * kept as the source wrote it, in tags of its own.
 */
const importTallies = async (ports: ImportPorts, bookId: BookId, from: string, sources: readonly SourceTally[], named: Named, weighing: Weighing | undefined): Promise<Outcome<Imported>> => {
  const catalogue = await catalogueOf(ports.catalog)
  if (!catalogue.ok) return catalogue
  const machineOf = (name: string): MachineSummary | undefined => machineFor(catalogue.value, named, name)
  const ids = importedIdsOf(from, sources)
  const read = sources.map((source, index): ImportedTally => ({ id: ids[index] as PlayId, from, source, machine: ((machine) => (machine === undefined ? undefined : matchedOf(machine)))(machineOf(source.machine.name)), inferred: undefined }))
  const held = await ports.session.read(bookId, async (journal) => mapOk(fromHledger(await journal.ask(talliesRequest("", EVERY_TALLY))), (page) => new Set(tallySummariesOf(page.items).map((tally) => tally.id))))
  if (!held.ok) return held
  const weighed = weighing === undefined ? NONE_WEIGHED : await weighedAmong(ports.catalog, weighing, read.filter((tally) => !held.value.has(tally.id)), (name) => machineOf(name)?.id)
  const tallies = read.map((tally) => ({ ...tally, inferred: weighed.worth.get(tally.id) }))
  const counted: { written: number; inferred: number } = { written: 0, inferred: 0 }
  const kept = await ports.session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(talliesRequest("", EVERY_TALLY))), (page): Outcome<ProposedChange> => {
      const here = new Set(tallySummariesOf(page.items).map((tally) => tally.id))
      const fresh = oldestFirst(tallies.filter((tally) => !here.has(tally.id)))
      counted.written = fresh.length
      counted.inferred = fresh.filter((tally) => tally.inferred !== undefined).length
      return fresh.length === 0
        ? Err({ type: "import", problem: { type: "nothing-new", count: tallies.length } })
        : Ok({
            files: ((entries) => withEntriesFiled(entries.reduce(withAccountsFor, stored.files), entries.map((entry) => ({ date: entry.date, text: renderEntry(entry) }))))(fresh.map(importedTallyEntry)),
            intent: { type: "plays-imported", from, count: fresh.length },
          })
    }),
  )
  return mapOk(kept, () => ({ written: counted.written, inferred: counted.inferred, unread: weighed.unread, alreadyHere: tallies.length - counted.written }))
}

/**
 * Take the tallies of a pRecord CSV into a book. Nothing of a file is taken
 * in while any row of it does not read: half a history is worse than none,
 * and the rows that do not read are said by their lines.
 */
export const importPrecord = async (ports: ImportPorts, bookId: BookId, text: string, named: Named, weighing: Weighing | undefined): Promise<Outcome<Imported>> => {
  const sources = readPrecord(text)
  return sources.ok ? importTallies(ports, bookId, PRECORD, sources.value, named, weighing) : Err({ type: "import", problem: sources.error })
}

/** A machine's name as a source wrote it that no machine of the catalog alone goes by, and how many of the file's tallies are of it. */
export interface Unnamed {
  readonly name: string
  readonly tallies: number
}

/**
 * What a person is asked before a file is taken in: how many of its tallies
 * say how long they lasted — those they may ask to have weighed — and the
 * machines' names the catalog does not know, in the file's order, each for
 * them to say which machine it is, among the catalog's.
 */
export interface Preview {
  readonly told: number
  readonly unnamed: readonly Unnamed[]
  readonly machines: readonly MachineSummary[]
}

/** A pRecord file looked at before it is taken in; why it is not taken in, where it does not read. */
export const previewPrecord = async (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Outcome<Preview>> => {
  const sources = readPrecord(text)
  if (!sources.ok) return Err({ type: "import", problem: sources.error })
  return mapOk(await catalogueOf(ports.catalog), (catalogue) => {
    const names = sources.value.map((source) => source.machine.name).filter((name) => name !== "" && machineFor(catalogue, new Map(), name) === undefined)
    return {
      told: sources.value.filter((source) => source.hours !== undefined).length,
      unnamed: [...new Set(names)].map((name) => ({ name, tallies: names.filter((each) => each === name).length })),
      machines: catalogue.machines,
    }
  })
}
