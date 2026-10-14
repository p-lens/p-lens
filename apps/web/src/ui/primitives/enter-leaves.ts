import { settleTyping } from "./text-field"

/**
 * Keeps Enter in a form's field from sending the form: it leaves the field
 * instead, so a phone's keyboard goes and what was typed is tidied, and only
 * the form's own button sends it. For a form whose last field is seldom the
 * last thing done on it.
 */
export const enterLeavesField = (event: KeyboardEvent): void => {
  if (event.key !== "Enter" || event.isComposing || !(event.target instanceof HTMLInputElement)) return
  event.preventDefault()
  settleTyping()
}
