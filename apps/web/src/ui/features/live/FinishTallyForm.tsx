import { Match, Show, Switch, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import type { Decimal } from "../../../core/decimal/decimal"
import type { TokenKind } from "../../../core/commodity/commodity"
import { tokenKindOf, type PlayGameKind } from "../../../core/play/play"
import { Button } from "../../primitives/button"
import { Combobox, type ComboboxOption } from "../../primitives/combobox"
import { DetailButton } from "../../primitives/detail-button"
import { enterLeavesField } from "../../primitives/enter-leaves"
import { redText, type Nudge } from "../../primitives/nudge"
import { TextField } from "../../primitives/text-field"
import { describeError } from "../../wording/errors"
import { formatTokens, tokenUnit, type toneOf } from "../../wording/numbers"
import { typedMachineRefused } from "../../wording/parlor"
import { IN_HAND_LABELS, type FieldProblem, type FormField, type SubmitWords } from "./finish-tally-reading"

/** What the tokens drawn from savings are called, for each kind of token. */
const SAVINGS_DRAWN: Readonly<Record<TokenKind, string>> = { ball: "貯玉引出", medal: "貯メダル引出" }

/** How wide a row of the form grows on a screen with room: no wider than four sums read well side by side, the machine and what it all comes to kept to the same. */
const ROW_ON_A_WIDE_SCREEN = "sm:max-w-xl"

/** The fields every play followed live is recorded with, at a parlor or at none. */
type FinishField = "machine" | "cabinetNumber" | "outlay" | "replayPaidOut" | "carriedIn" | "payout" | "theoreticalValue"

/** A play followed live being recorded: what its form holds and reads as, and its recording — all the form shows or changes, whichever book entry it comes to. */
export interface FinishTallyEditing {
  readonly value: (field: FinishField) => string
  readonly set: (field: FinishField) => (typed: string) => void
  readonly problemAt: (field: FormField) => FieldProblem | undefined
  readonly problemOf: (field: FormField) => string | undefined
  readonly nudge: Nudge
  readonly nudged: (field: FormField) => boolean
  readonly machineChoices: () => readonly ComboboxOption[]
  /** Whether a machine, by its book name, is one a person typing this means. */
  readonly machineMatches: (name: string, typed: string) => boolean
  readonly setMachineTyped: (typed: string) => void
  /** Whether the machine field holds a name that was typed and chose no machine. */
  readonly machineTypedOnly: () => boolean
  /** Whether the machine field is red for anything else: none chosen where one must be. */
  readonly machineLacked: () => boolean
  /** Whether the play must name a machine. */
  readonly machineRequired: boolean
  readonly resultText: () => string
  readonly resultTone: () => ReturnType<typeof toneOf> | undefined
  readonly previewText: () => string | undefined
  readonly previewProblem: () => string | undefined
  readonly failure: () => ApplicationError | undefined
  readonly saving: () => boolean
  readonly submit: (event: SubmitEvent) => Promise<void>
}

/**
 * The form a play followed live is recorded with, laid out alike wherever
 * it was played — on its own day, which is not asked: where, then its
 * machine and cabinet side by side, then the cash
 * it spent and the tokens it was begun with and had left, then — always a row
 * of its own — what it all comes to with its theoretical value put away beside it, and the entry it
 * writes. What only a play at a parlor or only one at none is asked stands
 * in its own place: `place` above all, `outlayBeside` under the cash,
 * `savings` after it where tokens are counted, and `takings` instead of the tokens where none are
 * counted.
 */
export function FinishTallyForm(props: {
  readonly editing: FinishTallyEditing
  readonly gameKind: PlayGameKind
  readonly place?: JSX.Element
  readonly outlayBeside?: JSX.Element
  /** What drawing on savings took, where the play counts tokens: the savings field stands after the cash. */
  readonly savings?: { readonly deducted: () => Decimal | undefined }
  readonly takings?: JSX.Element
  /** What follows the tokens in hand, on a row of its own: how they were settled, where that is asked. */
  readonly afterHand?: JSX.Element
  readonly words: SubmitWords
}): JSX.Element {
  const editing = props.editing
  const unit = (): string => tokenUnit(tokenKindOf(props.gameKind))
  const theoretical = (): string => editing.value("theoreticalValue").trim()
  return (
    <form autocomplete="off" class="flex flex-col gap-5 p-4" noValidate onSubmit={(event) => void editing.submit(event)} onKeyDown={enterLeavesField}>
      {props.place}
      <div class={`grid grid-cols-[minmax(0,1fr)_6rem] gap-x-3 ${ROW_ON_A_WIDE_SCREEN}`}>
        <div class="min-w-0">
          <Combobox
            label="機種"
            placeholder={editing.machineRequired ? "機種を選ぶ" : "指定しない"}
            options={editing.machineChoices()}
            value={editing.value("machine") === "" ? undefined : editing.value("machine")}
            onChange={(name) => editing.set("machine")(name ?? "")}
            matches={editing.machineMatches}
            invalid={editing.machineTypedOnly() || editing.machineLacked()}
            onFocus={editing.nudge.settle}
            onTyped={editing.setMachineTyped}
          />
          <Show when={editing.machineTypedOnly()}>
            <p role="alert" class="mt-1.5 text-xs text-negative">
              {typedMachineRefused("recording")}
            </p>
          </Show>
        </div>
        <TextField label="台番号" value={editing.value("cabinetNumber")} onChange={editing.set("cabinetNumber")} inputMode="numeric" />
      </div>
      <div class={`grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 ${ROW_ON_A_WIDE_SCREEN}`}>
        <div class="flex flex-col gap-1">
          <TextField label="投資額" value={editing.value("outlay")} onChange={editing.set("outlay")} inputMode="numeric" suffix="円" error={editing.problemOf("outlay")} invalid={editing.nudged("outlay")} onFocus={editing.nudge.settle} />
          {props.outlayBeside}
        </div>
        <Show when={props.savings} keyed>
          {(savings) => (
            <div class="flex flex-col gap-1">
              <TextField label={SAVINGS_DRAWN[tokenKindOf(props.gameKind)]} value={editing.value("replayPaidOut")} onChange={editing.set("replayPaidOut")} inputMode="numeric" suffix={unit()} error={editing.problemOf("replay-paid-out")} invalid={editing.nudged("replay-paid-out")} onFocus={editing.nudge.settle} />
              <Show when={savings.deducted()} keyed>
                {(deducted) => <span class="text-xs text-text-muted">貯{unit()}減 {formatTokens(deducted, tokenKindOf(props.gameKind))}</span>}
              </Show>
            </div>
          )}
        </Show>
        <Show
          when={props.takings}
          fallback={
            <>
              <TextField label={IN_HAND_LABELS[tokenKindOf(props.gameKind)].carriedIn} value={editing.value("carriedIn")} onChange={editing.set("carriedIn")} inputMode="numeric" suffix={unit()} error={editing.problemOf("carried-in")} invalid={editing.nudged("carried-in")} onFocus={editing.nudge.settle} />
              <TextField label={IN_HAND_LABELS[tokenKindOf(props.gameKind)].left} value={editing.value("payout")} onChange={editing.set("payout")} inputMode="numeric" suffix={unit()} error={editing.problemOf("payout")} invalid={editing.nudged("payout")} onFocus={editing.nudge.settle} />
            </>
          }
        >
          {props.takings}
        </Show>
      </div>
      {props.afterHand}
      <div class={`flex items-start justify-between gap-3 ${ROW_ON_A_WIDE_SCREEN}`}>
        <div class="flex min-w-0 flex-col gap-1.5">
          <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">実収支（自動計算）</span>
          <output class="flex h-10 items-center text-lg font-bold tabular-nums" classList={{ "text-positive": editing.resultTone() === "positive", "text-negative": editing.resultTone() === "negative", "text-text-primary": editing.resultTone() === "neutral", "text-text-muted": editing.resultTone() === undefined }}>
            {editing.resultText()}
          </output>
        </div>
        <DetailButton
          label="期待値"
          says={theoretical() === "" ? "期待値を入力する" : `期待値 ${theoretical()}円`}
          marked={theoretical() !== ""}
          invalid={editing.problemAt("theoretical-value") !== undefined}
          tone="semipro"
          placement="bottom-end"
        >
          <div class="min-w-0 flex-1">
            <TextField label="期待値" value={editing.value("theoreticalValue")} onChange={editing.set("theoreticalValue")} inputMode="decimal" suffix="円" invalid={editing.problemAt("theoretical-value") !== undefined} onFocus={editing.nudge.settle} compact />
          </div>
        </DetailButton>
      </div>
      <section class="flex flex-col gap-2">
        <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">書き込まれる仕訳</h2>
        <Switch fallback={<p class="text-sm text-text-muted">入力を直すと、ここに仕訳が表示されます。</p>}>
          <Match when={editing.previewText()}>
            {(text) => <pre class="overflow-x-auto rounded-md bg-surface-0 p-3 font-mono text-xs leading-relaxed text-text-secondary">{text()}</pre>}
          </Match>
          <Match when={editing.previewProblem()} keyed>
            {(problem) => (
              <p class="text-sm" classList={redText(editing.nudge.red())}>
                {problem}
              </p>
            )}
          </Match>
        </Switch>
      </section>
      <Show when={editing.failure()} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div>
        <Button type="submit">{editing.saving() ? props.words.busy : props.words.idle}</Button>
      </div>
    </form>
  )
}
