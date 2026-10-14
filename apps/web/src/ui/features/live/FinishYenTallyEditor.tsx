import { Show, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import type { PlayTerms } from "../../../core/parlor/terms"
import { tokenKindOf, type PlayGameKind, type PlayId } from "../../../core/play/play"
import type { TallyAside, YenTally } from "../../../core/tally/tally"
import { TextField } from "../../primitives/text-field"
import { formatTokens, tokenUnit } from "../../wording/numbers"
import type { SubmitWords } from "./finish-tally-reading"
import { createFinishYenTallyEditing } from "./finish-yen-tally-editing"
import { heldIn, type FinishYenTallyForm } from "./finish-yen-tally-form"
import { FinishTallyForm } from "./FinishTallyForm"
import type { ParlorChoice } from "./parlor-choice"

/**
 * The form a play followed live at no parlor is recorded with, laid out
 * as one at a parlor is: filled in from its log, its game the one it was
 * followed as. Its book entry is in yen. With terms, its two sides are
 * worked out from the cash spent, the savings the book does not keep that
 * it drew on, and the tokens it was begun with and had left; with none,
 * what came back is typed in yen in the tokens' place.
 */
export function FinishYenTallyEditor(props: {
  readonly initial: FinishYenTallyForm
  readonly gameKind: PlayGameKind
  readonly terms: PlayTerms | undefined
  /** The parlor chosen above the form, where one is: a play with terms at a parlor is not recorded here. */
  readonly parlor: ParlorChoice
  readonly playId: PlayId
  /** What is written beside the tally: when its play began and finished, as said above the form, and what the play's log measured. */
  readonly aside: () => TallyAside
  readonly words: SubmitWords
  readonly submit: (tally: YenTally) => Promise<Outcome<unknown>>
  /** Told the tokens in hand as the play finished, where it was counted by them. */
  readonly onRecorded: (tally: YenTally, held: number | undefined) => void
}): JSX.Element {
  const editing = createFinishYenTallyEditing({
    initial: props.initial,
    terms: props.terms,
    parlor: props.parlor,
    playId: props.playId,
    aside: props.aside,
    submit: props.submit,
    onRecorded: (tally) => props.onRecorded(tally, props.terms === undefined ? undefined : heldIn({ payout: editing.payout() })),
  })
  return (
    <FinishTallyForm
      editing={editing.tally}
      gameKind={props.gameKind}
      words={props.words}
      outlayBeside={
        <Show when={editing.rented()} keyed>
          {(rented) => <span class="text-xs text-text-muted">貸{tokenUnit(tokenKindOf(props.gameKind))} {formatTokens(rented, tokenKindOf(props.gameKind))}</span>}
        </Show>
      }
      {...(props.terms === undefined
        ? { takings: <TextField label="回収額" value={editing.takings()} onChange={editing.setTakings} inputMode="numeric" suffix="円" error={editing.tally.problemOf("takings")} invalid={editing.tally.nudged("takings")} onFocus={editing.tally.nudge.settle} /> }
        : { savings: { deducted: editing.deducted } })}
    />
  )
}
