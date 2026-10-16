import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"
import { createEffect, createMemo, createSignal, Index, on, Show, type Accessor, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { ceilingsOf, hasCz, missedOn, pathOf, standingOf, withLastTakenBack, type Missed, type TakeBackRefusal, type TakenBack } from "../../../../core/pachislot/path"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { checkpointsForReading, liveSummary, type ReadingRefusal } from "../../../../core/play-log/live"
import { mapOk } from "../../../../core/result/result"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createLongPress } from "../../../primitives/long-press"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { feelHold, feelTap } from "../../../primitives/vibration"
import { describeError } from "../../../wording/errors"
import { formatCount } from "../../../wording/numbers"
import { describeAtReadingRefusal, describeTakeBackRefusal } from "../../../wording/pachislot/formula"
import { triggerWordsOf, type TriggerWords } from "../../../wording/pachislot/trigger"
import type { Post } from "./NoticeBoard"
import { type AtReadingForm, type AtReadingProblem, type AtStanding, atReadingFrom, readAtReadingForm } from "./at-reading-form"
import { type AtResultForm, type AtResultProblem, atResultLine, type Completion, EMPTY_AT_RESULT, readAtResultForm } from "./at-result-form"
import type { Write, Written } from "./write"

function Tile(props: { readonly label: string; readonly value: string; readonly note?: string }): JSX.Element {
  return (
    <div class="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
      <dt class="text-xs font-bold uppercase tracking-wide text-text-muted">{props.label}</dt>
      <dd class="text-xl font-bold tabular-nums text-text-primary">
        {props.value}
        <Show when={props.note}>
          <span class="ml-1 text-xs font-normal text-text-muted">{props.note}</span>
        </Show>
      </dd>
    </div>
  )
}

/**
 * Where an AT machine's play stands by its log, three to a row as a bonus
 * machine's: the cash spent first, its regular games, the games since the
 * last AT and the last CZ, the medals drawn from savings, its ATs, and how
 * far each ceiling the machine has is — the trigger's, the AT間天井 and the
 * スルー天井.
 */
export function AtFigures(props: { readonly ordered: readonly Checkpoint[]; readonly normalized: NormalizedSpecDto }): JSX.Element {
  const summary = () => liveSummary(props.ordered)
  const cz = () => hasCz(props.normalized)
  const trigger = () => triggerWordsOf(props.normalized)
  const standing = () => {
    const path = pathOf(props.ordered)
    return path === undefined ? undefined : standingOf(path, props.normalized)
  }
  const ceilings = () => {
    const found = standing()
    return found === undefined ? undefined : ceilingsOf(found, props.normalized)
  }
  return (
    <dl class="grid grid-cols-3 gap-2">
      <Tile label="現金投資" value={summary().outlay === undefined ? "--" : `¥${formatCount(summary().outlay ?? 0)}`} />
      <Tile label="打ったゲーム数" value={formatCount(summary().spins)} note="G" />
      <Tile label="AT間のゲーム数" value={formatCount(standing()?.sinceAt ?? 0)} note="G" />
      <Show when={cz()}>
        <Tile label={`${trigger().name}間のゲーム数`} value={formatCount(standing()?.sinceTrigger ?? 0)} note="G" />
      </Show>
      <Tile label="貯メダル" value={((replay) => (replay === undefined ? "--" : formatCount(replay)))(props.ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay)} note="枚" />
      <Tile label="AT" value={formatCount(summary().jackpots)} note="回" />
      <Show when={cz()}>
        <Tile
          label={`${trigger().name}スルー`}
          value={formatCount(standing()?.misses ?? 0)}
          note={ceilings()?.misses === undefined ? "回" : `回 / 天井 ${formatCount(ceilings()?.misses?.limit ?? 0)}回`}
        />
      </Show>
      <Show when={ceilings()?.trigger !== undefined}>
        <Tile label={cz() ? `${trigger().name}天井まで` : "天井まで"} value={formatCount(ceilings()?.trigger ?? 0)} note="G" />
      </Show>
      <Show when={ceilings()?.at !== undefined}>
        <Tile label="AT間天井まで" value={formatCount(ceilings()?.at ?? 0)} note="G" />
      </Show>
      <Show when={ceilings()?.zone} keyed>
        {(zone) => (
          <>
            <Tile label="引き戻し残り" value={formatCount(zone.games)} note="G" />
            <Tile label="上限まで" value={formatCount(Math.round(zone.headroom))} note="枚" />
          </>
        )}
      </Show>
    </dl>
  )
}

/** Where an AT's result is: being typed, being kept, or failed to be kept. */
type Keeping = { readonly type: "typing" } | { readonly type: "keeping" } | { readonly type: "failed"; readonly error: ApplicationError }

