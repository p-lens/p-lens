import type { Catalog } from "../catalog/port/catalog"
import type { BookId } from "../core/book/book"
import { bookNameOf, type MachineSummary } from "../core/catalog/catalog"
import { machineKeyOf } from "../core/catalog/description"
import { PRECORD, readPrecord } from "../core/import/precord"
import { withAccountsFor } from "./record-tally"
import { importedIdsOf, importedTallyEntry, type ImportedTally, type MatchedMachine, type SourceTally } from "../core/import/source-tally"
import { withTallyEntriesRewritten } from "../core/tally/in-journal"
import { TALLY_TAGS, type InferredWorth } from "../core/tally/tally"
import { renderEntry } from "../core/journal/entry"
import { withEntriesFiled, yearFileOf } from "../core/journal/filing"
import type { PlayGameKind, PlayId } from "../core/play/play"
import { Err, Ok, andThen, mapOk } from "../core/result/result"
import { tallyHeadsRequest } from "../hledger/query/requests"
import type { EntryHead } from "../hledger/protocol/wire"
import { toPlainString } from "../core/decimal/decimal"
import * as Pachinko from "../core/pachinko"
import { TRIALS_BY_HAND, TRIALS_ON_IMPORT, type Verdict } from "../core/pachinko/inference"
import type * as PachinkoEngine from "../pachinko-engine/client/client"
import type { Preferences } from "../preferences/port/preferences"
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
 * How far taking a file in has got, where its tallies are weighed: the
 * tallies written — those new to the book, before any is weighed — and
 * those of the book already; so many of those that can be weighed done,
 * and whether the one now being weighed is being played out again, many
 * more times, the usual trials not having been enough; and so many of
 * them written with what each was worth.
 */
export type ImportReport =
  | { readonly type: "written"; readonly written: number; readonly alreadyHere: number }
  | { readonly type: "weighing"; readonly done: number; readonly of: number; readonly beyond: boolean }
  | { readonly type: "kept"; readonly inferred: number }

/**
 * Weighing the tallies taken in for what each was worth, where a person
 * asked for it: the engine their machines are played out by, whoever is
 * told how far it has got, and the person stopping it — by a press, or by
 * leaving the screen — which ends the tally being weighed at once and
 * keeps those weighed before it; and where the device keeps the tallies
 * weighed and not written with what they were worth, which the same file
 * taken in again leaves as they are: weighed again from the same seed they
 * would come to the same.
 */
export interface Weighing {
  readonly engine: PachinkoEngine.EngineClient
  readonly onReport: (report: ImportReport) => void
  readonly stopped: AbortSignal
  readonly weighedBefore: Pick<Preferences, "weighedUnwritten" | "addWeighedUnwritten">
}

/**
 * What taking a file in came to: the tallies written, those of them given
 * an inferred theoretical value, those that were weighed and could not be
 * read, those weighed whose entry no longer read as the file gives it and
 * so was left as it is, those the book already had from an earlier taking
 * in of the same file, and those left unweighed because the person stopped
 * the weighing — which the same file taken in again weighs.
 */
export interface Imported {
  readonly written: number
  readonly inferred: number
  readonly unread: number
  readonly changed: number
  readonly alreadyHere: number
  readonly left: number
}

const GAME_KINDS: readonly PlayGameKind[] = ["pachinko", "pachislot"]

/** The catalog's machines of both games, and each by every writing it alone goes by. */
export interface Catalogue {
  readonly machines: readonly MachineSummary[]
  readonly byKey: ReadonlyMap<string, MachineSummary>
}

/** What a machine goes by, as a search compares text: its name and the words it is searched by — widths, case, kana, spaces and stars aside. */
const keysOf = (machine: MachineSummary): readonly string[] => [...new Set([machine.name, ...machine.keywords].map(machineKeyOf))].filter((key) => key !== "")

/** How many times each of some values comes, in the order each first came. */
const countsOf = (values: readonly string[]): ReadonlyMap<string, number> => values.reduce((counted, value) => counted.set(value, (counted.get(value) ?? 0) + 1), new Map<string, number>())

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
      const counts = countsOf(claims.map(([key]) => key))
      return { machines, byKey: new Map(claims.filter(([key]) => counts.get(key) === 1)) }
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

