import { createMemo, createSignal, For, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { addCheckpoints, reviseCheckpoints } from "../../../../application/live-play"
import type { PachinkoDraft, PlayDraft } from "../../../../core/live-play/draft"
import { checkpointsForReading, type ReadingRefusal } from "../../../../core/pachinko/reading"
import { handDriftOf, RECOUNT_AFTER, type HandDrift } from "../../../../core/pachinko/consumption"
import { rentalPressOf } from "../../../../core/pachinko/rental-press"
import { reliefDriveCounter, standingBefore, takenOf, withReadingInserted, withReadingRemoved, withReadingRevised, type Before, type RevisionRefusal, type Taken } from "../../../../core/pachinko/revision"
import { cornerOf, savingsDeductedFor } from "../../../../core/parlor/terms"
import type { Checkpoint, Phase } from "../../../../core/play-log/checkpoint"
import { useApp } from "../../../context"
import { useCornerPresses } from "../../live/corner-presses"
import { Button } from "../../../primitives/button"
import { TrashIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { holdTheEnd } from "../../../primitives/scroll-end"
import { Select } from "../../../primitives/select"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { feelTap } from "../../../primitives/vibration"
import { describeError, describeReadingRefusal } from "../../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../../wording/fields"
import { amountText } from "../../../wording/numbers"
import { CHANGED_SINCE_REMOVED, describeRevisionRefusal, PHASE_NAMES, recountText, READING_REMOVED, REMOVAL_TAKEN_BACK, REMOVE_READING, RELIEF_DRIVE_REACHED, TAKE_BACK, TAKE_BACK_FAILED, JACKPOT_HELD_NOTE } from "../../../wording/pachinko/play"
import { jackpotOptions, useBonuses, usualOverOf } from "./bonus-choice"
import { DriftButton } from "./DriftButton"
import { PressButton } from "./PressButton"
import { OverButton } from "./OverButton"
import { formOfReading, readingFrom, readReadingForm, readReliefDrive, saysNothingNew, withMore, type ReadingField, type ReadingForm } from "./reading-form"
import { seal } from "../../../../mummer"

/** Where an entry of a reading is: being typed, being kept, refused, or failed to be kept. */
type Sending =
  | { readonly type: "typing" }
  | { readonly type: "keeping" }
  | { readonly type: "refused"; readonly refusal: ReadingRefusal; readonly toReliefDrive: boolean }
  | { readonly type: "unrevisable"; readonly refusal: RevisionRefusal }
  | { readonly type: "failed"; readonly error: ApplicationError }

const PHASES: readonly Phase[] = ["regular", "special", "rapid"]

/** Tokens a press of the savings button draws where the play has no terms to say: half of what ¥1,000 rents at the dearest rate. */
const USUAL_DRAW = 125

/**
 * Where readings are typed at the cabinet in regular games, one press
 * keeping each — the 電サポ after a jackpot has a bar of its own
 * (`SupportComposer`): the counter as the parlor shows it, the
 * balls in hand where they were counted, what the 電サポ gained or lost —
 * behind a small button, since few readings have any —
 * and what was rented or drawn from savings since the reading before —
 * each of those two with a button that puts one press's worth in its
 * field, typed over for more at once: a rental press is the cabinet's own,
 * a draw what the corner's terms say a replay pays out, and what a draw
 * takes off the savings, fee and all, is said under it. Choosing a bonus makes the reading a
 * jackpot: the counter and the balls in hand are then as they stood when
 * the bonus came, before it paid — said under the bonus always, so that
 * the form keeps its shape and the hand is never typed with the bonus in it.
 *
 * Given a reading already taken, it is that reading typed again, to be
 * set right or taken away; given a place among the readings, what is typed
 * is put in there, a reading never written down. Either is in whichever
 * state the cabinet was in, so the state is chosen there. Either way every
 * line after it is made again.
 */
export function ReadingComposer(props: {
  readonly draft: PachinkoDraft
  readonly ordered: readonly Checkpoint[]
  /** The reading being set right, by its place among the play's readings; none while a new one is typed. */
  readonly revising: { readonly index: number; readonly taken: Taken } | undefined
  /** Where a reading that was never written down is being put in: before the reading at `before`, at the moment of the one it follows. */
  readonly inserting: { readonly before: number; readonly at: string } | undefined
  readonly onRevised: () => void
  /** Asked while a reading is being set right: put one in before it instead. */
  readonly onInsertBefore: (index: number) => void
  /** The spins the machine's 遊タイム comes at, for a machine with one: a new reading may then say it was reached. */
  readonly reliefDrive: number | undefined
}): JSX.Element {
  const app = useApp()
  const bonuses = useBonuses(() => props.draft)
  const corner = useCornerPresses(
    () => props.draft.bookId,
    () => cornerOf("pachinko", props.draft.venue.terms),
  )
  const setPress = corner.set
  const press = (): number => corner.presses().rental ?? rentalPressOf(props.draft.venue.terms)
  const draw = (): number => corner.presses().draw ?? props.draft.venue.terms?.replay.paidOut ?? USUAL_DRAW
  /** Where the play stood before the reading being typed: before the one set right, at the place one is put in, or after them all. */
  const beforeIn = (ordered: readonly Checkpoint[]): Before => standingBefore(ordered, props.revising?.index ?? props.inserting?.before ?? takenOf(ordered).length)
  const before = createMemo(() => beforeIn(props.ordered))
  /** How far the hand has been played since it was last counted, while a new reading carries it over unchanged and long enough to be worth counting again. */
  const recount = (): HandDrift | undefined => {
    const terms = props.draft.venue.terms
    if (props.revising !== undefined || props.inserting !== undefined || !form().heldCarried || terms === undefined) return undefined
    const drift = handDriftOf(props.ordered, terms, before().held)
    return drift !== undefined && drift.spins >= RECOUNT_AFTER ? drift : undefined
  }
  const [form, setForm] = createSignal<ReadingForm>(
    props.revising === undefined ? readingFrom("regular", before()) : formOfReading(props.revising.taken.reading, before()),
  )
  /** What the tokens typed as drawn take off the savings on the corner's terms, where a replay there takes a fee. */
  const drawn = (): { readonly paidOut: number; readonly deducted: number } | undefined => {
    const terms = props.draft.venue.terms
    const read = readReadingForm(form(), bonuses(), before())
    if (terms === undefined || !read.ok || read.value.replayed === 0) return undefined
    const deducted = savingsDeductedFor(terms, read.value.replayed)
    return deducted > read.value.replayed ? { paidOut: read.value.replayed, deducted } : undefined
  }
  const [sending, setSending] = createSignal<Sending>({ type: "typing" })
  const read = createMemo(() => readReadingForm(form(), bonuses(), before()))
  const change = (changed: Partial<ReadingForm>): void => {
    setForm((current) => ({ ...current, ...changed }))
    setSending({ type: "typing" })
  }
  const nudge = createNudge()
  /** Red for a while after a press that this field stopped: a count that cannot be read, a total gone back, or the counter left where it stood with nothing else new. */
  const nudged = (field: ReadingField): boolean => {
    const found = read()
    if (!nudge.red()) return false
    return found.ok ? field === "counter" && saysNothingNew(found.value, before()) : found.error.some((candidate) => candidate.field === field)
  }
  const unread = (): boolean => {
    const found = read()
    return !found.ok && found.error.some((problem) => problem.reason === "not-a-count")
  }
  const behind = (): boolean => {
    const found = read()
    return !found.ok && found.error.some((problem) => problem.reason === "went-back")
  }
  const refusal = (): Extract<Sending, { readonly type: "refused" }> | undefined => {
    const current = sending()
    return current.type === "refused" ? current : undefined
  }
  const unrevisable = (): RevisionRefusal | undefined => {
    const current = sending()
    return current.type === "unrevisable" ? current.refusal : undefined
  }
  const failure = (): ApplicationError | undefined => {
    const current = sending()
    return current.type === "failed" ? current.error : undefined
  }

  /** The reading as typed, or — as the 遊タイム is reached — the same turning the cabinet to 時短, its counter where the 遊タイム comes where it was left. */
  const readFor = (toReliefDrive: boolean): ReturnType<typeof read> =>
    toReliefDrive && props.reliefDrive !== undefined ? readReliefDrive(form(), bonuses(), before(), reliefDriveCounter(props.reliefDrive, before())) : read()

  const send = async (missedJackpot: boolean, toReliefDrive: boolean): Promise<void> => {
    settleTyping()
    const reading = readFor(toReliefDrive)
    if (sending().type === "keeping") return
    if (!reading.ok || (!toReliefDrive && saysNothingNew(reading.value, before()))) {
      nudge.nudge()
      return
    }
    const checkpoints = checkpointsForReading(props.ordered, { ...reading.value, at: app.services.now() }, missedJackpot)
    if (!checkpoints.ok) {
      setSending({ type: "refused", refusal: checkpoints.error, toReliefDrive })
      return
    }
    setSending({ type: "keeping" })
    const kept = await addCheckpoints(app.services.drafts, props.draft, checkpoints.value)
    if (!kept.ok) {
      setSending({ type: "failed", error: kept.error })
      return
    }
    setForm(readingFrom(form().phase, beforeIn([...props.ordered, ...checkpoints.value])))
    setSending({ type: "typing" })
    toast({ title: "記録しました", stays: "glance" })
    app.played()
  }

  /** Keeps the play's log made again with a reading set right, put in or taken away, says so where there are words for it, and leaves the revising; the play as kept, where it was. */
  const revise = async (made: ReturnType<typeof withReadingRemoved>, said?: string): Promise<PlayDraft | undefined> => {
    if (sending().type === "keeping") return undefined
    if (!made.ok) {
      setSending({ type: "unrevisable", refusal: made.error })
      return undefined
    }
    setSending({ type: "keeping" })
    const kept = await reviseCheckpoints(app.services.drafts, props.draft, made.value)
    if (!kept.ok) {
      setSending({ type: "failed", error: kept.error })
      return undefined
    }
    if (said !== undefined) toast({ title: said, stays: "blink" })
    app.played()
    props.onRevised()
    return kept.value
  }

  /** Puts back the log a removal was made from. Written against the play as the removal left it, so one changed since is left as it is, and that is said. */
  const unremove = async (left: PlayDraft, before: readonly Checkpoint[]): Promise<void> => {
    const kept = await reviseCheckpoints(app.services.drafts, left, before)
    if (!kept.ok) {
      const changed = kept.error.type === "draft" && kept.error.error.type === "changed-elsewhere"
      toast({ title: TAKE_BACK_FAILED, description: changed ? CHANGED_SINCE_REMOVED : describeError(kept.error), tone: "error" })
      return
    }
    toast({ title: REMOVAL_TAKEN_BACK, stays: "glance" })
    app.played()
  }

  /** Takes a reading away, and says so with the way to take it back until the word is closed. */
  const remove = async (index: number): Promise<void> => {
    const before = props.ordered
    const left = await revise(withReadingRemoved(before, index))
    if (left !== undefined) toast({ title: READING_REMOVED, action: { label: TAKE_BACK, onPress: () => void unremove(left, before) } })
  }

  const saveRevision = async (revising: { readonly index: number; readonly taken: Taken }): Promise<void> => {
    settleTyping()
    const reading = read()
    if (!reading.ok) {
      nudge.nudge()
      return
    }
    await revise(withReadingRevised(props.ordered, revising.index, { ...reading.value, at: revising.taken.reading.at }), "保存しました")
  }

  const saveInsertion = async (inserting: { readonly before: number; readonly at: string }): Promise<void> => {
    settleTyping()
    const reading = read()
    if (!reading.ok) {
      nudge.nudge()
      return
    }
    await revise(withReadingInserted(props.ordered, inserting.before, { ...reading.value, at: inserting.at }))
  }

  const held: { form: HTMLFormElement | undefined } = { form: undefined }
  holdTheEnd(() => held.form, () => [refusal(), unrevisable(), failure()])
  return (
    <form autocomplete="off"
      ref={(element) => (held.form = element)}
      class="flex flex-col gap-2 border-t border-border bg-surface-2 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (props.revising !== undefined) void saveRevision(props.revising)
        else if (props.inserting !== undefined) void saveInsertion(props.inserting)
        else void send(false, false)
      }}
    >
      <Show when={refusal()} keyed>
        {(refused) => (
          <div role="alert" class="flex flex-wrap items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            <span class="flex-1">{describeReadingRefusal(refused.refusal)}</span>
            <Button size="small" variant="secondary" onClick={() => void send(true, refused.toReliefDrive)}>
              記録漏れの大当りを足して記録
            </Button>
          </div>
        )}
      </Show>
      <Show when={unrevisable()} keyed>
        {(refused) => (
          <p role="alert" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            {describeRevisionRefusal(refused)}
          </p>
        )}
      </Show>
      <Show when={failure()} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <Show when={props.revising} keyed>
        {(revising) => (
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-bold text-warning">{revising.index + 1}件目の記録を修正中</p>
            <button type="button" class="text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary" onClick={() => props.onInsertBefore(revising.index)}>
              この前に記録を追加
            </button>
          </div>
        )}
      </Show>
      <Show when={props.inserting} keyed>
        {(inserting) => <p class="text-xs font-bold text-warning">{inserting.before + 1}件目の前に記録を追加中</p>}
      </Show>
      <Show when={props.revising !== undefined || props.inserting !== undefined}>
        <ToggleGroup
          class="w-full p-0.5"
          value={form().phase}
          onChange={(value: string | null) => {
            const phase = PHASES.find((candidate) => candidate === value)
            if (phase !== undefined) change({ phase })
          }}
          aria-label="ゲーム状態"
        >
          <For each={PHASES}>
            {(phase) => (
              <ToggleGroupItem value={phase} class="h-7 flex-1">
                {PHASE_NAMES[phase]}
              </ToggleGroupItem>
            )}
          </For>
        </ToggleGroup>
      </Show>
      <div class="grid grid-cols-2 items-end gap-1.5">
        <div class="flex items-end gap-1">
          <div class="min-w-0 flex-1">
            <TextField label="貸玉" value={form().rented} onChange={(rented) => change({ rented })} inputMode="numeric" suffix="円" invalid={nudged("rented")} onFocus={nudge.settle} compact />
          </div>
          <PressButton amount={press()} unit="円" of="貸玉" onPress={() => change({ rented: withMore(form().rented, press()) })} onAmount={(rental) => setPress({ rental })} />
        </div>
        <div class="flex items-end gap-1">
          <div class="min-w-0 flex-1">
            <TextField label="貯玉引出" value={form().replayed} onChange={(replayed) => change({ replayed })} inputMode="numeric" suffix="玉" invalid={nudged("replayed")} onFocus={nudge.settle} compact />
          </div>
          <PressButton amount={draw()} unit="玉" of="貯玉引出" onPress={() => change({ replayed: withMore(form().replayed, draw()) })} onAmount={(amount) => setPress({ draw: amount })} />
        </div>
      </div>
      <Show when={drawn()} keyed>
        {(taken) => (
          <p class="text-xs tabular-nums text-text-muted">
            貯玉から {amountText(seal.play(taken.deducted))}玉（うち手数料 {amountText(seal.play(taken.deducted - taken.paidOut))}玉）
          </p>
        )}
      </Show>
      <Show when={behind()}>
        <p class="text-xs text-negative">貸玉と貯玉引出は累計です。これまでより少なくはできません。</p>
      </Show>
      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-1.5">
        <TextField label="回転数" value={form().counter} onChange={(counter) => change({ counter })} inputMode="numeric" invalid={nudged("counter")} onFocus={nudge.settle} compact />
        <TextField label="持ち玉" value={form().held} onChange={(held) => change({ held, heldCarried: false })} inputMode="numeric" suffix="玉" invalid={nudged("held")} onFocus={nudge.settle} compact />
        <DriftButton drift={form().drift} supported={form().supported} invalid={nudged("supported")} onDrift={(drift) => change({ drift })} onSupported={(supported) => change({ supported })} onFocus={nudge.settle} />
      </div>
      <Show when={recount()} keyed>
        {(drift) => <p class="text-xs text-warning">{recountText(drift.estimate === undefined ? undefined : seal.play(drift.estimate))}</p>}
      </Show>
      <Show when={unread()}>
        <p class="text-xs text-negative">{FIELD_PROBLEM_TEXT["not-a-count"]}</p>
      </Show>
      <div class="grid grid-cols-2 items-end gap-2">
        <div class="flex min-w-0 items-end gap-1">
          <Show
            when={props.revising}
            keyed
            fallback={
              <Show
                when={props.inserting}
                fallback={
                  <>
                    <Button type="submit" class="h-10 shrink-0 px-5" onClick={feelTap}>
                      記録
                    </Button>
                    <Show when={props.reliefDrive !== undefined}>
                      <Button
                        variant="secondary"
                        class="ml-auto h-10 shrink-0 px-2"
                        onClick={() => {
                          feelTap()
                          void send(false, true)
                        }}
                      >
                        {RELIEF_DRIVE_REACHED}
                      </Button>
                    </Show>
                  </>
                }
              >
                <Button type="submit" class="h-10 shrink-0 px-3">
                  追加
                </Button>
                <Button variant="ghost" class="h-10 shrink-0 px-1.5" onClick={() => props.onRevised()}>
                  やめる
                </Button>
              </Show>
            }
          >
            {(revising) => (
              <>
                <Button type="submit" class="h-10 shrink-0 px-3">
                  保存
                </Button>
                <Button variant="ghost" class="h-10 shrink-0 px-1.5" onClick={() => props.onRevised()}>
                  やめる
                </Button>
                <Button variant="outline" class="ml-auto h-10 shrink-0 px-2 text-negative hover:text-negative" aria-label={REMOVE_READING} onClick={() => void remove(revising.index)}>
                  <TrashIcon />
                </Button>
              </>
            )}
          </Show>
        </div>
        <div class="flex min-w-0 items-end gap-1">
          <div class="min-w-0 flex-1">
            <Select label="ボーナス" placeholder="なし" options={jackpotOptions(bonuses())} value={form().jackpot} onChange={(jackpot) => change({ jackpot, over: usualOverOf(props.draft, bonuses(), jackpot) })} />
          </div>
          <OverButton over={form().over} invalid={nudged("over")} onOver={(over) => change({ over })} onFocus={nudge.settle} />
        </div>
      </div>
      <p class="text-xs text-text-muted">{JACKPOT_HELD_NOTE}</p>
    </form>
  )
}
