import { MACHINE_BONUSES } from "@p-lens/contracts"
import type { AllotmentDto, EarlyEndDto, NextDto, ConditionsDto, OtherRoundsDto, SpecDto, ProbabilityDto, ReliefDriveDto } from "@p-lens/contracts/pachinko"

import type { Figures } from "../../../../core/pachinko/figures"
import { assembleWorld, modesOf, regularOf, type ModeKind, type ModeView } from "../../../../core/pachinko/world"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { tidyTyped } from "../../../../core/text/tidy"

/**
 * A field that could not be read, named as the form names it.
 *
 * - `too-fine`: a number written to more places than a spec is kept in, two.
 * - `not-whole`: a count that is not a whole number.
 */
export interface FormProblem {
  readonly field: string
  readonly reason: "required" | "not-a-number" | "too-fine" | "not-whole" | "out-of-range"
}

type Read<T> = Result<T, FormProblem>

const DECIMAL = /^(\d+)(?:\.(\d+))?$/

/** A typed number as its digits before and after the point; a number, or it says why not. */
const digitsOf = (text: string, field: string): Read<{ readonly whole: string; readonly fraction: string }> => {
  const plain = tidyTyped(text).replaceAll(",", "")
  if (plain === "") return Err({ field, reason: "required" })
  const match = DECIMAL.exec(plain)
  if (match === null) return Err({ field, reason: "not-a-number" })
  const [, whole = "0", fraction = ""] = match
  return Ok({ whole, fraction })
}

/** A typed number as exact hundredths: `319.7` is `31970`. Never through a float, and no finer than a spec is kept. */
const hundredthsOf = (text: string, field: string): Read<number> => {
  const digits = digitsOf(text, field)
  if (!digits.ok) return digits
  return digits.value.fraction.length > 2 ? Err({ field, reason: "too-fine" }) : Ok(Number(digits.value.whole) * 100 + Number(digits.value.fraction.padEnd(2, "0")))
}

const positiveHundredths = (text: string, field: string): Read<number> => {
  const read = hundredthsOf(text, field)
  return read.ok && read.value === 0 ? Err({ field, reason: "out-of-range" }) : read
}

/** A percentage as basis points, at most 100%. */
const percentOf = (text: string, field: string): Read<number> => {
  const read = hundredthsOf(text, field)
  return read.ok && read.value > 10_000 ? Err({ field, reason: "out-of-range" }) : read
}

/** A signed percentage to two places as basis points, above -100% and at most +100%: `-10` is `-1000`. Empty is none. */
const supportGainOf = (text: string, field: string): Read<number> => {
  const plain = tidyTyped(text).replace(/^[−－]/, "-").replace(/^＋/, "+")
  if (plain === "") return Ok(0)
  const negative = plain.startsWith("-")
  const read = hundredthsOf(plain.replace(/^[+-]/, ""), field)
  if (!read.ok) return read
  const points = negative ? -read.value : read.value
  return points <= -10_000 || points > 10_000 ? Err({ field, reason: "out-of-range" }) : Ok(points)
}

const countOf = (text: string, field: string): Read<number> => {
  const read = positiveHundredths(text, field)
  return read.ok && read.value % 100 !== 0 ? Err({ field, reason: "not-whole" }) : read.ok ? Ok(read.value / 100) : read
}

/** A figure above zero, to as many places as it was typed: a figure worked out elsewhere, 1/9.3016, is kept as it came. */
const positiveNumber = (text: string, field: string): Read<number> => {
  const digits = digitsOf(text, field)
  if (!digits.ok) return digits
  const value = Number(`${digits.value.whole}.${digits.value.fraction === "" ? "0" : digits.value.fraction}`)
  return value > 0 ? Ok(value) : Err({ field, reason: "out-of-range" })
}

const optionalPositive = (text: string, field: string): Read<number | undefined> => (tidyTyped(text) === "" ? Ok(undefined) : positiveNumber(text, field))

