import {
  comparableName,
  type MachineDetailDto,
  type StandingDto,
} from "@p-lens/contracts"
import type * as PachinkoContract from "@p-lens/contracts/pachinko"
import type { ProbabilityDto } from "@p-lens/contracts/pachinko"
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
import { regularChanceOf, worthOf } from "../pachinko"
import type * as Pachinko from "../pachinko"
import type { MachineId } from "../machine/machine"
import { ranked, type FormulaListing, type Mark, type Ranked, type Standing } from "../formula/standing"
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

/** How likely a chance is, one in a hundred being 0.01: the likelier the larger. */
const likelihoodOf = (chance: ProbabilityDto): number => (chance.type === "ratio" ? chance.numerator / chance.denominatorHundredths : chance.basisPoints / 1_000_000)

/** How far apart two chances' "one in" may be and be told as one: 1/319.67 and 1/319.99 are one chance written two ways, 1/399 and 1/999 two. */
const ONE_IN_APART = 2

/** The "one in" a chance comes to, as a spec sheet writes it: 319.67 for 1/319.67. `likelihoodOf` is a hundredth of the chance itself. */
const oneInOf = (chance: ProbabilityDto): number => 1 / (likelihoodOf(chance) * 100)

/** A chance a formula's basis says, with the formula it is of. */
interface Said {
  readonly chance: ProbabilityDto
  readonly formulaId: string
}

/** Chances, the likeliest first, grouped where each one's "one in" lies within `ONE_IN_APART` of the one before. */
const groupedOf = (likeliestFirst: readonly Said[]): readonly (readonly Said[])[] =>
  likeliestFirst.reduce<readonly (readonly Said[])[]>((groups, said) => {
    const group = groups.at(-1)
    const last = group?.at(-1)
    return group !== undefined && last !== undefined && oneInOf(said.chance) - oneInOf(last.chance) < ONE_IN_APART ? [...groups.slice(0, -1), [...group, said]] : [...groups, [said]]
  }, [])

/**
 * The chance each group is told by: its own where it is alone, as nearly
 * every machine's is, and else that of the formula ranked first among the
 * group's — the one a machine is opened with sooner. The formulas are
 * ranked only for a machine that has such a group, and once.
 */
const toldApart = (groups: readonly (readonly Said[])[], rankOf: () => (formulaId: string) => number): readonly ProbabilityDto[] => {
  const held: { rank: ((formulaId: string) => number) | undefined } = { rank: undefined }
  const rank = (formulaId: string): number => (held.rank ??= rankOf())(formulaId)
  return groups.flatMap((group) => {
    const [first] = group
    if (first === undefined) return []
    return [(group.length === 1 ? first : group.reduce((best, said) => (rank(said.formulaId) < rank(best.formulaId) ? said : best))).chance]
  })
}

/** The 大当り確率 a pachinko machine's formulas' bases say, the likeliest first, those all but alike told once; none from a formula typed in by hand. */
const formulaHitChancesOf = (detail: MachineDetailDto): readonly ProbabilityDto[] => {
  if (detail.machine.gameKind !== "pachinko") return []
  const dtos = detail.formulas as readonly PachinkoContract.FormulaDto[]
  const said = dtos.flatMap((dto): readonly Said[] => {
    const chance = dto.basis === undefined ? undefined : regularChanceOf(dto.basis.spec)
    return chance === undefined ? [] : [{ chance, formulaId: dto.id }]
  })
  const rankOf = (): ((formulaId: string) => number) => {
    const order = ranked(dtos.map((dto) => listingOf(pachinkoFormulaOf(dto), dto.standing)), worthOf).map((listing) => listing.formula.id as string)
    return (formulaId) => order.indexOf(formulaId)
  }
  return toldApart(groupedOf(said.toSorted((left, right) => likelihoodOf(right.chance) - likelihoodOf(left.chance))), rankOf)
}

/** A delivered machine as a search finds it. A delivery kept from before machines had words to be searched by has none. */
const summaryOf = (detail: MachineDetailDto): MachineSummary => ({
  id: detail.machine.id as MachineId,
  gameKind: detail.machine.gameKind,
  name: detail.machine.name,
  modelName: detail.machine.modelName,
  keywords: detail.machine.keywords ?? [],
  hitChance: detail.machine.hitChance,
  formulaHitChances: formulaHitChancesOf(detail),
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
