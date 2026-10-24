import { createMemo, createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { addCheckpoints, reviseCheckpoints } from "../../../../application/live-play"
import type { PachinkoDraft } from "../../../../core/live-play/draft"
import { checkpointsForRapid, checkpointsForReading, type Reading, type ReadingRefusal, type SupportPhase } from "../../../../core/pachinko/reading"
import { standingBefore, takenOf, withReadingRemoved } from "../../../../core/pachinko/revision"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import type { Result } from "../../../../core/result/result"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge } from "../../../primitives/nudge"
import { holdTheEnd } from "../../../primitives/scroll-end"
import { Select } from "../../../primitives/select"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { feelTap } from "../../../primitives/vibration"
import { describeError, describeReadingRefusal } from "../../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../../wording/fields"
import { BACK_TO_REGULAR, COUNT_HAND_LATER, SUPPORT_END_ASKS, SUPPORT_NAMES, switchToText } from "../../../wording/pachinko/play"
import { jackpotOptions, useBonuses, usualOverOf } from "./bonus-choice"
import { DriftButton } from "./DriftButton"
import { OverButton } from "./OverButton"
import { NO_JACKPOT, readingFrom, readRunJackpot, readSupportEnd, saysNothingNew, type ReadingField, type ReadingForm, type ReadingProblem } from "./reading-form"

/** Where the bar is: taking the jackpots of a run, or the counter as the 電サポ ends. */
type Step = { readonly type: "running" } | { readonly type: "ending" }

/** Where an entry on the bar is: being typed, being kept, refused, or failed to be kept. */
type Sending =
  | { readonly type: "typing" }
  | { readonly type: "keeping" }
  | { readonly type: "refused"; readonly refusal: ReadingRefusal }
  | { readonly type: "failed"; readonly error: ApplicationError }

const OTHER_PHASE: Readonly<Record<SupportPhase, SupportPhase>> = { special: "rapid", rapid: "special" }

/**
 * What takes the place of the reading form while the 電サポ runs after a
 * jackpot: a bar as loud as the screen allows, saying the state the log
 * says it is in — 確変 from each jackpot, 時短 once switched — so that no
 * reading is typed as if in regular games under it, the next jackpot of
 * the run chosen beneath it with no counter asked, and [通常に戻る], which
 * asks for the counter as the 電サポ ends: the spins it ran for, which part
 * a play's regular games from its own. The balls in hand are asked for
 * there too, since that is when they have settled, but never required:
 * the field opens on what they come to by the last count and the bonuses
 * paid since, as a guide only — left as it is, nothing was counted, and
 * only a count typed over it is kept as one.
 *
 * Switching to 時短 writes the turn at once, so that the others in a
 * huddle see it; switching back takes that line away again, since a run
 * goes back to 確変 only by a jackpot — so a run has one turn however
 * often the bar is pressed, and none while one is being kept.
 */
