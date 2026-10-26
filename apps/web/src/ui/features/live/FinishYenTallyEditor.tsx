import { For, Show, type Accessor, type JSX } from "solid-js"

import type { Outcome } from "../../../application/errors"
import type { PlayTerms } from "../../../core/parlor/terms"
import { tokenKindOf, type PlayGameKind, type PlayId } from "../../../core/play/play"
import type { TallyAside, YenTally } from "../../../core/tally/tally"
import { TextField } from "../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { formatTokens, formatYen, tokenUnit } from "../../wording/numbers"
import { EXCHANGE_OFF_THE_RATE } from "../../wording/tallies"
import type { SubmitWords } from "./finish-tally-reading"
import { createFinishYenTallyEditing } from "./finish-yen-tally-editing"
import { heldIn, type FinishYenTallyForm } from "./finish-yen-tally-form"
import { FinishTallyForm } from "./FinishTallyForm"
import type { WorthAt } from "./followed-worth"
import type { ParlorChoice } from "./parlor-choice"
import { seal } from "../../../mummer"

/** The prizes an exchange asks for, opening downward and fading in as 景品に交換した is pressed. */
function Unfolding(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="grid animate-[spread_260ms_ease-out]">
      <div class="-m-1 min-h-0 overflow-hidden p-1">
        <div class="flex flex-col gap-1">{props.children}</div>
      </div>
    </div>
  )
}

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
  /** Whether the tokens in hand open on what is likely in hand rather than a count, which is said under them. */
  readonly heldLikely: boolean
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
      parlor={props.parlor.chosen()?.identity}
      heldLikely={props.heldLikely}
      words={props.words}
      outlayBeside={
        <Show when={editing.rented()} keyed>
          {(rented) => <span class="text-xs text-text-muted">貸{tokenUnit(tokenKindOf(props.gameKind))} {formatTokens(seal.play(rented), tokenKindOf(props.gameKind))}</span>}
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
                  <Unfolding>
                    <div class="grid grid-cols-2 gap-2">
                      <TextField label="交換数" value={editing.exchangedTokens()} onChange={editing.setExchangedTokens} inputMode="numeric" suffix={tokenUnit(tokenKindOf(props.gameKind))} error={editing.tally.problemOf("exchanged-tokens")} invalid={editing.tally.nudged("exchanged-tokens")} onFocus={editing.tally.nudge.settle} />
                      <TextField label="特殊景品額" value={editing.specialPrizes()} onChange={editing.setSpecialPrizes} inputMode="numeric" suffix="円" error={editing.tally.problemOf("special-prizes")} invalid={editing.tally.nudged("special-prizes")} onFocus={editing.tally.nudge.settle} />
                    </div>
                    <Show when={editing.oddPrizes()} keyed>
                      {(odd) => <span class="text-xs text-text-muted">端玉景品 {formatYen(seal.play(odd))}（貸出レートで）</span>}
                    </Show>
                    <Show when={editing.offTheRate()}>
                      <p class="flex flex-col text-xs text-warning">
                        <For each={EXCHANGE_OFF_THE_RATE}>{(line) => <span>{line}</span>}</For>
                      </p>
                    </Show>
                  </Unfolding>
                </Show>
              </div>
            ),
          })}
    />
  )
}