const problemsOf = (reads: readonly Read<unknown>[]): readonly FormProblem[] => reads.flatMap((read) => (read.ok ? [] : [read.error]))

/** The figures typed in by hand, as text. */
export interface ManualForm {
  readonly roundChanceOneIn: string
  readonly payoutPerRound: string
  readonly totalChanceOneIn: string
  readonly spinsPerHour: string
}

export const EMPTY_MANUAL_FORM: ManualForm = { roundChanceOneIn: "", payoutPerRound: "", totalChanceOneIn: "", spinsPerHour: "" }

export const manualFormOf = (figures: Figures): ManualForm => ({
  roundChanceOneIn: String(Math.round(figures.roundChanceOneIn * 10_000) / 10_000),
  payoutPerRound: String(Math.round(figures.payoutPerRound * 10_000) / 10_000),
  totalChanceOneIn: figures.totalChanceOneIn === undefined ? "" : String(Math.round(figures.totalChanceOneIn * 10_000) / 10_000),
  spinsPerHour: figures.spinsPerHour === undefined ? "" : String(figures.spinsPerHour),
})

/** Figures typed in by hand: the 1R トータル確率 and 1R 平均出玉 are all a theoretical value needs. */
export const readManualForm = (form: ManualForm): Result<Figures, readonly FormProblem[]> => {
  const round = positiveNumber(form.roundChanceOneIn, "1Rトータル確率")
  const payout = positiveNumber(form.payoutPerRound, "1R平均出玉")
  const total = optionalPositive(form.totalChanceOneIn, "トータル確率")
  const speed = optionalPositive(form.spinsPerHour, "1時間の回転数")
  if (!round.ok || !payout.ok || !total.ok || !speed.ok) return Err(problemsOf([round, payout, total, speed]))
  return Ok({ roundChanceOneIn: round.value, payoutPerRound: payout.value, totalChanceOneIn: total.value, spinsPerHour: speed.value })
}

export const REGULAR = "regular"

/**
 * Rounds of a jackpot through one attacker, as text. `prize` and `count`
 * are that attacker's, where they are not the machine's; empty, they are.
 */
export interface RoundsRow {
  readonly rounds: string
  readonly prize: string
  readonly count: string
}

/** Rounds not filled in yet, paying as the machine does. */
export const EMPTY_ROUNDS: RoundsRow = { rounds: "", prize: "", count: "" }

/**
 * One share of an allotment, as text. `next` is `regular` or a mode's key.
 * Its own `rounds`, `prize` and `count` are the first attacker its jackpot
 * opens; `others` are the rounds of the same jackpot through another.
 * `jackpots` is how many jackpots its rounds are won over; empty, one.
 */
export interface AllotmentRow extends RoundsRow {
  readonly share: string
  readonly next: string
  readonly others: readonly RoundsRow[]
  readonly jackpots: string
}

/** A row not filled in yet, leading back to the regular game. */
export const EMPTY_ROW: AllotmentRow = { share: "", next: REGULAR, ...EMPTY_ROUNDS, others: [], jackpots: "" }

export type ModeKindName = ModeKind["type"]

/** One mode, as text. `key` is its stable id within the form. */
export interface ModeForm {
  readonly key: string
  readonly label: string
  readonly kind: ModeKindName
  readonly spins: string
  readonly chance: string
  readonly draws: string
  readonly continuationRate: string
  readonly allotment: readonly AllotmentRow[]
  readonly onMiss: string
  /** The combo at which the lucky trigger moves play on, counting the jackpot that entered the mode. */
  readonly triggerCombo: string
  readonly triggerTo: string
  /** Whether the mode is played without the 電サポ, a 潜確 at the heso: the support gain leaves its jackpots alone. */
  readonly withoutSupport: boolean
  /** A 時短's early end, a c時短: its chance on each spin as 1/x, empty where it has none, and where play goes then. */
  readonly earlyEndChance: string
  readonly earlyEndTo: readonly EarlyEndRow[]
}