type Ready = Candidate & { readonly weighable: Weighable }

/**
 * A tally's verdict at the trials a file's tallies are given — and, where too
 * few of those came near it to say, at as many as a tally typed in by hand
 * is given: a tally is not left unread for want of trials alone.
 */
const verdictAt = async (weighing: Weighing, candidate: Ready, onBeyond: () => void): Promise<Verdict | undefined> => {
  const on = (trials: number): Promise<Verdict | undefined> => verdictOn(weighing.engine, candidate.weighable, candidate.told, Pachinko.TERMS_BY_DEFAULT, candidate.tally.id, trials, weighing.stopped)
  const first = await on(TRIALS_ON_IMPORT)
  if (first?.type !== "vague" || first.why !== "few-near" || weighing.stopped.aborted) return first
  onBeyond()
  return on(TRIALS_BY_HAND)
}

/** What a batch of tallies weighed came to: what each that was read was worth, how many were weighed — the person may have stopped it before the last — how many of those could not be read, and those of them whose weighing came to a verdict that was not read, which weighing again would come to as well — not those the engine failed on. */
interface Batch {
  readonly worth: readonly (readonly [ImportedTally, InferredWorth])[]
  readonly done: number
  readonly unread: number
  readonly settled: readonly PlayId[]
}

/**
 * A batch of the tallies that can be weighed, one after another, each from
 * the seed its id gives, on the terms a tally is weighed on until a person
 * says otherwise. A tally that could not be read — out of the ordinary, or
 * telling too little — is counted, and stays as it was written. Stopped,
 * it ends where it is: the tally under way is not counted.
 */
const weighedBatch = async (weighing: Weighing, batch: readonly Ready[], before: number, of: number): Promise<Batch> => {
  const held: { worth: (readonly [ImportedTally, InferredWorth])[]; done: number; unread: number; settled: PlayId[] } = { worth: [], done: 0, unread: 0, settled: [] }
  for (const candidate of batch) {
    if (weighing.stopped.aborted) break
    const verdict = await verdictAt(weighing, candidate, () => weighing.onReport({ type: "weighing", done: before + held.done, of, beyond: true }))
    if (weighing.stopped.aborted) break
    held.done += 1
    if (verdict?.type === "weighed") held.worth.push([candidate.tally, Pachinko.inferredWorthOf(verdict.weighed, candidate.weighable.formula.id, Pachinko.TERMS_BY_DEFAULT)])
    else held.unread += 1
    if (verdict !== undefined && verdict.type !== "weighed") held.settled.push(candidate.tally.id)
    weighing.onReport({ type: "weighing", done: before + held.done, of, beyond: false })
  }
  return held
}

/**
 * Tallies taken in, written anew with what each was worth, as one commit:
 * each where it stands and only where it still reads as it was taken in —
 * one changed since is left as it is. The tallies so written; none, and
 * nothing written, where every one had changed.
 */
const keptWorth = async (ports: ImportPorts, bookId: BookId, from: string, worth: Batch["worth"]): Promise<Outcome<readonly PlayId[]>> => {
  const rewrites = new Map(worth.map(([tally, inferred]) => [tally.id, { was: renderEntry(importedTallyEntry(tally)), now: renderEntry(importedTallyEntry({ ...tally, inferred })) }] as const))
  const paths = [...new Set(worth.map(([tally]) => yearFileOf(tally.source.date)))]
  const counted: { rewritten: readonly PlayId[] } = { rewritten: [] }
  const kept = await ports.session.write(bookId, async (_journal, stored) => {
    const weighedEntries = worth.map(([tally, inferred]) => importedTallyEntry({ ...tally, inferred }))
    const rewritten = paths.reduce(
      (built, path) => ((done) => ({ files: { ...built.files, [path]: done.text }, ids: [...built.ids, ...done.rewritten] }))(withTallyEntriesRewritten(built.files[path] ?? "", rewrites)),
      { files: weighedEntries.reduce(withAccountsFor, stored.files), ids: [] as readonly PlayId[] },
    )
    counted.rewritten = rewritten.ids
    return rewritten.ids.length === 0 ? Err({ type: "tally-missing" }) : Ok({ files: rewritten.files, intent: { type: "imported-weighed", from, count: rewritten.ids.length } })
  })
  if (!kept.ok) return kept.error.type === "tally-missing" ? Ok([]) : kept
  return Ok(counted.rewritten)
}

