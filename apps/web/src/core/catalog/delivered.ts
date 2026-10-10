import {
  comparableName,
  type MachineDetailDto,
  type StandingDto,
} from "@p-lens/contracts"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

import type {
  CatalogTarget,
  GameKind,
  MachineEntry,
  MachineSummary,
  NewPachinkoFormula,
  NewPachislotFormula,
  NewSettingDistribution,
} from "./catalog"
import { machineMatches } from "./description"
import type { IsoDate } from "../calendar/calendar"
import type * as Pachinko from "../pachinko"
import type { MachineId } from "../machine/machine"
import type { FormulaListing, Mark, Ranked, Standing } from "../formula/standing"
import type * as Pachislot from "../pachislot"

const standingOf = (dto: StandingDto): Standing => ({ ...dto })

const listingOf = <F extends Ranked>(formula: F, standing: StandingDto): FormulaListing<F> => ({ formula, standing: standingOf(standing) })

export const pachinkoFormulaOf = (dto: PachinkoContract.FormulaDto): Pachinko.Formula => {
  const common = {
    id: dto.id as Pachinko.FormulaId,
    machineId: dto.machineId as MachineId,
    figures: {
      roundChanceOneIn: dto.figures.roundChanceOneIn,
      payoutPerRound: dto.figures.payoutPerRound,
      totalChanceOneIn: dto.figures.totalChanceOneIn,
      spinsPerHour: dto.figures.spinsPerHour,
    },
    bonuses: dto.bonuses ?? [],
    derivedFrom: dto.derivedFrom as Pachinko.FormulaId | undefined,
    createdAt: dto.createdAt,
  }
  if (dto.kind === "manual" || dto.basis === undefined) return { ...common, kind: "manual" }
  if (dto.kind === "sampled" && dto.sampling !== undefined) return { ...common, kind: "sampled", basis: dto.basis, sampling: dto.sampling }
  return { ...common, kind: "simulated", basis: dto.basis }
}

/** A pachislot formula's figures, each bonus called as its 解析値 call it. */
const settingLevelFiguresOf = (figures: PachislotContract.FormulaSettingLevelFiguresDto, labels: Readonly<Record<string, string>>): Pachislot.SettingLevelFigures => ({
  settingLevel: figures.settingLevel,
  payoutRate: figures.payoutRate,
  bonuses: figures.bonuses.map((bonus) => ({ id: bonus.id, label: labels[bonus.id] || bonus.id, oneIn: bonus.oneIn })),
  combinedOneIn: figures.combinedOneIn,
  ...(figures.at === undefined ? {} : { at: figures.at }),
})

export const pachislotFormulaOf = (dto: PachislotContract.FormulaDto): Pachislot.Formula => {
  const labels = dto.basis.spec.components.label ?? {}
  const common = {
    id: dto.id as Pachislot.FormulaId,
    machineId: dto.machineId as MachineId,
    figures: dto.figures.map((figures) => settingLevelFiguresOf(figures, labels)),
    derivedFrom: dto.derivedFrom as Pachislot.FormulaId | undefined,
    createdAt: dto.createdAt,
  }
  return dto.kind === "sampled" && dto.sampling !== undefined ? { ...common, kind: "sampled", basis: dto.basis, sampling: dto.sampling } : { ...common, kind: dto.kind === "sampled" ? "simulated" : dto.kind, basis: dto.basis }
}

export const distributionOf = (dto: PachislotContract.SettingDistributionDto): Pachislot.SettingDistribution => ({
  id: dto.id as Pachislot.SettingDistributionId,
  machineId: dto.machineId as MachineId,
  label: dto.label,
  shares: dto.shares.map((share) => ({ settingLevel: share.settingLevel, basisPoints: share.value })),
  derivedFrom: dto.derivedFrom as Pachislot.SettingDistributionId | undefined,
  createdAt: dto.createdAt,
})

/** A delivered machine as a search finds it. A delivery kept from before machines had words to be searched by has none. */
const summaryOf = (detail: MachineDetailDto): MachineSummary => ({
  id: detail.machine.id as MachineId,
  gameKind: detail.machine.gameKind,
  name: detail.machine.name,
  modelName: detail.machine.modelName,
  keywords: detail.machine.keywords ?? [],
  hitChance: detail.machine.hitChance,
  releasedOn: detail.machine.releasedOn as IsoDate,
  formulaCount: detail.machine.formulaCount,
})