/** One share of where a 時短 ended early goes, as text: its share in percent and where. */
export interface EarlyEndRow {
  readonly share: string
  readonly next: string
}

/** Where a 時短 ended early goes until said otherwise: all of it back to the regular game. */
export const EARLY_END_ROW: EarlyEndRow = { share: "100", next: REGULAR }

/** A 期待値基礎値 being entered: the spec, and what a round really yields. */
export interface BasisForm {
  readonly regularOneIn: string
  readonly firstHit: readonly AllotmentRow[]
  readonly modes: readonly ModeForm[]
  /** The 遊タイム's count in regular-game spins; empty, the machine has none. */
  readonly reliefDriveGauge: string
  /** The key of the mode the 遊タイム leads to. */
  readonly reliefDriveTo: string
  readonly prizeBalls: string
  readonly count: string
  readonly measuredPayout: string
  /** 電サポ中の出玉増減 in percent, `-10` for -10%; empty, there is none. */
  readonly supportGain: string
  readonly spinsPerHour: string
}

export const newMode = (key: string, label: string): ModeForm => ({
  key,
  label,
  kind: "rushing",
  spins: "",
  chance: "",
  draws: "",
  continuationRate: "",
  allotment: [{ ...EMPTY_ROW, share: "100", rounds: "10", next: key }],
  onMiss: REGULAR,
  triggerCombo: "",
  triggerTo: "",
  withoutSupport: false,
  earlyEndChance: "",
  earlyEndTo: [EARLY_END_ROW],
})

/** A starting point most specs are a few edits away from: a first jackpot, half into a RUSH. */
export const STARTING_BASIS: BasisForm = {
  regularOneIn: "319.7",
  firstHit: [
    { ...EMPTY_ROW, share: "50", rounds: "3" },
    { ...EMPTY_ROW, share: "50", rounds: "3", next: "m1" },
  ],
  modes: [{ ...newMode("m1", "RUSH"), continuationRate: "80" }],
  reliefDriveGauge: "",
  reliefDriveTo: "",
  prizeBalls: "15",
  count: "10",
  measuredPayout: "",
  supportGain: "",
  spinsPerHour: "",
}

/** A key no mode of the form has yet. */
export const freshModeKey = (modes: readonly ModeForm[]): string =>
  `m${Math.max(0, ...modes.map((mode) => Number(mode.key.slice(1)) || 0)) + 1}`

const nextOf = (next: string): NextDto => (next === REGULAR ? { type: "regular" } : { type: "mode", mode: next })

const ratioOf = (text: string, field: string): Read<ProbabilityDto> => {
  const read = positiveHundredths(text, field)
  return read.ok ? Ok({ type: "ratio", numerator: 1, denominatorHundredths: read.value }) : read
}

const rateOf = (text: string, field: string): Read<ProbabilityDto> => {
  const read = percentOf(text, field)
  return read.ok ? Ok({ type: "percent", basisPoints: read.value }) : read
}

/** A count that may be left empty: then it is the machine's. */
const ownCountOf = (text: string, field: string): Read<number | undefined> => (tidyTyped(text) === "" ? Ok(undefined) : countOf(text, field))

const roundsOf = (row: RoundsRow, at: string): Result<OtherRoundsDto, readonly FormProblem[]> => {
  const rounds = countOf(row.rounds, `${at}のR数`)
  const prize = ownCountOf(row.prize, `${at}の賞球`)
  const count = ownCountOf(row.count, `${at}のカウント`)
  return rounds.ok && prize.ok && count.ok
    ? Ok({ rounds: rounds.value, ...(prize.value === undefined ? {} : { prizeBalls: prize.value }), ...(count.value === undefined ? {} : { count: count.value }) })
    : Err(problemsOf([rounds, prize, count]))
}

