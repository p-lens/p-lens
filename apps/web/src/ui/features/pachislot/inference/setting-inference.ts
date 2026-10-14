import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js"

import { inferSettingLevels, type SettingInference } from "../../../../application/pachislot/setting-inference"
import type { FormulaSnapshot } from "../../../../core/pachislot/snapshot"
import type { MedalTerms, SettingTold } from "../../../../core/pachislot/told"
import { useApp } from "../../../context"

/** A told play to read the setting level of: by which formula, what was told of it, and on what terms. */
export interface SettingAsked {
  readonly formula: FormulaSnapshot
  readonly told: SettingTold
  readonly terms: MedalTerms
}

interface SettingInferer {
  readonly inference: Accessor<SettingInference>
  readonly infer: () => void
}

/** How long a reading is said to be under way at the least, in milliseconds: one that comes back at once, pressed again and again, would flicker its answer away and back. */
const INFERRING_SHOWN_FOR = 200

const shownFor = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

const saying = (asked: SettingAsked): string => JSON.stringify({ formula: asked.formula.id, told: asked.told, terms: asked.terms })

/**
 * A told play's setting level, read when the press is pressed and for as
 * long as the form says what it said then: a change to anything the reading
 * stood on lets it go, so a figure never outlives what it was read from.
 */
export const createSettingInference = (asked: () => SettingAsked | undefined): SettingInferer => {
  const app = useApp()
  const [inference, setInference] = createSignal<SettingInference>({ type: "resting" })
  const said = createMemo(() => ((now) => (now === undefined ? undefined : saying(now)))(asked()))
  const [pressed, setPressed] = createSignal<{ readonly said: string | undefined; readonly press: number }>({ said: undefined, press: 0 })
  createEffect(() => {
    const now = said() !== undefined && said() === pressed().said ? untrack(asked) : undefined
    if (now === undefined) {
      setInference({ type: "resting" })
      return
    }
    const held = { live: true }
    onCleanup(() => {
      held.live = false
    })
    setInference({ type: "inferring" })
    void Promise.all([inferSettingLevels(app.services.pachislot, now.formula, now.told, now.terms), shownFor(INFERRING_SHOWN_FOR)]).then(([found]) => {
      if (held.live) setInference(found.ok ? { type: "inferred", inferred: found.value } : { type: "failed", error: found.error })
    })
  })
  return { inference, infer: () => setPressed((before) => ({ said: said(), press: before.press + 1 })) }
}
