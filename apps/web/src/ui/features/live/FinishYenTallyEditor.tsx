import { Show, type Accessor, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import type { PlayTerms } from "../../../core/parlor/terms"
import { tokenKindOf, type PlayGameKind, type PlayId } from "../../../core/play/play"
import type { TallyAside, YenTally } from "../../../core/tally/tally"
import { TextField } from "../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { formatTokens, tokenUnit } from "../../wording/numbers"
import type { SubmitWords } from "./finish-tally-reading"
import { createFinishYenTallyEditing } from "./finish-yen-tally-editing"
import { heldIn, type FinishYenTallyForm } from "./finish-yen-tally-form"
import { FinishTallyForm } from "./FinishTallyForm"
import type { WorthAt } from "./followed-worth"
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
  /** What the play comes to finished as said above the form, asked again as what is typed here changes. */
  readonly worthAt: Accessor<WorthAt>
  /** Given the tokens in hand as the play finished, where it is counted by them. */
  readonly submit: (tally: YenTally, held: number | undefined) => Promise<Outcome<unknown>>
  /** Told the tokens in hand as the play finished, where it was counted by them. */
  readonly onRecorded: (tally: YenTally, held: number | undefined) => void
}): JSX.Element {
  const editing = createFinishYenTallyEditing({
    initial: props.initial,
    terms: props.terms,
    parlor: props.parlor,
    playId: props.playId,
    aside: props.aside,
    worthAt: props.worthAt,
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
        : {
            savings: { deducted: editing.deducted },
            afterHand: (
              <div class="flex flex-col gap-2">
                <div class="flex flex-col gap-1.5">
                  <span class="text-xs font-bold tracking-wide text-text-secondary">{`持ち${tokenUnit(tokenKindOf(props.gameKind))}`}</span>
                  <ToggleGroup value={editing.exchanged() ? "exchanged" : "carried"} onChange={(value: string | null) => value !== null && editing.setExchanged(value === "exchanged")} aria-label={`持ち${tokenUnit(tokenKindOf(props.gameKind))}`}>
                    <ToggleGroupItem value="carried">持ち越す（簿外）</ToggleGroupItem>
                    <ToggleGroupItem value="exchanged">景品に交換した</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <Show when={editing.exchanged()}>
                  <div class="grid grid-cols-2 gap-2">
                    <TextField label="特殊景品額" value={editing.specialPrizes()} onChange={editing.setSpecialPrizes} inputMode="numeric" suffix="円" error={editing.tally.problemOf("special-prizes")} invalid={editing.tally.nudged("special-prizes")} onFocus={editing.tally.nudge.settle} />
                    <TextField label="端玉景品額" value={editing.oddPrizes()} onChange={editing.setOddPrizes} inputMode="numeric" suffix="円" placeholder="0" error={editing.tally.problemOf("odd-prizes")} invalid={editing.tally.nudged("odd-prizes")} onFocus={editing.tally.nudge.settle} />
                  </div>
                </Show>
              </div>
            ),
          })}
    />
  )
}