/** The jackpots a share's rounds are won over, where any are typed: no more than the catalog takes a bonus to be won over. */
const jackpotsOf = (text: string, field: string): Read<number | undefined> => {
  const read = ownCountOf(text, field)
  return read.ok && read.value !== undefined && read.value > MACHINE_BONUSES.jackpots ? Err({ field, reason: "out-of-range" }) : read
}

const shareOf = (row: AllotmentRow, at: string): Result<AllotmentDto, readonly FormProblem[]> => {
  const share = percentOf(row.share, `${at}の振分`)
  const first = roundsOf(row, at)
  const others = row.others.map((other, index) => roundsOf(other, `${at}の別アタッカー${index + 1}`))
  const jackpots = jackpotsOf(row.jackpots, `${at}の大当り回数`)
  const problems = [...problemsOf([share, jackpots]), ...(first.ok ? [] : first.error), ...others.flatMap((other) => (other.ok ? [] : other.error))]
  return share.ok && first.ok && jackpots.ok && problems.length === 0
    ? Ok({
        shareBasisPoints: share.value,
        ...first.value,
        next: nextOf(row.next),
        ...(others.length === 0 ? {} : { otherRounds: others.flatMap((other) => (other.ok ? [other.value] : [])) }),
        ...(jackpots.value === undefined || jackpots.value === 1 ? {} : { jackpots: jackpots.value }),
      })
    : Err(problems)
}

const allotmentOf = (rows: readonly AllotmentRow[], at: string): Result<readonly AllotmentDto[], readonly FormProblem[]> => {
  const reads = rows.map((row, index) => shareOf(row, `${at} ${index + 1}行目`))
  const problems = reads.flatMap((read) => (read.ok ? [] : read.error))
  return problems.length > 0 ? Err(problems) : Ok(reads.flatMap((read) => (read.ok ? [read.value] : [])))
}

const kindOf = (mode: ModeForm): Read<ModeKind> => {
  switch (mode.kind) {
    case "special-time": {
      const spins = countOf(mode.spins, `${mode.label}の回転数`)
      const chance = ratioOf(mode.chance, `${mode.label}の確率`)
      if (!spins.ok) return spins
      return chance.ok ? Ok({ type: "special-time", spins: spins.value, chance: chance.value }) : chance
    }
    case "rapid": {
      const spins = countOf(mode.spins, `${mode.label}の回転数`)
      if (!spins.ok) return spins
      if (mode.chance.trim() === "") return Ok({ type: "rapid", spins: spins.value, chance: undefined })
      const chance = ratioOf(mode.chance, `${mode.label}の確率`)
      return chance.ok ? Ok({ type: "rapid", spins: spins.value, chance: chance.value }) : chance
    }
    case "leftover-queue": {
      const draws = countOf(mode.draws, `${mode.label}の残保留の数`)
      return draws.ok ? Ok({ type: "leftover-queue", draws: draws.value }) : draws
    }
    case "rushing": {
      const rate = rateOf(mode.continuationRate, `${mode.label}の継続率`)
      return rate.ok ? Ok({ type: "rushing", continuationRate: rate.value }) : rate
    }
    case "until-hit":
      return Ok({ type: "until-hit" })
  }
}

/** A 時短's early end as typed: none where its chance is left empty or the mode is no 時短; otherwise its chance and every share of where it goes. */
const earlyEndOf = (mode: ModeForm): Result<EarlyEndDto | undefined, readonly FormProblem[]> => {
  if (mode.kind !== "rapid" || tidyTyped(mode.earlyEndChance) === "") return Ok(undefined)
  const chance = ratioOf(mode.earlyEndChance, `${mode.label}のc時短の確率`)
  const shares = mode.earlyEndTo.map((row, index) => percentOf(row.share, `${mode.label}のc時短 ${index + 1}行目の振分`))
  const problems = problemsOf([chance, ...shares])
  if (!chance.ok || problems.length > 0) return Err(problems)
  return Ok({ chance: chance.value, to: mode.earlyEndTo.flatMap((row, index) => ((share) => (share?.ok === true ? [{ shareBasisPoints: share.value, next: nextOf(row.next) }] : []))(shares[index])) })
}