const COMPLETIONS: readonly { readonly value: Completion; readonly label: string }[] = [
  { value: "completed", label: "完走した" },
  { value: "short", label: "完走せず" },
  { value: "unsaid", label: "わからない" },
]

const isCompletion = (value: string): value is Completion => COMPLETIONS.some((each) => each.value === value)

/**
 * How the AT just won went, said when it ends: whether it reached the
 * 有利区間's cap, the sets it carried on to past its first where it is paid in
 * sets, and the medals it gained. Each is optional; what is said weighs the
 * setting and carries what the 有利区間 holds into the games after. Shown
 * while the log's last line is the AT, and gone once anything follows it.
 */
function AtResultComposer(props: { readonly write: Write; readonly normalized: NormalizedSpecDto; readonly post: Post }): JSX.Element {
  const app = useApp()
  const [form, setForm] = createSignal<AtResultForm>(EMPTY_AT_RESULT)
  const [keeping, setKeeping] = createSignal<Keeping>({ type: "typing" })
  const nudge = createNudge()
  const capped = (): boolean => props.normalized.atRules?.cap !== undefined
  const inSets = (): boolean => props.normalized.tables.some((table) => table.at?.payout.type === "sets")
  const problemOf = (field: AtResultProblem["field"]): AtResultProblem | undefined => {
    const read = readAtResultForm(form())
    return read.ok ? undefined : read.error.find((problem) => problem.field === field)
  }
  const typed = (change: Partial<AtResultForm>): void => {
    setForm((current) => ({ ...current, ...change }))
    setKeeping({ type: "typing" })
  }
  const keep = async (): Promise<void> => {
    settleTyping()
    const read = readAtResultForm(form())
    if (keeping().type === "keeping") return
    if (!read.ok) {
      nudge.nudge()
      return
    }
    setKeeping({ type: "keeping" })
    const written = await props.write((ordered) => atResultLine(ordered, read.value, app.services.now()))
    setKeeping(written.type === "failed" ? { type: "failed", error: written.error } : { type: "typing" })
    if (written.type !== "written") return
    setForm(EMPTY_AT_RESULT)
    toast({ title: "記録しました", stays: "glance" })
  }
  const failure = (): ApplicationError | undefined => {
    const current = keeping()
    return current.type === "failed" ? current.error : undefined
  }
  props.post(() => ((error) => (error === undefined ? undefined : { tone: "failed", said: describeError(error) }))(failure()))
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void keep()
      }}
    >
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">ATの結果</span>
      <Show when={capped()}>
        <ToggleGroup value={form().completion} onChange={(value: string | null) => value !== null && isCompletion(value) && typed({ completion: value })}>
          <Index each={COMPLETIONS}>{(each) => <ToggleGroupItem value={each().value}>{each().label}</ToggleGroupItem>}</Index>
        </ToggleGroup>
      </Show>
      <div class="grid grid-cols-2 gap-3">
        <Show when={inSets()}>
          <TextField
            label="継続したセット数"
            value={form().sets}
            onChange={(sets) => typed({ sets })}
            inputMode="numeric"
            suffix="セット"
            placeholder="初期のみは0"
            error={problemOf("sets") === undefined ? undefined : "整数で入力してください。"}
            invalid={nudge.red() && problemOf("sets") !== undefined}
            onFocus={nudge.settle}
          />
        </Show>
        <TextField
          label="獲得枚数（任意）"
          value={form().medals}
          onChange={(medals) => typed({ medals })}
          inputMode="numeric"
          suffix="枚"
          error={problemOf("medals") === undefined ? undefined : "整数で入力してください。"}
          invalid={nudge.red() && problemOf("medals") !== undefined}
          onFocus={nudge.settle}
        />
      </div>
      <div>
        <Button type="submit">結果を記録</Button>
      </div>
    </form>
  )
}

/** Where an AT machine's reading is: being typed, being kept, refused as it stood, or failed to be kept. */
type Sending =
  | { readonly type: "typing" }
  | { readonly type: "keeping" }
  | { readonly type: "refused"; readonly refusal: ReadingRefusal; readonly ended: Ended }
  | { readonly type: "failed"; readonly error: ApplicationError }

/** How the games a reading closes ended: with nothing, a CZ failed, a bonus that missed the AT, or an AT won. */
type Ended = "going" | Missed | "at"

/** What is said once a reading is kept, by how its games ended. */
const keptAs = (ended: Ended, trigger: TriggerWords): string => {
  switch (ended) {
    case "going":
      return "記録しました"
    case "cz-missed":
      return `${trigger.missed}を記録しました`
    case "bonus-missed":
      return `${trigger.bonusMissed ?? "ATなしボーナス"}を記録しました`
    case "at":
      return "AT当選を記録しました"
  }
}

