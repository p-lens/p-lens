import { createMemo, createContext, createSignal, useContext, type Accessor, type JSX } from "solid-js"

import type * as Pachinko from "../../../core/pachinko"
import type { MachineId } from "../../../core/machine/machine"
import type * as Pachislot from "../../../core/pachislot"
import type { SubmissionId } from "../../../core/parlor/parlor"
import type { SharedParlorId } from "../../../core/parlor/shared"
import { tokenValueOf } from "../../../core/parlor/terms"
import type { PlayGameKind, PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import * as PachislotChoice from "../pachislot/start/choice"
import { recalledParlorSetting, writtenParlorSetting } from "./parlor-setting"
import { readTerms, termsAsOpened, type TermsForm } from "./start-terms"
import { tokensStillInHand } from "./tokens-in-hand"

/**
 * Where a play will be: no parlor, a parlor on the list, or one this device
 * submitted that the list has not taken yet.
 */
export type ParlorChoice =
  | { readonly type: "none" }
  | { readonly type: "listed"; readonly id: SharedParlorId }
  | { readonly type: "submitted"; readonly submission: SubmissionId }

/** Which pachinko machine a play is for, once one is chosen from the catalog. */
export type PachinkoMachineChoice = { readonly type: "none" } | { readonly type: "catalog"; readonly machineId: MachineId; readonly name: string }

/** Which pachislot machine a play is for, once one is chosen from its catalog. */
export type PachislotMachineChoice =
  | { readonly type: "none" }
  | { readonly type: "catalog"; readonly machineId: MachineId; readonly name: string }

/**
 * What starting a pachinko play has chosen so far: the machine, a formula
 * chosen by hand — absent, the machine's own choice stands — the formula a
 * new one is being remade from, a machine not yet in the catalog as last
 * searched for, its release date kept with its name while its formula is
 * made, and the data counter as it was found at the seat.
 */
export interface PachinkoStart {
  readonly machine: PachinkoMachineChoice
  readonly formulaId: Pachinko.FormulaId | undefined
  readonly remakeFrom: Pachinko.FormulaId | undefined
  readonly newMachineName: string
  readonly newMachineModelName: string
  readonly newMachineKeywords: string
  readonly newMachineHitChance: string
  readonly newMachineReleasedOn: string
  /** The data counter as it was found at the seat, beside the spins since its last jackpot: the day's jackpots. */
  readonly seatJackpots: string
  /** The cabinet's own 遊タイム counter, for a machine with a 遊タイム, where it shows otherwise than the data counter; empty, it shows the same. */
  readonly seatGauge: string
}

export const EMPTY_PACHINKO_START: PachinkoStart = {
  machine: { type: "none" },
  formulaId: undefined,
  remakeFrom: undefined,
  newMachineName: "",
  newMachineModelName: "",
  newMachineKeywords: "",
  newMachineHitChance: "",
  newMachineReleasedOn: "",
  seatJackpots: "",
  seatGauge: "",
}

/**
 * What starting a pachislot play has chosen so far, kept apart from
 * pachinko's: the machine, a formula and a prior chosen by hand — absent,
 * the machine's own choice stands — the formula one is remade from, a
 * machine not yet in the catalog as last typed, and the data counter as it
 * was found at the seat: the day's games and each bonus, by its id.
 */
export interface PachislotStart {
  readonly machine: PachislotMachineChoice
  readonly formulaId: Pachislot.FormulaId | undefined
  readonly prior: Pachislot.ChosenPrior | undefined
  readonly remakeFrom: Pachislot.FormulaId | undefined
  readonly newMachineName: string
  readonly newMachineModelName: string
  readonly newMachineKeywords: string
  readonly newMachineReleasedOn: string
  readonly seatTotal: string
  readonly seatBonuses: Readonly<Record<string, string>>
  /** The cabinet's settings were changed before the play, for an AT machine whose ceiling is then shorter. */
  readonly seatAfterReset: boolean
  /** On an AT machine a CZ brings: the games since the last CZ, and the CZs missed since the last AT. */
  readonly seatSinceCz: string
  readonly seatMisses: string
  /** On an AT machine whose 有利区間 carries on after an AT: what it held when the last AT ended. */
  readonly seatHeld: string
  /** On an AT machine whose AT間天井 counts across the bonuses that start the counter again: the games since the AT itself. */
  readonly seatSinceAtAcrossBonuses: string
  /** On an AT machine with modes: the mode play is in, by its id, where the person knows it; empty where not. */
  readonly seatMode: string
}

export const EMPTY_PACHISLOT_START: PachislotStart = {
  machine: { type: "none" },
  formulaId: undefined,
  prior: undefined,
  remakeFrom: undefined,
  newMachineName: "",
  newMachineModelName: "",
  newMachineKeywords: "",
  newMachineReleasedOn: "",
  seatTotal: "",
  seatBonuses: {},
  seatAfterReset: false,
  seatSinceCz: "",
  seatMisses: "",
  seatHeld: "",
  seatSinceAtAcrossBonuses: "",
  seatMode: "",
}

/**
 * A play in progress being said anew to be at another cabinet or on
 * another machine, as chosen so far: the number typed, the machine and —
 * chosen by hand — its formula. Kept here so that a look at a formula's
 * grounds and back does not lose it, and let go of once it is saved.
 */
export interface CabinetChoice {
  readonly playId: PlayId
  readonly cabinetNumber: string
  readonly machineId: string | undefined
  readonly formulaId: string | undefined
}

/**
 * The form a play is started with, as filled in so far. Work in hand: it
 * outlives a trip into a formula's depths and back, and nothing else — but
 * for its parlor setting, which is the business day's.
 */
export interface StartForm {
  /** The parlor chosen; none means a play recorded by its totals in yen. */
  readonly parlor: ParlorChoice
  /** The corner's terms as typed, for each game; the button pressed says which is played. */
  readonly terms: Readonly<Record<PlayGameKind, TermsForm>>
  readonly pachinko: PachinkoStart
  readonly pachislot: PachislotStart
  readonly cabinetNumber: string
  readonly startCounter: string
  /** The tokens the play is begun with in hand, where the person typed over what is kept for the place; left alone, what is kept stands. */
  readonly carriedIn: string | undefined
  /** A play in progress whose cabinet and machine are being said anew, where one is. */
  readonly cabinet: CabinetChoice | undefined
}

/** What a corner usually has, for each game: 250玉 rented for ¥1,000 and 28玉 exchanged for ¥100, or 46枚 rented — what a 20-yen corner gives with the tax on top — and 5.2枚 exchanged; and a replay stated for half the rental. */
const USUAL_TERMS: Readonly<Record<PlayGameKind, { readonly rentalTokens: string; readonly exchange: string; readonly replayTokens: string }>> = {
  pachinko: { rentalTokens: "250", exchange: "28", replayTokens: "125" },
  pachislot: { rentalTokens: "46", exchange: "5.2", replayTokens: "23" },
}

const EMPTY_START_FORM: StartForm = {
  parlor: { type: "none" },
  terms: { pachinko: termsAsOpened(USUAL_TERMS.pachinko), pachislot: termsAsOpened(USUAL_TERMS.pachislot) },
  pachinko: EMPTY_PACHINKO_START,
  pachislot: EMPTY_PACHISLOT_START,
  cabinetNumber: "",
  startCounter: "",
  carriedIn: undefined,
  cabinet: undefined,
}

/** A game's terms as recalled, a count left empty opening as the usual one again: the form never opens on a blank. */
const filledTerms = (recalled: TermsForm, opened: TermsForm): TermsForm => ({
  rentalTokens: recalled.rentalTokens === "" ? opened.rentalTokens : recalled.rentalTokens,
  exchange: recalled.exchange === "" ? opened.exchange : recalled.exchange,
  replayPaidOut: recalled.replayPaidOut === "" ? opened.replayPaidOut : recalled.replayPaidOut,
  replayDeducted: recalled.replayDeducted === "" ? opened.replayDeducted : recalled.replayDeducted,
})

const recalledTerms = (recalled: Readonly<Record<PlayGameKind, TermsForm>>): Readonly<Record<PlayGameKind, TermsForm>> => ({
  pachinko: filledTerms(recalled.pachinko, EMPTY_START_FORM.terms.pachinko),
  pachislot: filledTerms(recalled.pachislot, EMPTY_START_FORM.terms.pachislot),
})

export interface StartFormState {
  readonly form: Accessor<StartForm>
  readonly update: (change: Partial<StartForm>) => void
  /** Change what starting a pachinko play has chosen, leaving the rest. */
  readonly updatePachinko: (change: Partial<PachinkoStart>) => void
  /** Change what starting a pachislot play has chosen, leaving the rest. */
  readonly updatePachislot: (change: Partial<PachislotStart>) => void
}

const Context = createContext<StartFormState>()

/**
 * Holds the start form. Its parlor setting — the parlor and the corners'
 * terms — is kept on the device as it changes and is the form's for the
 * business day it was made on: the day's next play starts from it, a
 * reload does not lose it, and the day after starts empty. The tokens
 * left in hand by a day's play are let go of here once the day has turned
 * over: they are no day's but their own.
 */
export function StartFormProvider(props: { readonly children: JSX.Element }): JSX.Element {
  const app = useApp()
  const recalled = recalledParlorSetting(app.services.preferences.parlorSetting(), app.services.businessDay())
  if (app.services.preferences.tokensInHand() !== tokensStillInHand(app.services.preferences.tokensInHand(), app.services.businessDay())) app.services.preferences.setTokensInHand(undefined)
  const [held, setHeld] = createSignal<StartForm>(recalled === undefined ? EMPTY_START_FORM : { ...EMPTY_START_FORM, parlor: recalled.parlor, terms: recalledTerms(recalled.terms) })
  const [settingDay, setSettingDay] = createSignal(app.services.businessDay())
  const form = (): StartForm => (settingDay() === app.services.businessDay() ? held() : { ...held(), parlor: EMPTY_START_FORM.parlor, terms: EMPTY_START_FORM.terms })
  const update = (change: Partial<StartForm>): void => {
    const changed = { ...form(), ...change }
    setHeld(changed)
    if (change.parlor === undefined && change.terms === undefined) return
    setSettingDay(app.services.businessDay())
    app.services.preferences.setParlorSetting(writtenParlorSetting(app.services.businessDay(), { parlor: changed.parlor, terms: changed.terms }))
  }
  return (
    <Context.Provider
      value={{
        form,
        update,
        updatePachinko: (change) => setHeld((current) => ({ ...current, pachinko: { ...current.pachinko, ...change } })),
        updatePachislot: (change) => setHeld((current) => ({ ...current, pachislot: PachislotChoice.withChange(current.pachislot, change) })),
      }}
    >
      {props.children}
    </Context.Provider>
  )
}

/** The start form's state; only reachable inside the screen, which provides it. */
export const useStartForm = (): StartFormState => {
  const found = useContext(Context)
  if (found === undefined) throw new Error("useStartForm called outside StartFormProvider")
  return found
}

/** Yen a ball exchanges for by the pachinko terms typed in the start form, once they read. */
export const useStartBallValue = (): Accessor<number | undefined> => {
  const { form } = useStartForm()
  return createMemo(() => {
    const terms = readTerms(form().terms.pachinko, "pachinko")
    return terms.ok ? tokenValueOf(terms.value) : undefined
  })
}
