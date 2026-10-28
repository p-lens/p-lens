import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { changeTerms } from "../../../../application/live-play"
import type { PlayDraft } from "../../../../core/live-play/draft"
import { tierOf } from "../../../../core/parlor/terms"
import { useApp } from "../../../context"
import { useMoves } from "../../../navigation/moves"
import { Button } from "../../../primitives/button"
import { CloseIcon, EditIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping } from "../../../primitives/text-field"
import { describeError } from "../../../wording/errors"
import { useStartForm } from "../../live/start-form"
import { readTerms, termsFormOf, type TermsField, type TermsForm } from "../../live/start-terms"
import { Terms } from "../start/Terms"
import { cabinetText } from "../../../wording/cabinet"
import { seal } from "../../../../mummer"
import type { PlayHold } from "../../live/play-hold"

const CHANGE_TERMS = "レートを変更する"

const CHANGE_CABINET = "台番号・機種を変更する"

/** How a word with a pencil beside it is drawn, the two as one button no taller than the word. */
const PENCILLED = "group flex h-5 items-center gap-1 rounded-[3px] text-xs font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-3.5"

/** The same word where nothing of it can be changed, a play another device holds: as high, and with no pencil. */
const UNPENCILLED = "flex h-5 items-center text-xs font-bold text-text-primary"

/**
 * The corner a play is on, above everything counted from it, in a line no
 * taller than its words, with a pencil beside it and nothing of its terms: the terms typed as the play began were another corner's, or
 * the person has moved, and nothing below reads right until they are set
 * right. Pressed, the terms are set out to be typed over as they are when a
 * play starts, in a card that spreads open downwards, under a cross that puts them away unchanged; applied, the play is counted anew on them, and they are the
 * day's for the next play too. A play with no terms says so where its
 * corner would be, and is given some the same way. Across from the corner
 * is the cabinet's number, with its own pencil: it leads to where the
 * cabinet and the machine the play is on are said anew. Between the two
 * the line is empty, and holds what it is given to. A play another device
 * holds has the corner and the cabinet with no pencils.
 */
export function CornerTerms(props: { readonly draft: PlayDraft; readonly hold: PlayHold; readonly between: JSX.Element }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const [look, setLook] = createSignal<"standing" | "changing">("standing")
  const [form, setForm] = createSignal<TermsForm>(start.form().terms.pachinko)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const nudge = createNudge()
  const problems = (): readonly TermsField[] => {
    const read = readTerms(form(), "pachinko")
    return read.ok ? [] : read.error
  }
  const open = (): void => {
    const terms = props.draft.venue.terms
    setForm(terms === undefined ? start.form().terms.pachinko : termsFormOf(terms, "pachinko"))
    setFailure(undefined)
    setLook("changing")
  }
  const apply = async (): Promise<void> => {
    settleTyping()
    const read = readTerms(form(), "pachinko")
    if (!read.ok) {
      nudge.nudge()
      return
    }
    const changed = await changeTerms(app.services.drafts, props.draft, read.value)
    if (!changed.ok) {
      setFailure(changed.error)
      return
    }
    start.update({ terms: { ...start.form().terms, pachinko: form() } })
    setLook("standing")
    app.played()
  }
  const corner = (): string => (props.draft.venue.terms === undefined ? "レート指定なし" : `${tierOf("pachinko", props.draft.venue.terms)}コーナー`)
  const cabinet = (): string => cabinetText(props.draft.cabinetNumber === undefined ? undefined : seal.cabinet(props.draft.cabinetNumber))
  return (
    <Show
      when={look() === "changing" && props.hold.type === "held"}
      fallback={
        <div class="flex items-center justify-between gap-2">
          <Show when={props.hold.type === "held"} fallback={<span class={UNPENCILLED}>{corner()}</span>}>
            <button type="button" onClick={open} class={PENCILLED}>
              {corner()}
              <span class="text-text-secondary group-hover:text-text-primary">
                <EditIcon label={CHANGE_TERMS} />
              </span>
            </button>
          </Show>
          {props.between}
          <Show when={props.hold.type === "held"} fallback={<span class={UNPENCILLED}>{cabinet()}</span>}>
            <button type="button" onClick={() => moves.go({ kind: "live-cabinet", playId: props.draft.id })} class={PENCILLED}>
              {cabinet()}
              <span class="text-text-secondary group-hover:text-text-primary">
                <EditIcon label={CHANGE_CABINET} />
              </span>
            </button>
          </Show>
        </div>
      }
    >
      <div class="grid animate-[spread_260ms_ease-out]">
        <div class="min-h-0 overflow-hidden">
          <div class="flex flex-col gap-2 rounded-md border border-border p-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-bold text-text-primary">レートを変更</p>
              <button type="button" onClick={() => setLook("standing")} class="flex size-6 items-center justify-center rounded-[3px] text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4">
                <CloseIcon label="レートの変更をやめる" />
              </button>
            </div>
            <Terms form={form()} invalid={nudge.red() ? problems() : []} onFocus={nudge.settle} onChange={setForm} />
            <Show when={failure()} keyed>
              {(error) => (
                <p role="alert" class="text-xs text-negative">
                  {describeError(error)}
                </p>
              )}
            </Show>
            <div class="flex justify-end">
              <Button size="small" onClick={() => void apply()}>
                このレートで計算し直す
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