/** A delivered machine as the screens take it, in its game's shape. */
export const entryOf = (detail: MachineDetailDto): MachineEntry => {
  const machine = summaryOf(detail)
  if (detail.machine.gameKind === "pachinko") {
    return {
      gameKind: "pachinko",
      machine,
      formulas: (detail.formulas as readonly PachinkoContract.FormulaDto[]).map((dto) => listingOf(pachinkoFormulaOf(dto), dto.standing)),
    }
  }
  const pachislot = detail as Extract<MachineDetailDto, { readonly distributions: readonly PachislotContract.SettingDistributionDto[] }>
  return {
    gameKind: "pachislot",
    machine,
    formulas: pachislot.formulas.map((dto) => listingOf(pachislotFormulaOf(dto), dto.standing)),
    distributions: pachislot.distributions.map((dto) => listingOf(distributionOf(dto), dto.standing)),
  }
}

/** Machines of a game found by the query — by name, model name or a word they are searched by — as delivered: newest release first. An empty query finds every one. */
export const searchDelivered = (machines: readonly MachineDetailDto[], query: string, gameKind: GameKind): readonly MachineSummary[] =>
  machines
    .filter((detail) => detail.machine.gameKind === gameKind)
    .map(summaryOf)
    .filter((machine) => machineMatches(machine, query))

/** The machine of this game already delivered under a name, if any. */
export const machineNamed = (machines: readonly MachineDetailDto[], name: string, gameKind: GameKind): MachineId | undefined =>
  machines.find((detail) => detail.machine.gameKind === gameKind && comparableName(detail.machine.name) === comparableName(name))?.machine.id as MachineId | undefined

export const pachinkoFormulaDto = (formula: NewPachinkoFormula): PachinkoContract.NewFormulaDto => ({
  kind: formula.kind,
  figures: {
    roundChanceOneIn: formula.figures.roundChanceOneIn,
    payoutPerRound: formula.figures.payoutPerRound,
    ...(formula.figures.totalChanceOneIn === undefined ? {} : { totalChanceOneIn: formula.figures.totalChanceOneIn }),
    ...(formula.figures.spinsPerHour === undefined ? {} : { spinsPerHour: formula.figures.spinsPerHour }),
  },
  ...(formula.kind === "manual" ? {} : { basis: { spec: formula.basis.spec, conditions: formula.basis.conditions } }),
  ...(formula.kind === "sampled" ? { sampling: formula.sampling } : {}),
  bonuses: formula.bonuses,
  ...(formula.derivedFrom === undefined ? {} : { derivedFrom: formula.derivedFrom }),
})

export const pachislotFormulaDto = (formula: NewPachislotFormula): PachislotContract.NewFormulaDto => ({
  kind: formula.kind,
  figures: formula.figures.map((figures) => ({
    settingLevel: figures.settingLevel,
    payoutRate: figures.payoutRate,
    bonuses: figures.bonuses.map((bonus) => ({ id: bonus.id, oneIn: bonus.oneIn })),
    combinedOneIn: figures.combinedOneIn,
    ...(figures.at === undefined ? {} : { at: figures.at }),
  })),
  basis: { spec: formula.basis.spec, conditions: formula.basis.conditions },
  ...(formula.kind === "sampled" ? { sampling: formula.sampling } : {}),
  ...(formula.derivedFrom === undefined ? {} : { derivedFrom: formula.derivedFrom }),
})

export const distributionDto = (distribution: NewSettingDistribution): PachislotContract.NewSettingDistributionDto => ({
  label: distribution.label,
  shares: distribution.shares.map((share) => ({ settingLevel: share.settingLevel, value: share.basisPoints })),
  ...(distribution.derivedFrom === undefined ? {} : { derivedFrom: distribution.derivedFrom }),
})

/** Where a mark lands in the delivered catalog: the machine it hangs on, and whether it was worked out from a basis there is to check. */
export interface Located {
  readonly machineId: string
  readonly checkable: boolean
}

/** A formula or 設定配分 found in the delivered catalog, or none if it has not been delivered. */
export const locate = (machines: readonly MachineDetailDto[], target: CatalogTarget): Located | undefined => {
  const found = machines.flatMap((detail): readonly Located[] => {
    if (target.type === "formula") {
      const formula = (detail.formulas as readonly { readonly id: string; readonly kind: string }[]).find((each) => each.id === target.id)
      return formula === undefined ? [] : [{ machineId: detail.machine.id, checkable: formula.kind !== "manual" }]
    }
    const distributions = detail.machine.gameKind === "pachislot" ? (detail as Extract<MachineDetailDto, { readonly distributions: readonly PachislotContract.SettingDistributionDto[] }>).distributions : []
    return distributions.some((each) => each.id === target.id) ? [{ machineId: detail.machine.id, checkable: false }] : []
  })
  return found[0]
}

/** Whether a mark can be put on what it is on: a 設定配分 is adopted or favoured, never rejected or checked. */
export const markable = (target: CatalogTarget, mark: Mark): boolean => target.type === "formula" || mark === "adoption" || mark === "favorite"

/** Whether a mark is a check either way, which only a formula worked out from a basis can take. */
export const checks = (mark: Mark): boolean => mark === "verification" || mark === "refutation"
