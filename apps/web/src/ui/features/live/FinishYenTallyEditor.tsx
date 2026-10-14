import { createSignal, Show, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import type { ParlorList } from "../../../core/parlor/shared"
import type { TallyAside, YenTally } from "../../../core/tally/tally"
import { tokenKindOf, type PlayId } from "../../../core/play/play"
import { enterLeavesField } from "../../primitives/enter-leaves"
import { TextField } from "../../primitives/text-field"
import { tokenUnit } from "../../wording/numbers"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { IN_HAND_LABELS, type SubmitWords } from "../record-tally/form"
import { createYenTallyEditing, type YenTallyEditing } from "../record-tally/yen-tally-editing"
import { DayAndHours, EntryAndSubmit, MachineField, ParlorField, ResultAndWeighing, SidesFields } from "../record-tally/YenTallyFields"
import { heldIn, sidesFromTokens, type YenTallyForm, type TokenCounts } from "../record-tally/yen-tally-form"

/** The tokens a play was begun with and had left, where it counted them: what is typed here is put into its two sides at once, and they may still be typed over. */
function TokenCountFields(props: { readonly editing: YenTallyEditing; readonly counts: TokenCounts; readonly onCount: (typed: Pick<TokenCounts, "carriedIn"> | Pick<TokenCounts, "held">) => void }): JSX.Element {
  const kind = (): ReturnType<typeof tokenKindOf> => tokenKindOf(props.editing.form().gameKind)
  return (
    <div class="grid grid-cols-2 gap-x-3 gap-y-4">
      <TextField label={IN_HAND_LABELS[kind()].carriedIn} value={props.counts.carriedIn} onChange={(carriedIn) => props.onCount({ carriedIn })} inputMode="numeric" suffix={tokenUnit(kind())} onFocus={props.editing.nudge.settle} />
      <TextField label={IN_HAND_LABELS[kind()].left} value={props.counts.held} onChange={(held) => props.onCount({ held })} inputMode="numeric" suffix={tokenUnit(kind())} onFocus={props.editing.nudge.settle} />
    </div>
  )
}

/**
 * The form a play followed live at no parlor is recorded with, by its
 * totals in yen: filled in from its log, its game the one it was followed
 * as and not to be changed here, and — where its terms count
 * tokens — by the tokens it was begun with and had left, which its two
 * sides are worked out from.
 */
export function FinishYenTallyEditor(props: {
  readonly context: RecordingContext
  /** The parlor list and this device's submissions: with the book's own parlors, all a tally may be said to be at. */
  readonly list: ParlorList
  readonly submissions: readonly KeptSubmission[]
  readonly initial: YenTallyForm
  readonly playId: PlayId
  /** What is written beside the tally: when its play began and finished, as said above the form, and what the play's log measured. */
  readonly aside: () => TallyAside
  readonly words: SubmitWords
  /** The tokens the play is counted by, where it has terms to count them on. */
  readonly tokens: TokenCounts | undefined
  readonly submit: (tally: YenTally) => Promise<Outcome<unknown>>
  /** Told the tokens in hand as the play finished, where it was counted by them. */
  readonly onRecorded: (tally: YenTally, held: number | undefined) => void
}): JSX.Element {
  const [counts, setCounts] = createSignal<TokenCounts | undefined>(props.tokens)
  const editing = createYenTallyEditing({
    context: props.context,
    list: props.list,
    submissions: props.submissions,
    initial: props.initial,
    playIdOn: () => props.playId,
    aside: props.aside,
    refused: "recording",
    leftFrom: (game) => ({ type: "start", game }),
    submit: props.submit,
    onRecorded: (tally) => props.onRecorded(tally, ((counted) => (counted === undefined ? undefined : heldIn(counted)))(counts())),
  })
  /** Types a count, and puts what the counts now come to in the two sides where they come to them. */
  const count = (typed: Pick<TokenCounts, "carriedIn"> | Pick<TokenCounts, "held">): void => {
    const before = counts()
    if (before === undefined) return
    const after = { ...before, ...typed }
    setCounts(after)
    const sides = sidesFromTokens(after)
    if (sides !== undefined) editing.setForm((current) => ({ ...current, ...sides }))
  }
  return (
    <form autocomplete="off" class="flex flex-col gap-5 p-4" noValidate onSubmit={(event) => void editing.submit(event)} onKeyDown={enterLeavesField}>
      <div class="flex flex-col gap-5">
        <DayAndHours editing={editing} />
        <ParlorField editing={editing} />
      </div>
      <MachineField editing={editing} />
      <Show when={counts()}>{(counted) => <TokenCountFields editing={editing} counts={counted()} onCount={count} />}</Show>
      <SidesFields editing={editing} />
      <ResultAndWeighing editing={editing} />
      <EntryAndSubmit editing={editing} words={props.words} />
    </form>
  )
}
