import type * as Pachinko from "./pachinko/engine.ts"
import type * as Pachislot from "./pachislot/engine.ts"

/**
 * The shared catalog as the API serves it and delivers it to every device:
 * machines of both games, their formulas (算出条件), a pachislot machine's
 * 設定配分, and what people have done with them. The game is a machine's: a
 * formula is in its machine's game's shape and says nothing of it itself.
 * Absent fields are left out rather than sent as null. Every id is a UUIDv7;
 * every time is ISO 8601 in UTC.
 */

export type GameKindDto = "pachinko" | "pachislot"

/**
 * One of the bonuses a pachinko machine pays, as a formula of it states
 * them: the name a player knows it by, the balls it pays out, and the balls
 * shot to get them — `1500` paid out for `100` shot is a gain of 1400. A
 * play records which bonus was won, and takes its balls from the formula
 * it is weighed against. `jackpots` is how many jackpots it is won over,
 * left out where it is one: a parlor's counter counts each, so a play
 * counts as many.
 */
export interface MachineBonusDto {
  readonly name: string
  readonly payout: number
  readonly spent: number
  readonly jackpots?: number
}

export interface MachineSummaryDto {
  readonly id: string
  readonly gameKind: GameKindDto
  /** The name a machine goes by in a parlor. */
  readonly name: string
  /** The model name the machine was approved under (型式名), where it is known. */
  readonly modelName?: string
  /** Other words it is searched by: an abbreviation, a reading, a nickname. */
  readonly keywords: readonly string[]
  /** A pachinko machine's 大当り確率 as its spec sheet writes it, `1/319.7`, where it is known. */
  readonly hitChance?: string
  /** When the machine came out, YYYY-MM-DD. */
  readonly releasedOn: string
  readonly formulaCount: number
}

/** What people have done with a formula or a 設定配分; a 設定配分 is never verified, refuted or rejected. */
export interface StandingDto {
  readonly verifications: number
  readonly refutations: number
  readonly adoptions: number
  readonly rejections: number
  readonly favorites: number
  readonly uses: number
}

/** A machine with every formula of it in its game's shape, and a pachislot machine's 設定配分. */
export type MachineDetailDto =
  | { readonly machine: MachineSummaryDto & { readonly gameKind: "pachinko" }; readonly formulas: readonly Pachinko.FormulaDto[] }
  | {
      readonly machine: MachineSummaryDto & { readonly gameKind: "pachislot" }
      readonly formulas: readonly Pachislot.FormulaDto[]
      readonly distributions: readonly Pachislot.SettingDistributionDto[]
    }

/**
 * The whole catalog as delivered to a device, and the version it is: a
 * device asks for the version first, and for the catalog only when its own
 * is older. Every machine with all it has.
 */
export interface CatalogDto {
  readonly version: string
  readonly machines: readonly MachineDetailDto[]
}

export interface CatalogVersionDto {
  readonly version: string
}

/** A machine registered with its first formula, together, in its game's shape. */
export type RegisterMachineDto = {
  readonly name: string
  readonly modelName?: string
  readonly keywords?: readonly string[]
  readonly hitChance?: string
  /** When the machine came out, YYYY-MM-DD. */
  readonly releasedOn: string
} & (
  | { readonly gameKind: "pachinko"; readonly formula: Pachinko.NewFormulaDto }
  | { readonly gameKind: "pachislot"; readonly formula: Pachislot.NewFormulaDto }
)

/**
 * How a machine is described, as an administrator sets it right: its name,
 * its model name, the words it is searched by and its 大当り確率, each as
 * it is to be from now on. Whatever but the name is left
 * out is taken away.
 */
export interface MachineDescriptionDto {
  readonly name: string
  readonly modelName?: string
  readonly keywords?: readonly string[]
  readonly hitChance?: string
}

export interface RegisteredDto {
  readonly machineId: string
  readonly formulaId: string
}

export interface CreatedDto {
  readonly id: string
}

/** What a registration is counted as: a machine with its first formula, an addition to a machine there already — a formula or a 設定配分 — or a tag. */
export type RegistrationKindDto = "machine" | "addition" | "tag"

/** Where a device stands against one kind's quota: how many more it may register today, and from when it may register the next, as ISO 8601 in UTC — left out where that is now. */
export interface QuotaStandingDto {
  readonly remaining: number
  readonly nextAt?: string
}

/** Where a device stands against every kind's quota, or that the deployment has none. */
export type QuotaDto = { readonly type: "unlimited" } | ({ readonly type: "limited" } & Readonly<Record<RegistrationKindDto, QuotaStandingDto>>)

/** What the API answers with when it answers with an error. */
export interface ApiErrorDto {
  readonly error: { readonly type: string } & Readonly<Record<string, unknown>>
}