/**
 * How many tallies a batch of weighing holds: each batch is one commit and
 * one trial of the whole book in hledger, a second or so in a large book,
 * against a tenth of a second to half a second a tally is weighed in — so
 * a batch is written every half a minute to a few minutes, for a few
 * hundredths of the time.
 */
const BATCH = 300

/** What weighing tallies already written came to: those written with their worth, those weighed and not read, those weighed whose entry had changed, and those the person stopped it before. */
interface Weighed {
  readonly inferred: number
  readonly unread: number
  readonly changed: number
  readonly left: number
}

/**
 * Weigh tallies already written, a batch at a time, each batch written as
 * soon as it is weighed: stopping loses nothing weighed, and the book is
 * whole after every batch — some of its tallies weighed and the rest as
 * they were taken in, which is what 出さずに取り込む writes. Those weighed
 * and not written with their worth, for a verdict not read or an entry
 * changed, are kept on the device with each batch.
 */
const weighedAfter = async (ports: ImportPorts, bookId: BookId, from: string, candidates: readonly Candidate[], weighing: Weighing): Promise<Outcome<Weighed>> => {
  const weighables = await weighablesOf(ports.catalog, candidates.map((candidate) => candidate.machineId))
  const ready = candidates.flatMap((candidate) => ((weighable) => (weighable === undefined ? [] : [{ ...candidate, weighable }]))(weighables.get(candidate.machineId)))
  weighing.onReport({ type: "weighing", done: 0, of: ready.length, beyond: false })
  const held: { inferred: number; unread: number; changed: number; done: number } = { inferred: 0, unread: 0, changed: 0, done: 0 }
  for (let start = 0; start < ready.length && !weighing.stopped.aborted; start += BATCH) {
    const batch = await weighedBatch(weighing, ready.slice(start, start + BATCH), start, ready.length)
    held.done += batch.done
    held.unread += batch.unread
    const kept = batch.worth.length === 0 ? Ok([]) : await keptWorth(ports, bookId, from, batch.worth)
    if (!kept.ok) return kept
    const changed = batch.worth.map(([tally]) => tally.id).filter((id) => !kept.value.includes(id))
    weighing.weighedBefore.addWeighedUnwritten(bookId, [...batch.settled, ...changed])
    held.inferred += kept.value.length
    held.changed += changed.length
    if (kept.value.length > 0) weighing.onReport({ type: "kept", inferred: held.inferred })
  }
  return Ok({ inferred: held.inferred, unread: held.unread, changed: held.changed, left: ready.length - held.done })
}

const oldestFirst = (tallies: readonly ImportedTally[]): readonly ImportedTally[] => tallies.toSorted((left, right) => left.source.date.localeCompare(right.source.date))

/** The tallies a book holds, by id, each with whether it was given what it was worth: read off their heads, their tags alone. */
const heldOf = (heads: readonly EntryHead[]): ReadonlyMap<PlayId, boolean> =>
  new Map(heads.flatMap((head) => ((id) => (id === undefined || id === "" ? [] : [[id as PlayId, head.ttags.some(([tag]) => tag === TALLY_TAGS.inferredFormula)] as const]))(head.ttags.find(([tag]) => tag === TALLY_TAGS.playId)?.[1])))

/**
 * Write a source's tallies into a book as one commit, oldest first after
 * what the book holds, each under an id that the same tally always gets —
 * so a file taken in twice writes nothing the second time — and then, where
 * a person asked, weigh those that can be weighed, a batch a commit. A
 * tally whose machine's name is one the catalog's machine goes by, or one a
 * person said is a machine of the catalog, is tied to it; every other name
 * is kept as the source wrote it, in tags of its own. A file taken in
 * before whose weighing was stopped writes nothing new, and its weighing
 * goes on from the tallies still unweighed — not those weighed before and
 * not written with their worth, which would come to the same again.
 */
