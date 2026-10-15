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
import { describeStepRefusal } from "../../../wording/pachislot/formula"
import { REMOVE_READING } from "../../../wording/pachislot/play"
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

const ENDED: readonly Ended[] = ["going", "cz-missed", "at"]

const ENDED_NAMES: Readonly<Record<Ended, string>> = { going: "通常", "cz-missed": "CZ失敗", at: "AT当選" }

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
export function StepReviser(props: {
  readonly index: number
  readonly step: RevisedStep
  readonly bonuses: readonly Countable[]
  /** Whether a CZ brings the machine's AT, so that a reading's games may have ended in one missed. */
  readonly cz: boolean
  readonly rewrite: Write
  readonly post: Post
  readonly onRemove: () => Promise<Written<RevisionRefusal>>
  readonly onDone: () => void
}): JSX.Element {
  const [reading, setReading] = createSignal<ReadingForm>(
    props.step.type === "reading"
      ? { total: String(props.step.input.total), bonuses: Object.fromEntries(Object.entries(props.step.input.bonuses).map(([id, count]) => [id, String(count)])), outlay: typed(props.step.input.outlay), replay: typed(props.step.input.replay) }
      : { total: "", bonuses: {}, outlay: "", replay: "" },
  )
  const [atReading, setAtReading] = createSignal<AtReadingForm>(props.step.type === "at-reading" ? { sinceAt: String(props.step.input.sinceAt), outlay: typed(props.step.input.outlay), replay: typed(props.step.input.replay) } : { sinceAt: "", outlay: "", replay: "" })
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
      return read.ok ? { type: "reading", input: { ...read.value, at: props.step.input.at } } : undefined
    }
    const read = readAtReadingForm(atReading())
    return read.ok ? { type: "at-reading", input: { ...read.value, at: props.step.input.at }, ended: ended(), afterMissedAt: props.step.afterMissedAt } : undefined
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
              <Index each={ENDED.filter((each) => each !== "cz-missed" || props.cz)}>{(each) => <ToggleGroupItem value={each()}>{ENDED_NAMES[each()]}</ToggleGroupItem>}</Index>
            </ToggleGroup>
            <div class="grid grid-cols-3 gap-3">
              <TextField label="AT間のゲーム数" value={atReading().sinceAt} onChange={(sinceAt) => setAtReading({ ...atReading(), sinceAt })} inputMode="numeric" suffix="G" invalid={unread()} onFocus={nudge.settle} />
              <TextField label="現金投資（累計）" value={atReading().outlay} onChange={(outlay) => setAtReading({ ...atReading(), outlay })} inputMode="numeric" suffix="円" invalid={unread()} onFocus={nudge.settle} />
              <TextField label="貯メダル（累計）" value={atReading().replay} onChange={(replay) => setAtReading({ ...atReading(), replay })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} />
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
          <div class="grid grid-cols-3 gap-3">
            <TextField label="累計ゲーム数" value={reading().total} onChange={(total) => setReading({ ...reading(), total })} inputMode="numeric" suffix="G" invalid={unread()} onFocus={nudge.settle} />
            <TextField label="現金投資（累計）" value={reading().outlay} onChange={(outlay) => setReading({ ...reading(), outlay })} inputMode="numeric" suffix="円" invalid={unread()} onFocus={nudge.settle} />
            <TextField label="貯メダル（累計）" value={reading().replay} onChange={(replay) => setReading({ ...reading(), replay })} inputMode="numeric" suffix="枚" invalid={unread()} onFocus={nudge.settle} />
          </div>
        </div>
      </Show>
      <Show when={unread()}>
        <p class="text-xs text-negative">整数で入力してください。</p>
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
