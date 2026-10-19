import { createResource, untrack, type Accessor } from "solid-js"

import { loadLatestTerms } from "../../../application/live-play"
import type { PlayGameKind } from "../../../core/play/play"
import { useApp } from "../../context"
import { useStartForm } from "../live/start-form"
import { termsFormOf } from "../live/start-terms"
import { calculatorFormOf, type CalculatorForm } from "./calculator-form"

/**
 * The calculator of a game as it opens: on the terms of the latest play
 * of the game still kept on the device, the corner a person is most likely
 * at; where none is, on the day's terms at the start of a play, so it
 * never opens on a blank. Undefined until the plays are read; typing
 * at the start of a play meanwhile does not open it again.
 */
export const useOpeningCalculator = (gameKind: PlayGameKind): Accessor<CalculatorForm | undefined> => {
  const app = useApp()
  const start = useStartForm()
  const [latest] = createResource(() => loadLatestTerms(app.services.drafts, gameKind))
  return () => {
    const found = latest()
    if (found === undefined) return undefined
    const terms = found.ok ? found.value : undefined
    return calculatorFormOf(terms === undefined ? untrack(() => start.form().terms[gameKind]) : termsFormOf(terms, gameKind))
  }
}
