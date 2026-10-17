import { createEffect, createResource, createSignal, on, type Accessor } from "solid-js"

import { toPlainString } from "../../../core/decimal/decimal"
import { theoreticalDecimalOf } from "../../../core/theoretical/theoretical"
import { createDebounced } from "../../primitives/debounce"

/** What a play is worth finished as the form says, for the tokens in hand it says. */
export type WorthAt = (held: number | undefined) => Promise<number | undefined>

/**
 * The theoretical value a finish form shows, worked out again whenever
 * how the play finished — its counter above the form, the tokens in hand
 * in it — has stood still a moment, and written into the form's field.
 * Once the person types the value themselves it is theirs, and no longer
 * written over.
 */
export const createFollowedWorth = (given: { readonly worthAt: Accessor<WorthAt>; readonly held: Accessor<number | undefined>; readonly fill: (typed: string) => void }): { readonly typedByPerson: () => void } => {
  const [by, setBy] = createSignal<"play" | "person">("play")
  const asked = createDebounced(() => ({ worthAt: given.worthAt(), held: given.held() }))
  const [worked] = createResource(asked, (question) => question.worthAt(question.held))
  createEffect(
    on(
      worked,
      (value) => {
        if (by() === "play" && value !== undefined) given.fill(toPlainString(theoreticalDecimalOf(value)))
      },
      { defer: true },
    ),
  )
  return { typedByPerson: () => setBy("person") }
}

/** Tokens in hand as typed into a form: a whole count, or none where it does not read as one. */
export const heldTyped = (typed: string): number | undefined => (/^\d+$/.test(typed.trim()) ? Number(typed.trim()) : undefined)