const sendingOf = (written: Written<ReadingRefusal>, ended: Ended): Sending => {
  switch (written.type) {
    case "written":
    case "unreadable":
      return { type: "typing" }
    case "refused":
      return { type: "refused", refusal: written.refusal, ended }
    case "failed":
      return { type: "failed", error: written.error }
  }
}

/** An AT machine's reading as the cabinet's row and the counting tiles share it: the form and the sending of it. What was last refused or failed, whether sent from the row or from a tile, is posted to the play's notices. */
export interface AtReading {
  readonly form: Accessor<AtReadingForm>
  readonly typed: (change: Partial<AtReadingForm>) => void
  readonly send: (ended: Ended, missedAt: boolean) => Promise<void>
  readonly problemOf: (field: keyof AtReadingForm) => AtReadingProblem | undefined
  readonly red: Accessor<boolean>
  readonly settle: () => void
}

/**
 * An AT machine's counter as it is read at the cabinet: the games since the
 * last AT, the outlay and the medals drawn from savings so far, each
 * opening on where the play stands, to be typed over — and following the
 * play until something is typed. Sent as a reading, as an AT won — the
 * moment the counter is about to start over — or, where a CZ brings the AT,
 * as a CZ that missed. A counter that went back means an AT came that was
 * not written down, which can be added.
 */
export const createAtReading = (standing: () => AtStanding, trigger: () => TriggerWords, write: Write, post: Post): AtReading => {
  const app = useApp()
  const standingForm = createMemo(() => atReadingFrom(standing()))
  const [form, setForm] = createSignal<AtReadingForm>(standingForm())
  const [touched, setTouched] = createSignal(false)
  createEffect(
    on(standingForm, (next) => {
      if (!touched()) setForm(next)
    }),
  )
  const [sending, setSending] = createSignal<Sending>({ type: "typing" })
  const nudge = createNudge()
  const read = () => readAtReadingForm(form())
  const problemOf = (field: keyof AtReadingForm): AtReadingProblem | undefined => {
    const found = read()
    return found.ok ? undefined : found.error.find((problem) => problem.field === field)
  }
  const typed = (change: Partial<AtReadingForm>): void => {
    setTouched(true)
    setForm((current) => ({ ...current, ...change }))
    setSending({ type: "typing" })
  }
  const send = async (ended: Ended, missedAt: boolean): Promise<void> => {
    settleTyping()
    const reading = read()
    if (sending().type === "keeping") return
    if (!reading.ok) {
      nudge.nudge()
      return
    }
    setSending({ type: "keeping" })
    const at = app.services.now()
    const written = await write((ordered) =>
      mapOk(
        checkpointsForReading(
          ordered,
          { counterSpins: reading.value.sinceAt, outlay: reading.value.outlay, replay: reading.value.replay, counterJackpots: undefined, at, jackpot: ended === "at" },
          missedAt,
        ),
        (checkpoints) => (ended === "cz-missed" || ended === "bonus-missed" ? missedOn(checkpoints, ended) : checkpoints),
      ),
    )
    setSending(sendingOf(written, ended))
    if (written.type !== "written") return
    setTouched(false)
    setForm(standingForm())
    toast({ title: keptAs(ended, trigger()), stays: "glance" })
  }
  const refused = (): (Sending & { type: "refused" }) | undefined => {
    const current = sending()
    return current.type === "refused" ? current : undefined
  }
  const failure = (): ApplicationError | undefined => {
    const current = sending()
    return current.type === "failed" ? current.error : undefined
  }
  post(() => {
    const found = refused()
    if (found !== undefined)
      return {
        tone: "refused",
        said: describeAtReadingRefusal(found.refusal),
        ...(found.refusal.type === "counter-went-back" ? { action: { label: "記録漏れのATを足して記録", onPress: () => void send(found.ended, true) } } : {}),
      }
    const error = failure()
    return error === undefined ? undefined : { tone: "failed", said: describeError(error) }
  })
  return { form, typed, send, problemOf, red: nudge.red, settle: nudge.settle }
}

/**
 * Where an AT machine's counter is typed at the cabinet's foot, in one row as
 * a bonus machine's is: the games since the last AT, the cash spent and the
 * medals drawn from savings so far.
 */
