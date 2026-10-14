import { identityKey, type Parlor } from "../parlor/parlor"
import type { PlayGameKind } from "../play/play"
import type { TallySummary } from "../report/tallies"

/**
 * The names a book may hold: each parlor's, by who it is — the parlor
 * list's own and this device's submissions — and each game's machines as
 * the shared catalog names them. A book keeps no parlor and no machine
 * under a name of its own making: what the list or the catalog lacks is
 * added there first.
 */
export interface KnownNames {
  /** A parlor's name, by its identity's key. */
  readonly parlors: ReadonlyMap<string, string>
  readonly machines: Readonly<Record<PlayGameKind, ReadonlySet<string>>>
}

/**
 * A name in a book that the lists do not have.
 *
 * - `parlor-unlisted`: a parlor neither the list nor this device's submissions know.
 * - `parlor-misnamed`: a listed parlor kept under another name than its own.
 * - `machine-uncatalogued`: a tally's machine the catalog has none of, for its game.
 */
export type NameProblem =
  | { readonly type: "parlor-unlisted"; readonly name: string }
  | { readonly type: "parlor-misnamed"; readonly name: string; readonly listed: string }
  | { readonly type: "machine-uncatalogued"; readonly name: string; readonly gameKind: PlayGameKind }

const parlorProblem = (parlor: Parlor, known: KnownNames): NameProblem | undefined => {
  const listed = known.parlors.get(identityKey(parlor.identity))
  if (listed === undefined) return { type: "parlor-unlisted", name: parlor.name }
  return listed === parlor.name ? undefined : { type: "parlor-misnamed", name: parlor.name, listed }
}

const machineProblem = (tally: TallySummary, known: KnownNames): NameProblem | undefined => {
  const machine = tally.machine?.trim() ?? ""
  if (machine === "" || tally.gameKind === undefined) return undefined
  return known.machines[tally.gameKind].has(machine) ? undefined : { type: "machine-uncatalogued", name: machine, gameKind: tally.gameKind }
}

const keyOf = (problem: NameProblem): string => JSON.stringify(problem)

/** Every name a book's parlors and tallies hold that the lists do not have, each once. */
export const nameProblems = (parlors: readonly Parlor[], tallies: readonly TallySummary[], known: KnownNames): readonly NameProblem[] => {
  const found = [...parlors.map((parlor) => parlorProblem(parlor, known)), ...tallies.map((tally) => machineProblem(tally, known))].filter((problem): problem is NameProblem => problem !== undefined)
  return found.filter((problem, index) => found.findIndex((other) => keyOf(other) === keyOf(problem)) === index)
}

/**
 * The problems a change brings in: those the book has after it and had not
 * before. A name a book already held — from before the lists were what a
 * book is held to — is not the change's doing, and does not stop it.
 */
export const broughtIn = (before: readonly NameProblem[], after: readonly NameProblem[]): readonly NameProblem[] => after.filter((problem) => !before.some((had) => keyOf(had) === keyOf(problem)))
