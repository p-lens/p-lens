import type { ProbabilityDto } from "@p-lens/contracts/pachinko"

import type { IsoDate } from "../calendar/calendar"
import type * as Pachinko from "../pachinko"
import type { MachineId } from "../machine/machine"
import type { FormulaListing } from "../formula/standing"
import { writableText } from "../journal/entry"
import type * as Pachislot from "../pachislot"
import type { PlayGameKind } from "../play/play"

/**
 * The shared catalog as the screens take it: one catalog for both games, a
 * machine saying which game it is and everything hung on it in that game's
 * shape.
 */

/** Which game a machine is: a component of the machine, deciding the shape of all hung on it. */
export type GameKind = "pachinko" | "pachislot"

/** The catalog's game a play's is: a book says `slot` for pachislot, it being data already written. */
export const CATALOG_GAMES: Readonly<Record<PlayGameKind, GameKind>> = { pachinko: "pachinko", slot: "pachislot" }

/** One of a pachinko machine's bonuses, as a formula of it states them. */
export type MachineBonus = Pachinko.Bonus

/**
 * A machine as a search finds it: the name it goes by in a parlor, the
 * model name it was approved under where that is known, the other words it
 * is searched by, and a pachinko machine's 大当り確率 as its spec sheet
 * writes it — and, apart from it, the one each of its formulas' bases says,
 * each once and the likeliest first: a machine whose versions differ in it
 * has no one chance of its own, and is told by these. A formula typed in by
 * hand says none, and a pachislot machine has none.
 */
export interface MachineSummary {
  readonly id: MachineId
  readonly gameKind: GameKind
  readonly name: string
  readonly modelName: string | undefined
  readonly keywords: readonly string[]
  readonly hitChance: string | undefined
  readonly formulaHitChances: readonly ProbabilityDto[]
  readonly releasedOn: IsoDate
  readonly formulaCount: number
}

/**
 * The name a machine goes into a book under: its model name, the one name
 * it has that is nobody's choice of words and that a serious player would
 * know it by — or, for a machine registered before one was asked of every
 * machine, the name the halls call it. The halls' name is what a machine
 * is found and chosen by; this is what is kept of the choice. It is
 * written as a book can hold it, `P STEINS;GATE0` as `P STEINS；GATE0`,
 * so a name is the same wherever it is matched against a book.
 */
export const bookNameOf = (machine: Pick<MachineSummary, "name" | "modelName">): string => writableText(machine.modelName ?? machine.name)

/**
 * The catalog's machines by the name each goes into a book under: what a
 * screen needs to say a book's machine the way the halls do. A book keeps
 * the model name and nothing else does — every screen shows the halls'
 * name, and only a tally's own details say the model name beside it.
 */
export type MachineNames = ReadonlyMap<string, Pick<MachineSummary, "name" | "modelName">>

export const machineNamesOf = (machines: readonly Pick<MachineSummary, "name" | "modelName">[]): MachineNames => new Map(machines.map((machine) => [bookNameOf(machine), machine]))

/** What a machine a book names is shown as: the name the halls call it, or, the catalog knowing no machine under what the book says, what the book says. */
export const shownNameOf = (names: MachineNames, bookName: string): string => names.get(bookName)?.name ?? bookName

/** The model name of a machine a book names, where the catalog knows the machine and its model name. */
export const modelNameOf = (names: MachineNames, bookName: string): string | undefined => names.get(bookName)?.modelName

/** A pachinko machine and every formula of it, each with what people have done with it. */
export interface PachinkoMachineDetail {
  readonly machine: MachineSummary
  readonly formulas: readonly FormulaListing<Pachinko.Formula>[]
}

/** A pachislot machine with every formula and every 設定配分 of it, each with what people have done with it. */
export interface PachislotMachineDetail {
  readonly machine: MachineSummary
  readonly formulas: readonly FormulaListing<Pachislot.Formula>[]
  readonly distributions: readonly FormulaListing<Pachislot.SettingDistribution>[]
}

/** A machine as the catalog holds it, in its game's shape. */
export type MachineEntry = ({ readonly gameKind: "pachinko" } & PachinkoMachineDetail) | ({ readonly gameKind: "pachislot" } & PachislotMachineDetail)

export interface PachinkoFormulaDetail {
  readonly machine: MachineSummary
  readonly listing: FormulaListing<Pachinko.Formula>
}

export interface PachislotFormulaDetail {
  readonly machine: MachineSummary
  readonly listing: FormulaListing<Pachislot.Formula>
}

/** A machine about to be registered, with its first formula. */
export interface NewMachine {
  readonly name: string
  readonly modelName: string | undefined
  readonly keywords: readonly string[]
  readonly hitChance: string | undefined
  readonly releasedOn: IsoDate
}

/** A pachinko formula about to be made: everything but its id, machine and time. */
export type NewPachinkoFormula = {
  readonly figures: Pachinko.Figures
  readonly bonuses: readonly MachineBonus[]
  readonly derivedFrom: Pachinko.FormulaId | undefined
} & Pachinko.NewFormulaMaking

/** A pachislot formula about to be made. */
export type NewPachislotFormula = {
  readonly figures: readonly Pachislot.SettingLevelFigures[]
  readonly derivedFrom: Pachislot.FormulaId | undefined
} & Pachislot.NewFormulaMaking

/** A 設定配分 about to be registered. */
export interface NewSettingDistribution {
  readonly label: string
  readonly shares: readonly Pachislot.SettingLevelShare[]
  readonly derivedFrom: Pachislot.SettingDistributionId | undefined
}

/** A formula of a game, as sent: the machine it is for decides which. */
export type NewFormula = { readonly gameKind: "pachinko"; readonly formula: NewPachinkoFormula } | { readonly gameKind: "pachislot"; readonly formula: NewPachislotFormula }

/** What a mark or a use is on: a formula, or a 設定配分. */
export type CatalogTarget = { readonly type: "formula"; readonly id: string } | { readonly type: "distribution"; readonly id: string }
