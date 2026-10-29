import { machineNamesOf, type CatalogTarget, type GameKind, type MachineEntry, type MachineNames, type MachineSummary } from "../core/catalog/catalog"
import { readDraft, writtenDraft, type FormulaDraft, type KeptFormulaDraft } from "../core/catalog/draft"
import type { Quota } from "../core/catalog/quota"
import type { Mark } from "../core/formula/standing"
import { Err, Ok, mapOk } from "../core/result/result"
import type { Catalog } from "../catalog/port/catalog"
import type { Preferences } from "../preferences/port/preferences"
import type { Outcome } from "./errors"
import { fromCatalog } from "./lift"

/**
 * What a machine search comes to: machines found, none matching, or none
 * delivered at all — the last two say different things to the person.
 */
export type MachineFinding =
  | { readonly type: "found"; readonly machines: readonly MachineSummary[] }
  | { readonly type: "no-match" }
  | { readonly type: "none-registered" }

/** Machines of a game matching a query; an empty one lists them all, and finding none tells which kind of none it is. */
export const findMachines = async (catalog: Catalog, query: string, gameKind: GameKind): Promise<Outcome<MachineFinding>> => {
  const matched = fromCatalog(await catalog.search(query, gameKind))
  if (!matched.ok) return matched
  if (matched.value.length > 0) return Ok({ type: "found", machines: matched.value })
  if (query.trim() === "") return Ok({ type: "none-registered" })
  return mapOk(fromCatalog(await catalog.search("", gameKind)), (all): MachineFinding => (all.length === 0 ? { type: "none-registered" } : { type: "no-match" }))
}

const GAME_KINDS: readonly GameKind[] = ["pachinko", "pachislot"]

/** The machines of both games as delivered, by the name each goes into a book under; a game whose machines cannot be read gives none, and a book's machine is then shown as the book says it. */
export const loadMachineNames = async (catalog: Catalog): Promise<MachineNames> => {
  const found = await Promise.all(GAME_KINDS.map((gameKind) => catalog.search("", gameKind)))
  return machineNamesOf(found.flatMap((machines) => (machines.ok ? machines.value : [])))
}

/** A machine as the catalog holds it, only if it is of the game asked for. */
export const loadEntry = async <G extends GameKind>(catalog: Catalog, id: string, gameKind: G): Promise<Outcome<Extract<MachineEntry, { readonly gameKind: G }>>> => {
  const read = fromCatalog(await catalog.read(id))
  if (!read.ok) return read
  return read.value.gameKind === gameKind
    ? Ok(read.value as Extract<MachineEntry, { readonly gameKind: G }>)
    : Err({ type: "catalog", error: { type: "other-game", id, gameKind: read.value.gameKind } })
}

export const markTarget = async (catalog: Catalog, target: CatalogTarget, mark: Mark, on: boolean, voter: string): Promise<Outcome<void>> => fromCatalog(await catalog.mark(target, mark, on, voter))

export const recordUse = async (catalog: Catalog, target: CatalogTarget): Promise<Outcome<void>> => fromCatalog(await catalog.recordUse(target))

/** The formulas and 設定配分 whose marks put on here have not reached the shared catalog yet. */
export const loadUnsentMarks = async (catalog: Catalog): Promise<Outcome<ReadonlySet<string>>> => fromCatalog(await catalog.unsentMarks())

/** Whatever is waiting sent, and a new delivery taken if the shared catalog has moved on: whether it had. */
export const refreshCatalog = async (catalog: Catalog): Promise<Outcome<boolean>> => mapOk(fromCatalog(await catalog.refresh()), (done) => done.changed)

/** Where this device stands against the shared catalog's quotas on registering, before anything is typed. */
export const loadQuota = async (catalog: Catalog): Promise<Outcome<Quota>> => fromCatalog(await catalog.quota())

/** A formula the shared catalog did not take, kept so it is not typed twice: one a game, the last one refused. */
export const keepDraft = (preferences: Preferences, draft: FormulaDraft): void => preferences.setFormulaDraft(draft.formula.gameKind, writtenDraft(draft))

/** The formula of a game kept from the last time one could not be sent: none, it, or one kept that does not read. */
export const keptDraft = (preferences: Preferences, gameKind: GameKind): KeptFormulaDraft => readDraft(preferences.formulaDraft(gameKind), gameKind)

/** A game's draft let go of: it was sent, or the person threw it away. */
export const dropDraft = (preferences: Preferences, gameKind: GameKind): void => preferences.setFormulaDraft(gameKind, undefined)
