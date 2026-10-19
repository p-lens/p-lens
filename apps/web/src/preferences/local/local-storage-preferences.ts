import { type BusinessDayTurn, readBusinessDayTurn } from "../../core/calendar/calendar"
import type { GameKind } from "../../core/catalog/catalog"
import { readStageStep, type StageStep } from "../../core/savings/odd-prize-reckoning"
import type { Preferences } from "../port/preferences"

const BUSINESS_DAY_TURN = "p-lens.business-day-turn"
const PARLOR_SETTING = "p-lens.parlor-setting"
const TOKENS_IN_HAND = "p-lens.tokens-in-hand"
const CONSOLIDATION_SHOWN = "p-lens.consolidation-shown"
const FIRST_OPENED = "p-lens.first-opened"
const STAGE_STEP = "p-lens.stage-step"
const FIGURES_UNFOLDED: Readonly<Record<GameKind, string>> = { pachinko: "p-lens.figures-unfolded.pachinko", pachislot: "p-lens.figures-unfolded.pachislot" }
const FORMULA_DRAFT: Readonly<Record<GameKind, string>> = { pachinko: "p-lens.formula-draft.pachinko", pachislot: "p-lens.formula-draft.pachislot" }

/** What a preference that is on is kept as; anything else, or nothing, is off. */
const ON = "on"

/** localStorage may be absent or refuse; neither stops the app, which then goes by the default. */
const stored = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

const keep = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

const forget = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch {
    return
  }
}

/**
 * When the device first opened the app, in UNIX seconds, kept where nothing
 * is kept yet. It is written ahead of anything that reads it, so that a
 * first-opening guide added later knows a device opened before it from a new
 * one, rather than greeting everyone the day it ships.
 */
const markFirstOpened = (): void => {
  if (stored(FIRST_OPENED) === undefined) keep(FIRST_OPENED, String(Math.floor(Date.now() / 1000)))
}

/**
 * Preferences kept in localStorage, read once and held: where storage
 * refuses a change, the change still holds for as long as the page is open.
 */
export const createLocalStoragePreferences = (): Preferences => {
  markFirstOpened()
  const held: { businessDayTurn: BusinessDayTurn; parlorSetting: string | undefined; tokensInHand: string | undefined; consolidationShown: boolean; stageStep: StageStep; figuresUnfolded: Record<GameKind, boolean>; formulaDraft: Record<GameKind, string | undefined> } = {
    businessDayTurn: readBusinessDayTurn(stored(BUSINESS_DAY_TURN)),
    parlorSetting: stored(PARLOR_SETTING),
    tokensInHand: stored(TOKENS_IN_HAND),
    consolidationShown: stored(CONSOLIDATION_SHOWN) === ON,
    stageStep: readStageStep(stored(STAGE_STEP)),
    figuresUnfolded: { pachinko: stored(FIGURES_UNFOLDED.pachinko) === ON, pachislot: stored(FIGURES_UNFOLDED.pachislot) === ON },
    formulaDraft: { pachinko: stored(FORMULA_DRAFT.pachinko), pachislot: stored(FORMULA_DRAFT.pachislot) },
  }
  return {
    businessDayTurn: () => held.businessDayTurn,
    setBusinessDayTurn: (turn) => {
      held.businessDayTurn = turn
      keep(BUSINESS_DAY_TURN, String(turn))
    },
    parlorSetting: () => held.parlorSetting,
    setParlorSetting: (written) => {
      held.parlorSetting = written
      keep(PARLOR_SETTING, written)
    },
    tokensInHand: () => held.tokensInHand,
    setTokensInHand: (written) => {
      held.tokensInHand = written
      if (written === undefined) forget(TOKENS_IN_HAND)
      else keep(TOKENS_IN_HAND, written)
    },
    formulaDraft: (gameKind) => held.formulaDraft[gameKind],
    setFormulaDraft: (gameKind, written) => {
      held.formulaDraft[gameKind] = written
      if (written === undefined) forget(FORMULA_DRAFT[gameKind])
      else keep(FORMULA_DRAFT[gameKind], written)
    },
    figuresUnfolded: (gameKind) => held.figuresUnfolded[gameKind],
    setFiguresUnfolded: (gameKind, unfolded) => {
      held.figuresUnfolded[gameKind] = unfolded
      keep(FIGURES_UNFOLDED[gameKind], unfolded ? ON : "off")
    },
    consolidationShown: () => held.consolidationShown,
    setConsolidationShown: (shown) => {
      held.consolidationShown = shown
      keep(CONSOLIDATION_SHOWN, shown ? ON : "off")
    },
    stageStep: () => held.stageStep,
    setStageStep: (step) => {
      held.stageStep = step
      keep(STAGE_STEP, String(step))
    },
  }
}
