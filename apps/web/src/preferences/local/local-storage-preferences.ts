import { type BusinessDayTurn, readBusinessDayTurn } from "../../core/calendar/calendar"
import type { GameKind } from "../../core/catalog/catalog"
import type { Preferences } from "../port/preferences"

const BUSINESS_DAY_TURN = "p-lens.business-day-turn"
const PARLOR_SETTING = "p-lens.parlor-setting"
const CONSOLIDATION_SHOWN = "p-lens.consolidation-shown"
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
 * Preferences kept in localStorage, read once and held: where storage
 * refuses a change, the change still holds for as long as the page is open.
 */
export const createLocalStoragePreferences = (): Preferences => {
  const held: { businessDayTurn: BusinessDayTurn; parlorSetting: string | undefined; consolidationShown: boolean; formulaDraft: Record<GameKind, string | undefined> } = {
    businessDayTurn: readBusinessDayTurn(stored(BUSINESS_DAY_TURN)),
    parlorSetting: stored(PARLOR_SETTING),
    consolidationShown: stored(CONSOLIDATION_SHOWN) === ON,
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
    formulaDraft: (gameKind) => held.formulaDraft[gameKind],
    setFormulaDraft: (gameKind, written) => {
      held.formulaDraft[gameKind] = written
      if (written === undefined) forget(FORMULA_DRAFT[gameKind])
      else keep(FORMULA_DRAFT[gameKind], written)
    },
    consolidationShown: () => held.consolidationShown,
    setConsolidationShown: (shown) => {
      held.consolidationShown = shown
      keep(CONSOLIDATION_SHOWN, shown ? ON : "off")
    },
  }
}
