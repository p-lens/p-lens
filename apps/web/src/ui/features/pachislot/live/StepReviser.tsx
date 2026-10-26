import { createSignal, Index, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { withStepRevised, type Ended, type RevisionRefusal, type Step } from "../../../../core/pachislot/revision"
import type { Countable } from "../../../../core/pachislot/weighing"
import { Button } from "../../../primitives/button"
import { TrashIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { describeError } from "../../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../../wording/fields"
import { describeStepRefusal } from "../../../wording/pachislot/formula"
import { REMOVE_READING } from "../../../wording/pachislot/play"
import type { TriggerWords } from "../../../wording/pachislot/trigger"
import { readAtReadingForm, type AtReadingForm } from "./at-reading-form"
import type { Post } from "./NoticeBoard"
import { readReadingForm, type ReadingForm } from "./reading-form"
import type { Write, Written } from "./write"

/** A reading of either kind, taken up to be set right. A step that reads no counter is not one of these. */
export type RevisedStep = Extract<Step, { readonly type: "reading" | "at-reading" }>

/** Where a revision is: being typed, being kept, refused as the log stands, or failed to be kept. */
type Revising =
  | { readonly type: "typing" }
  | { readonly type: "keeping" }
  | { readonly type: "refused"; readonly refusal: RevisionRefusal }
  | { readonly type: "failed"; readonly error: ApplicationError }

const typed = (count: number | undefined): string => (count === undefined ? "" : String(count))

const ENDED: readonly Ended[] = ["going", "cz-missed", "bonus-missed", "at"]

/** How a reading's games ended, as its toggle says it: a trigger missed in the words of the machine's. */
const endedName = (ended: Ended, trigger: TriggerWords | undefined): string => {
  switch (ended) {
    case "going":
      return "通常"
    case "cz-missed":
      return trigger?.missed ?? ""
    case "bonus-missed":
      return trigger?.bonusMissed ?? ""
    case "at":
      return "AT当選"
  }
}

/**
 * A reading already taken, typed again where the next one would be: set
 * right and saved, or taken away. Saving makes every line after it again —
 * the games each later reading comes to, the taps that stood on them — and
 * a change a later reading cannot follow is refused, with why. A bonus
 * machine's reading is its counter's day — its bonuses four to a row, then
 * the day's games, the cash and the medals drawn in one — and an AT
 * machine's is the games since its last AT, with how they ended, which can
 * be set right too, then the cash and the medals drawn beside them.
 * The bin stands apart from saving, at the row's far end, and the removal
 * is the play's to make (`onRemove`), with the way to take it back.
 */
/** A reading as read, the medals in hand left out where none were counted. */
const withHeld = <T extends { readonly held: number | undefined }>(read: T): Omit<T, "held"> & { readonly held?: number } => {
  const { held, ...rest } = read
  return held === undefined ? rest : { ...rest, held }
}

export function StepReviser(props: {
  readonly index: number
  readonly step: RevisedStep
  readonly bonuses: readonly Countable[]
  /** What brings the machine's AT where a CZ or a bonus does, so that a reading's games may have ended in one missed; none where the AT is won directly. */
  readonly trigger: TriggerWords | undefined
  readonly rewrite: Write
  readonly post: Post
  readonly onRemove: () => Promise<Written<RevisionRefusal>>
  readonly onDone: () => void
}): JSX.Element {
  const [reading, setReading] = createSignal<ReadingForm>(
    props.step.type === "reading"
      ? { total: String(props.step.input.total), bonuses: Object.fromEntries(Object.entries(props.step.input.bonuses).map(([id, count]) => [id, String(count)])), outlay: typed(props.step.input.outlay), replay: typed(props.step.input.replay), held: typed(props.step.input.held), heldCarried: false }
      : { total: "", bonuses: {}, outlay: "", replay: "", held: "", heldCarried: false },
  )
  const [atReading, setAtReading] = createSignal<AtReadingForm>(props.step.type === "at-reading" ? { sinceAt: String(props.step.input.sinceAt), outlay: typed(props.step.input.outlay), replay: typed(props.step.input.replay), held: typed(props.step.input.held), heldCarried: false } : { sinceAt: "", outlay: "", replay: "", held: "", heldCarried: false })
  const [ended, setEnded] = createSignal<Ended>(props.step.type === "at-reading" ? props.step.ended : "going")
  const [state, setState] = createSignal<Revising>({ type: "typing" })
  const nudge = createNudge()
  /** The step as typed now, or nothing while a field does not read. */
  const revised = (): RevisedStep | undefined => {
    if (props.step.type === "reading") {
      const read = readReadingForm(
        reading(),
        props.step.input.bonuses,
        props.bonuses.map((bonus) => bonus.id),
      )
      return read.ok ? { type: "reading", input: { ...withHeld(read.value), at: props.step.input.at } } : undefined
    }
    const read = readAtReadingForm(atReading())
    return read.ok ? { type: "at-reading", input: { ...withHeld(read.value), at: props.step.input.at }, ended: ended(), afterMissedAt: props.step.afterMissedAt } : undefined
  }
  const kept = async (written: Promise<Written<RevisionRefusal>>): Promise<boolean> => {
    setState({ type: "keeping" })
    const done = await written
    if (done.type === "refused") setState({ type: "refused", refusal: done.refusal })
    else if (done.type === "failed") setState({ type: "failed", error: done.error })
    else props.onDone()
    return done.type === "written"
  }
  const save = (): void => {
    settleTyping()
    const step = revised()
    if (state().type === "keeping") return
    if (step === undefined) {
      nudge.nudge()
      return
    }
    void kept(props.rewrite((ordered) => withStepRevised(ordered, props.index, step))).then((saved) => {
      if (saved) toast({ title: "保存しました", stays: "blink" })
    })
  }
  const remove = (): void => {
    if (state().type !== "keeping") void kept(props.onRemove())
  }
  const unread = (): boolean => nudge.red() && revised() === undefined
  props.post(() => {
    const current = state()
    if (current.type === "refused") return { tone: "refused", said: describeStepRefusal(current.refusal, (id) => props.bonuses.find((bonus) => bonus.id === id)?.label ?? id) }
    return current.type === "failed" ? { tone: "failed", said: describeError(current.error) } : undefined
  })
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p class="text-xs font-bold text-warning">記録を修正中</p>
      <Show
        when={props.step.type === "reading"}
        fallback={
          <div class="flex flex-col gap-3">
            <ToggleGroup
              value={ended()}
              onChange={(value: string | null) => {
                const chosen = ENDED.find((each) => each === value)
                if (chosen !== undefined) setEnded(chosen)
              }}
              aria-label="このゲーム数の終わり方"
            >
              <Index each={ENDED.filter((each) => (each !== "cz-missed" || props.trigger !== undefined) && (each !== "bonus-missed" || props.trigger?.bonusMissed !== undefined))}>{(each) => <ToggleGroupItem value={each()}>{endedName(each(), props.trigger)}</ToggleGroupItem>}</Index>
            </ToggleGroup>
            <div class="grid grid-cols-4 items-end gap-1.5">
              <TextField label="AT間G" value={atReading().sinceAt} onChange={(sinceAt) => setAtReading({ ...atReading(), sinceAt })} inputMode="numeric" suffix="G" invalid={unread()} onFocus={nudge.settle} compact />
              <TextField label="投資" value={atReading().outlay} onChange={(outlay) => setAtReading({ ...atReading(), outlay })} inputMode="numeric" suffix="円" invalid={unread()} onFocus={nudge.settle} compact />
              <TextField label="貯メダル" value={atReading().replay} onChange={(replay) => setAtReading({ ...atReading(), replay })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} compact />
              <TextField label="持ちメダル" value={atReading().held} onChange={(held) => setAtReading({ ...atReading(), held })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} compact />
            </div>
          </div>
        }
      >
        <div class="flex flex-col gap-3">
          <Show when={props.bonuses.length > 0}>
            <div class="grid grid-cols-4 gap-3">
              <Index each={props.bonuses}>
                {(bonus) => (
                  <TextField
                    label={bonus().label}
                    value={reading().bonuses[bonus().id] ?? ""}
                    onChange={(count) => setReading({ ...reading(), bonuses: { ...reading().bonuses, [bonus().id]: count } })}
                    inputMode="numeric"
                    suffix="回"
                    invalid={unread()}
                    onFocus={nudge.settle}
                  />
                )}
              </Index>
            </div>
          </Show>
          <div class="grid grid-cols-4 items-end gap-1.5">
            <TextField label="累計G" value={reading().total} onChange={(total) => setReading({ ...reading(), total })} inputMode="numeric" suffix="G" invalid={unread()} onFocus={nudge.settle} compact />
            <TextField label="投資" value={reading().outlay} onChange={(outlay) => setReading({ ...reading(), outlay })} inputMode="numeric" suffix="円" invalid={unread()} onFocus={nudge.settle} compact />
            <TextField label="貯メダル" value={reading().replay} onChange={(replay) => setReading({ ...reading(), replay })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} compact />
            <TextField label="持ちメダル" value={reading().held} onChange={(held) => setReading({ ...reading(), held })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} compact />
          </div>
        </div>
      </Show>
      <Show when={unread()}>
        <p class="text-xs text-negative">{FIELD_PROBLEM_TEXT["not-a-count"]}</p>
      </Show>
      <div class="flex items-center gap-2">
        <Button type="submit">保存</Button>
        <Button variant="ghost" onClick={() => props.onDone()}>
          やめる
        </Button>
        <Button variant="outline" size="icon" class="ml-auto text-negative hover:text-negative" aria-label={REMOVE_READING} onClick={remove}>
          <TrashIcon />
        </Button>
      </div>
    </form>
  )
}