export function AtReadingComposer(props: { readonly reading: AtReading }): JSX.Element {
  const errorOf = (field: keyof AtReadingForm): string | undefined => (props.reading.problemOf(field)?.reason === "not-a-count" ? "整数で入力してください。" : undefined)
  const invalid = (field: keyof AtReadingForm): boolean => props.reading.red() && props.reading.problemOf(field) !== undefined
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void props.reading.send("going", false)
      }}
    >
      <div class="grid grid-cols-3 gap-3">
        <TextField
          label="AT間のゲーム数"
          value={props.reading.form().sinceAt}
          onChange={(sinceAt) => props.reading.typed({ sinceAt })}
          inputMode="numeric"
          suffix="G"
          error={errorOf("sinceAt")}
          invalid={invalid("sinceAt")}
          onFocus={props.reading.settle}
        />
        <TextField
          label="現金投資（累計）"
          value={props.reading.form().outlay}
          onChange={(outlay) => props.reading.typed({ outlay })}
          inputMode="numeric"
          suffix="円"
          error={errorOf("outlay")}
          invalid={invalid("outlay")}
          onFocus={props.reading.settle}
        />
        <TextField
          label="貯メダル（累計）"
          value={props.reading.form().replay}
          onChange={(replay) => props.reading.typed({ replay })}
          inputMode="numeric"
          suffix="枚"
          error={errorOf("replay")}
          invalid={invalid("replay")}
          onFocus={props.reading.settle}
        />
      </div>
      <div>
        <Button type="submit">記録</Button>
      </div>
    </form>
  )
}

/** A tile an event is kept with by a tap, and the last of it taken back by a long press. */
function EventTile(props: { readonly label: string; readonly count: number; readonly onPress: () => void; readonly onLongPress: () => void }): JSX.Element {
  const press = createLongPress(() => {
    feelHold()
    props.onLongPress()
  })
  return (
    <button
      type="button"
      class="flex min-h-24 select-none flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-3 transition-colors hover:bg-surface-3 active:bg-surface-0"
      style={{ "-webkit-touch-callout": "none" }}
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerLeave={press.onPointerLeave}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
      onClick={() => {
        if (press.wasLong()) return
        feelTap()
        props.onPress()
      }}
    >
      <span class="text-3xl font-bold tabular-nums text-text-primary">{formatCount(props.count)}</span>
      <span class="text-center text-sm font-semibold leading-tight text-text-secondary">{props.label}</span>
    </button>
  )
}

/**
 * What an AT machine's play counts, at the foot of its figures as a bonus
 * machine's counter is: a tile for a CZ missed, where a CZ brings the AT,
 * and one for an AT won, each with how many the play has had, a tap
 * keeping it at the games the row below says, and a long press taking the
 * last one back while nothing follows it; and how the AT just won went,
 * said once it ends.
 */
export function AtCounting(props: {
  readonly reading: AtReading
  readonly ordered: readonly Checkpoint[]
  readonly normalized: NormalizedSpecDto
  readonly write: Write
  readonly rewrite: Write
  readonly post: Post
  readonly awaitsResult: boolean
}): JSX.Element {
  const counted = (kind: Missed | "jackpot"): number => props.ordered.filter((checkpoint) => checkpoint.event?.kind === kind).length
  const [takingBack, setTakingBack] = createSignal<Written<TakeBackRefusal> | undefined>(undefined)
  const takeBack = (taken: TakenBack): void => {
    void props.rewrite((ordered) => withLastTakenBack(ordered, taken)).then((written) => {
      setTakingBack(written)
      if (written.type === "written") toast({ title: "1つ戻しました", stays: "blink" })
    })
  }
  const keep = (ended: "at" | Missed): void => {
    setTakingBack(undefined)
    void props.reading.send(ended, false)
  }
  const unkept = (): string | undefined => {
    const current = takingBack()
    if (current?.type === "refused") return describeTakeBackRefusal(current.refusal, triggerWordsOf(props.normalized))
    return current?.type === "failed" ? describeError(current.error) : undefined
  }
  props.post(() => ((said) => (said === undefined ? undefined : { tone: takingBack()?.type === "failed" ? "failed" : "refused", said }))(unkept()))
  return (
    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {hasCz(props.normalized) ? `${triggerWordsOf(props.normalized).name}・AT` : "AT"}
        <span class="ml-2 font-normal normal-case text-text-muted">長押しで1つ戻します</span>
      </h3>
      <div class="grid grid-cols-4 gap-2">
        <Show when={hasCz(props.normalized)}>
          <EventTile label={triggerWordsOf(props.normalized).missed} count={counted("cz-missed")} onPress={() => keep("cz-missed")} onLongPress={() => takeBack("cz-missed")} />
        </Show>
        <Show when={triggerWordsOf(props.normalized).bonusMissed} keyed>
          {(label) => <EventTile label={label} count={counted("bonus-missed")} onPress={() => keep("bonus-missed")} onLongPress={() => takeBack("bonus-missed")} />}
        </Show>
        <EventTile label="AT当選" count={counted("jackpot")} onPress={() => keep("at")} onLongPress={() => takeBack("at")} />
      </div>
      <Show when={props.awaitsResult}>
        <AtResultComposer write={props.write} normalized={props.normalized} post={props.post} />
      </Show>
    </section>
  )
}
