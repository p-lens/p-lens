import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { changeTerms } from "../../../../application/live-play"
import type { PlayDraft } from "../../../../core/live-play/draft"
import { tierOf } from "../../../../core/parlor/terms"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { EditIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping } from "../../../primitives/text-field"
import { describeError } from "../../../wording/errors"
import { useStartForm } from "../../live/start-form"
import { readTerms, termsFormOf, type TermsField, type TermsForm } from "../../live/start-terms"
import { Terms } from "../start/Terms"

const CHANGE_TERMS = "レートを変更する"

/**
 * The corner a play is on, above everything counted from it, with a pencil
 * beside it and nothing of its terms: the terms typed as the play began were another corner's, or
 * the person has moved, and nothing below reads right until they are set
 * right. Pressed, the terms are set out to be typed over as they are when a
 * play starts; applied, the play is counted anew on them, and they are the
 * day's for the next play too. A play with no terms says so where its
 * corner would be, and is given some the same way.
 */
export function CornerTerms(props: { readonly draft: PlayDraft }): JSX.Element {
  const app = useApp()
  const start = useStartForm()
  const [look, setLook] = createSignal<"standing" | "changing">("standing")
  const [form, setForm] = createSignal<TermsForm>(start.form().terms.slot)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const nudge = createNudge()
  const problems = (): readonly TermsField[] => {
    const read = readTerms(form())
    return read.ok ? [] : read.error
  }
  const open = (): void => {
    const terms = props.draft.venue.terms
    setForm(terms === undefined ? start.form().terms.slot : termsFormOf(terms))
    setFailure(undefined)
    setLook("changing")
  }
  const apply = async (): Promise<void> => {
    settleTyping()
    const read = readTerms(form())
    if (!read.ok) {
      nudge.nudge()
      return
    }
    const changed = await changeTerms(app.services.drafts, props.draft, read.value)
    if (!changed.ok) {
      setFailure(changed.error)
      return
    }
    start.update({ terms: { ...start.form().terms, slot: form() } })
    setLook("standing")
    app.wrote()
  }
  return (
    <Show
      when={look() === "changing"}
      fallback={
        <div class="flex items-center gap-1 text-xs">
          <span class="font-bold text-text-primary">{props.draft.venue.terms === undefined ? "レート指定なし" : `${tierOf("slot", props.draft.venue.terms)}コーナー`}</span>
          <button
            type="button"
            onClick={open}
            class="flex size-8 shrink-0 items-center justify-center rounded-[3px] text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4"
          >
            <EditIcon label={CHANGE_TERMS} />
          </button>
        </div>
      }
    >
      <div class="flex flex-col gap-2 rounded-md border border-border p-3">
        <Terms form={form()} invalid={nudge.red() ? problems() : []} onFocus={nudge.settle} onChange={setForm} />
        <Show when={failure()} keyed>
          {(error) => (
            <p role="alert" class="text-xs text-negative">
              {describeError(error)}
            </p>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="small" onClick={() => setLook("standing")}>
            やめる
          </Button>
          <Button size="small" onClick={() => void apply()}>
            このレートで計算し直す
          </Button>
        </div>
      </div>
    </Show>
  )
}