const modeOf = (mode: ModeForm): Result<ModeView, readonly FormProblem[]> => {
  const kind = kindOf(mode)
  const earlyEnd = earlyEndOf(mode)
  const allotment = allotmentOf(mode.allotment, mode.label)
  const triggerCombo = mode.triggerTo === "" ? Ok(undefined) : countOf(mode.triggerCombo, `${mode.label}のラッキートリガーの連数`)
  const label: Read<string> = mode.label.trim() === "" ? Err({ field: "モード名", reason: "required" }) : Ok(mode.label.trim())
  const problems = [...problemsOf([kind, triggerCombo, label]), ...(allotment.ok ? [] : allotment.error), ...(earlyEnd.ok ? [] : earlyEnd.error)]
  if (!kind.ok || !allotment.ok || !triggerCombo.ok || !label.ok || !earlyEnd.ok) return Err(problems)
  return Ok({
    id: mode.key,
    label: label.value,
    kind: kind.value,
    allotment: allotment.value,
    onMiss: nextOf(mode.onMiss),
    luckyTrigger: triggerCombo.value === undefined ? undefined : { atCombo: triggerCombo.value, to: mode.triggerTo },
    withoutSupport: mode.withoutSupport,
    earlyEnd: earlyEnd.value,
  })
}

/** The 遊タイム as typed: none when its count is left empty, and then a mode it leads to is required. */
const reliefDriveOf = (form: BasisForm): Result<ReliefDriveDto | undefined, readonly FormProblem[]> => {
  if (tidyTyped(form.reliefDriveGauge) === "") return Ok(undefined)
  const spins = countOf(form.reliefDriveGauge, "遊タイム発動までの回転数")
  const to = form.modes.some((mode) => mode.key === form.reliefDriveTo) ? Ok(form.reliefDriveTo) : Err<FormProblem>({ field: "遊タイムの移行先", reason: "required" })
  const problems = problemsOf([spins, to])
  return spins.ok && to.ok ? Ok({ gauge: spins.value, to: to.value }) : Err(problems)
}

export interface ReadBasis {
  readonly spec: SpecDto
  readonly conditions: ConditionsDto
  readonly spinsPerHour: number | undefined
}

/**
 * The basis as a spec and conditions the engine can be handed, or every field
 * that could not be read. Whether the spec makes sense — shares summing to
 * 100%, a combo that ends — is the engine's to say.
 */
export const readBasisForm = (form: BasisForm): Result<ReadBasis, readonly FormProblem[]> => {
  const regular = ratioOf(form.regularOneIn, "通常時の大当り確率")
  const firstHit = allotmentOf(form.firstHit, "初当り")
  const modes = form.modes.map(modeOf)
  const prize = countOf(form.prizeBalls, "賞球")
  const count = countOf(form.count, "カウント")
  const measured = optionalPositive(form.measuredPayout, "実測の1R出玉")
  const gain = supportGainOf(form.supportGain, "電サポ中の出玉増減")
  const speed = optionalPositive(form.spinsPerHour, "1時間の回転数")
  const reliefDrive = reliefDriveOf(form)
  const problems = [
    ...problemsOf([regular, prize, count, measured, gain, speed]),
    ...(firstHit.ok ? [] : firstHit.error),
    ...(reliefDrive.ok ? [] : reliefDrive.error),
    ...modes.flatMap((mode) => (mode.ok ? [] : mode.error)),
  ]
  if (problems.length > 0 || !regular.ok || !firstHit.ok || !prize.ok || !count.ok || !measured.ok || !gain.ok || !speed.ok || !reliefDrive.ok) return Err(problems)
  return Ok({
    spec: assembleWorld(
      { chance: regular.value, allotment: firstHit.value, reliefDrive: reliefDrive.value },
      modes.flatMap((mode) => (mode.ok ? [mode.value] : [])),
      { prizeBalls: prize.value, count: count.value },
    ),
    conditions: {
      roundPayout: measured.value === undefined ? { type: "from-spec" } : { type: "measured", balls: measured.value },
      ...(gain.value === 0 ? {} : { supportGain: { basisPoints: gain.value } }),
    },
    spinsPerHour: speed.value,
  })
}