const importTallies = async (ports: ImportPorts, bookId: BookId, from: string, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Outcome<Imported>> => {
  const machineOf = (name: string): MachineSummary | undefined => machineFor(preview.catalogue, named, name)
  const ids = importedIdsOf(from, preview.sources)
  const tallies = preview.sources.map((source, index): ImportedTally => ({ id: ids[index] as PlayId, from, source, machine: ((machine) => (machine === undefined ? undefined : matchedOf(machine)))(machineOf(source.machine.name)), inferred: undefined }))
  const counted: { held: ReadonlyMap<PlayId, boolean> } = { held: new Map() }
  const kept = await ports.session.write(bookId, async (journal, stored) =>
    andThen(fromHledger(await journal.ask(tallyHeadsRequest(""))), (page): Outcome<ProposedChange> => {
      counted.held = heldOf(page.items)
      const fresh = oldestFirst(tallies.filter((tally) => !counted.held.has(tally.id)))
      return fresh.length === 0
        ? Err({ type: "import", problem: { type: "nothing-new", count: tallies.length } })
        : Ok({
            files: ((entries) => withEntriesFiled(entries.reduce(withAccountsFor, stored.files), entries.map((entry) => ({ date: entry.date, text: renderEntry(entry) }))))(fresh.map(importedTallyEntry)),
            intent: { type: "plays-imported", from, count: fresh.length },
          })
    }),
  )
  const alreadyHere = tallies.filter((tally) => counted.held.has(tally.id)).length
  const weighedBefore = weighing?.weighedBefore.weighedUnwritten(bookId) ?? new Set<PlayId>()
  const unweighed = weighing === undefined ? [] : tallies.filter((tally) => counted.held.get(tally.id) !== true && !weighedBefore.has(tally.id)).flatMap((tally) => candidateOf(tally, machineOf(tally.source.machine.name)?.id))
  const resumed = !kept.ok && kept.error.type === "import" && kept.error.problem.type === "nothing-new" && unweighed.length > 0
  if (!kept.ok && !resumed) return kept
  const written = tallies.length - alreadyHere
  if (weighing === undefined) return Ok({ written, inferred: 0, unread: 0, changed: 0, alreadyHere, left: 0 })
  weighing.onReport({ type: "written", written, alreadyHere })
  return mapOk(await weighedAfter(ports, bookId, from, unweighed, weighing), (weighed) => ({ written, alreadyHere, ...weighed }))
}

/**
 * Take the tallies of a pRecord file into a book, as it was looked at: the
 * file is not read again, nor the catalog asked again.
 */
export const importPrecord = (ports: ImportPorts, bookId: BookId, preview: Preview, named: Named, weighing: Weighing | undefined): Promise<Outcome<Imported>> =>
  importTallies(ports, bookId, PRECORD, preview, named, weighing)

/** A machine's name as a source wrote it that no machine of the catalog alone goes by, and how many of the file's tallies are of it. */
export interface Unnamed {
  readonly name: string
  readonly tallies: number
}

/**
 * What a person is asked before a file is taken in: how many of its tallies
 * say how long they lasted — those they may ask to have weighed — and the
 * machines' names the catalog does not know, in the file's order, each for
 * them to say which machine it is, among the catalog's; and the file as it
 * was read and the catalog as it was looked at, which the taking in goes on.
 */
export interface Preview {
  readonly told: number
  readonly unnamed: readonly Unnamed[]
  readonly machines: readonly MachineSummary[]
  readonly sources: readonly SourceTally[]
  readonly catalogue: Catalogue
}

/**
 * A pRecord file looked at before it is taken in; why it is not taken in,
 * where it does not read. Nothing of a file is taken in while any row of it
 * does not read: half a history is worse than none, and the rows that do
 * not read are said by their lines.
 */
export const previewPrecord = async (ports: Pick<ImportPorts, "catalog">, text: string): Promise<Outcome<Preview>> => {
  const sources = readPrecord(text)
  if (!sources.ok) return Err({ type: "import", problem: sources.error })
  return mapOk(await catalogueOf(ports.catalog), (catalogue) => ({
    told: sources.value.filter((source) => source.hours !== undefined).length,
    unnamed: [...countsOf(sources.value.map((source) => source.machine.name).filter((name) => name !== "" && machineFor(catalogue, new Map(), name) === undefined))].map(([name, tallies]) => ({ name, tallies })),
    machines: catalogue.machines,
    sources: sources.value,
    catalogue,
  }))
}