export function SupportComposer(props: { readonly draft: PachinkoDraft; readonly ordered: readonly Checkpoint[]; readonly phase: SupportPhase }): JSX.Element {
  const app = useApp()
  const bonuses = useBonuses(() => props.draft)
  const before = createMemo(() => standingBefore(props.ordered, takenOf(props.ordered).length))
  const phase = (): SupportPhase => props.phase
  const [step, setStep] = createSignal<Step>({ type: "running" })
  const [form, setForm] = createSignal<ReadingForm>(readingFrom(props.phase, before()))
  const [sending, setSending] = createSignal<Sending>({ type: "typing" })
  const nudge = createNudge()
  const change = (changed: Partial<ReadingForm>): void => {
    setForm((current) => ({ ...current, ...changed }))
    setSending({ type: "typing" })
  }
  const read = (): Result<Omit<Reading, "at">, readonly ReadingProblem[]> =>
    step().type === "ending" ? readSupportEnd(form(), before(), phase()) : readRunJackpot(form(), bonuses(), before(), phase())
  const nudged = (field: ReadingField): boolean => {
    const found = read()
    return nudge.red() && !found.ok && found.error.some((problem) => problem.field === field)
  }
  const unread = (): boolean => {
    const found = read()
    return !found.ok && found.error.some((problem) => problem.reason === "not-a-count")
  }
  const startEnding = (): void => {
    change({ counter: "", held: ((held) => (held === undefined ? "" : String(held)))(before().held), heldCarried: before().held !== undefined, supported: "", drift: "loss" })
    setStep({ type: "ending" })
  }
  const stopEnding = (): void => {
    change(readingFrom(phase(), before()))
    setStep({ type: "running" })
  }

  const send = async (): Promise<void> => {
    settleTyping()
    const reading = read()
    if (sending().type === "keeping") return
    if (!reading.ok || (step().type === "running" && saysNothingNew(reading.value, before()))) {
      nudge.nudge()
      return
    }
    const checkpoints = checkpointsForReading(props.ordered, { ...reading.value, at: app.services.now() }, false)
    if (!checkpoints.ok) {
      setSending({ type: "refused", refusal: checkpoints.error })
      return
    }
    setSending({ type: "keeping" })
    const kept = await addCheckpoints(app.services.drafts, props.draft, checkpoints.value)
    if (!kept.ok) {
      setSending({ type: "failed", error: kept.error })
      return
    }
    setStep({ type: "running" })
    const after = [...props.ordered, ...checkpoints.value]
    setForm(readingFrom("special", standingBefore(after, takenOf(after).length)))
    setSending({ type: "typing" })
    toast(reading.value.jackpot.type === "none" && reading.value.held === undefined ? { title: "記録しました", description: COUNT_HAND_LATER } : { title: "記録しました", stays: "glance" })
    app.played()
  }

  /** Turns the run to 時短, or takes the turn back where it is in 時短: never while something is being kept, so a press twice over writes once. */
  const switchPhase = async (): Promise<void> => {
    if (sending().type === "keeping") return
    const made = phase() === "special" ? checkpointsForRapid(props.ordered, app.services.now()) : withReadingRemoved(props.ordered, takenOf(props.ordered).length - 1)
    if (!made.ok) return
    setSending({ type: "keeping" })
    const kept = phase() === "special" ? await addCheckpoints(app.services.drafts, props.draft, made.value) : await reviseCheckpoints(app.services.drafts, props.draft, made.value)
    if (!kept.ok) {
      setSending({ type: "failed", error: kept.error })
      return
    }
    setSending({ type: "typing" })
    app.played()
  }

  const held: { form: HTMLFormElement | undefined } = { form: undefined }
  holdTheEnd(() => held.form, () => [sending(), step()])
  return (
    <form
      autocomplete="off"
      ref={(element) => (held.form = element)}
      class="flex flex-col gap-2 border-t border-border bg-surface-2 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <Show when={((current) => (current.type === "refused" ? current.refusal : undefined))(sending())} keyed>
        {(refused) => (
          <p role="alert" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            {describeReadingRefusal(refused)}
          </p>
        )}
      </Show>
      <Show when={((current) => (current.type === "failed" ? current.error : undefined))(sending())} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div
        role="status"
        class="flex h-20 items-center justify-between gap-3 rounded-lg px-4"
        classList={{ "bg-special-banner text-on-special-banner": phase() === "special", "bg-rapid-banner text-on-rapid-banner": phase() === "rapid" }}
      >
        <span class="text-4xl font-black tracking-[0.15em]">{SUPPORT_NAMES[phase()]}</span>
        <Show when={step().type === "running"}>
          <button
            type="button"
            class="shrink-0 rounded-md border-2 border-current px-3 py-1.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-focus-ring"
            onClick={() => {
              feelTap()
              void switchPhase()
            }}
          >
            {switchToText(OTHER_PHASE[phase()])}
          </button>
        </Show>
      </div>
      <Show
        when={step().type === "ending"}
        fallback={
          <>
            <div class="flex items-end gap-1">
              <div class="min-w-0 flex-1">
                <Select label="ボーナス" placeholder="なし" options={jackpotOptions(bonuses())} value={form().jackpot} invalid={nudge.red() && form().jackpot === NO_JACKPOT} onChange={(jackpot) => change({ jackpot, over: usualOverOf(props.draft, bonuses(), jackpot) })} />
              </div>
              <OverButton over={form().over} invalid={nudged("over")} onOver={(over) => change({ over })} onFocus={nudge.settle} />
              <Button type="submit" class="h-10 shrink-0 px-5" onClick={feelTap}>
                記録
              </Button>
            </div>
            <div class="flex justify-end">
              <Button variant="secondary" class="h-10 px-4" onClick={startEnding}>
                {BACK_TO_REGULAR}
              </Button>
            </div>
          </>
        }
      >
        <p class="text-xs text-text-secondary">{SUPPORT_END_ASKS}</p>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5">
          <TextField label="回転数" value={form().counter} onChange={(counter) => change({ counter })} inputMode="numeric" invalid={nudged("counter")} onFocus={nudge.settle} focusedOnShow compact />
          <TextField label="持ち玉" value={form().held} onChange={(held) => change({ held, heldCarried: false })} inputMode="numeric" suffix="玉" invalid={nudged("held")} onFocus={nudge.settle} compact />
          <DriftButton drift={form().drift} supported={form().supported} invalid={nudged("supported")} onDrift={(drift) => change({ drift })} onSupported={(supported) => change({ supported })} onFocus={nudge.settle} />
        </div>
        <Show when={unread()}>
          <p class="text-xs text-negative">{FIELD_PROBLEM_TEXT["not-a-count"]}</p>
        </Show>
        <div class="flex items-end gap-1">
          <Button type="submit" class="h-10 shrink-0 px-5" onClick={feelTap}>
            記録
          </Button>
          <Button variant="ghost" class="h-10 shrink-0 px-1.5" onClick={stopEnding}>
            やめる
          </Button>
        </div>
      </Show>
    </form>
  )
}