const hundredthsText = (hundredths: number): string => (hundredths / 100).toFixed(2).replace(/\.?0+$/, "")

const probabilityText = (probability: ProbabilityDto): string =>
  probability.type === "ratio" ? hundredthsText(probability.denominatorHundredths) : hundredthsText(probability.basisPoints)

const ownCountText = (count: number | undefined): string => (count === undefined ? "" : String(count))

const roundsRowOf = (rounds: OtherRoundsDto): RoundsRow => ({ rounds: String(rounds.rounds), prize: ownCountText(rounds.prizeBalls), count: ownCountText(rounds.count) })

const rowsOf = (allotment: readonly AllotmentDto[]): readonly AllotmentRow[] =>
  allotment.map((share) => ({
    share: hundredthsText(share.shareBasisPoints),
    next: share.next.type === "regular" ? REGULAR : share.next.mode,
    ...roundsRowOf(share),
    others: (share.otherRounds ?? []).map(roundsRowOf),
    jackpots: ownCountText(share.jackpots),
  }))

/** A stored basis back as a form, for remaking a formula from it: its world read through the queries. */
export const basisFormOf = (spec: SpecDto, conditions: ConditionsDto, spinsPerHour: number | undefined): BasisForm => {
  const regular = regularOf(spec)
  return {
    regularOneIn: regular === undefined ? "" : probabilityText(regular.chance),
    firstHit: regular === undefined ? [] : rowsOf(regular.allotment),
    modes: modesOf(spec).map((mode) => ({
      key: mode.id,
      label: mode.label,
      kind: mode.kind.type,
      spins: mode.kind.type === "special-time" || mode.kind.type === "rapid" ? String(mode.kind.spins) : "",
      chance: ((own) => (own === undefined ? "" : probabilityText(own)))(mode.kind.type === "special-time" || mode.kind.type === "rapid" ? mode.kind.chance : undefined),
      draws: mode.kind.type === "leftover-queue" ? String(mode.kind.draws) : "",
      continuationRate: mode.kind.type === "rushing" ? probabilityText(mode.kind.continuationRate) : "",
      allotment: rowsOf(mode.allotment),
      onMiss: mode.onMiss.type === "regular" ? REGULAR : mode.onMiss.mode,
      triggerCombo: mode.luckyTrigger === undefined ? "" : String(mode.luckyTrigger.atCombo),
      triggerTo: mode.luckyTrigger?.to ?? "",
      withoutSupport: mode.withoutSupport,
      earlyEndChance: mode.earlyEnd === undefined ? "" : probabilityText(mode.earlyEnd.chance),
      earlyEndTo: mode.earlyEnd === undefined ? [EARLY_END_ROW] : mode.earlyEnd.to.map((share) => ({ share: hundredthsText(share.shareBasisPoints), next: share.next.type === "regular" ? REGULAR : share.next.mode })),
    })),
    reliefDriveGauge: regular?.reliefDrive === undefined ? "" : String(regular.reliefDrive.gauge),
    reliefDriveTo: regular?.reliefDrive?.to ?? "",
    prizeBalls: String(spec.resources.payout.prizeBalls),
    count: String(spec.resources.payout.count),
    measuredPayout: conditions.roundPayout.type === "measured" ? String(conditions.roundPayout.balls) : "",
    supportGain: conditions.supportGain === undefined ? "" : hundredthsText(conditions.supportGain.basisPoints),
    spinsPerHour: spinsPerHour === undefined ? "" : String(spinsPerHour),
  }
}
