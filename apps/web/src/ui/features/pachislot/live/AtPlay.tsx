import type { NormalizedSpecDto } from "@p-lens/contracts/pachislot"
import { createEffect, createMemo, createSignal, Index, on, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { ceilingsOf, czMissedAt, hasCz, pathOf, standingOf } from "../../../../core/pachislot/path"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { checkpointsForReading, liveSummary, type ReadingRefusal } from "../../../../core/play-log/live"
import { mapOk } from "../../../../core/result/result"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { describeError } from "../../../wording/errors"
import { formatCount } from "../../../wording/numbers"
import { describeAtReadingRefusal } from "../../../wording/pachislot/formula"
import { type AtReadingForm, type AtStanding, atReadingFrom, readAtReadingForm } from "./at-reading-form"
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
 * Where an AT machine's play stands by its log: its regular games, the games
 * since the last AT and the last CZ, the outlay, its ATs, and how far each
 * ceiling the machine has is — the trigger's, the AT間天井 and the スルー天井.
 */
export function AtFigures(props: { readonly ordered: readonly Checkpoint[]; readonly normalized: NormalizedSpecDto }): JSX.Element {
  const summary = () => liveSummary(props.ordered)
  const cz = () => hasCz(props.normalized)
  const standing = () => {
    const path = pathOf(props.ordered)
    return path === undefined ? undefined : standingOf(path, props.normalized)
  }
  const ceilings = () => {
    const found = standing()
    return found === undefined ? undefined : ceilingsOf(found, props.normalized)
  }
  return (
    <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="打ったゲーム数" value={formatCount(summary().spins)} note="G" />
      <Tile label="AT間のゲーム数" value={formatCount(standing()?.sinceAt ?? 0)} note="G" />
      <Show when={cz()}>
        <Tile label="CZ間のゲーム数" value={formatCount(standing()?.sinceTrigger ?? 0)} note="G" />
      </Show>
      <Tile label="投資" value={summary().outlay === undefined ? "--" : `¥${formatCount(summary().outlay ?? 0)}`} />
      <Tile label="AT" value={formatCount(summary().jackpots)} note="回" />
      <Show when={cz()}>
        <Tile
          label="CZスルー"
          value={formatCount(standing()?.misses ?? 0)}
          note={ceilings()?.misses === undefined ? "回" : `回 / 天井 ${formatCount(ceilings()?.misses?.limit ?? 0)}回`}
        />
      </Show>
      <Show when={ceilings()?.trigger !== undefined}>
        <Tile label={cz() ? "CZ天井まで" : "天井まで"} value={formatCount(ceilings()?.trigger ?? 0)} note="G" />
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
export function AtResultComposer(props: { readonly write: Write; readonly normalized: NormalizedSpecDto }): JSX.Element {
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
    if (written.type === "written") setForm(EMPTY_AT_RESULT)
  }
  const failure = (): ApplicationError | undefined => {
    const current = keeping()
    return current.type === "failed" ? current.error : undefined
  }
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3 border-t border-border bg-surface-2 p-4"
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
      <Show when={failure()} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
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

/** How the games a reading closes ended: with nothing, a CZ missed, or an AT won. */
type Ended = "going" | "cz-missed" | "at"

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

/**
 * Where an AT machine's counter is read at the cabinet: the games since the
 * last AT, and the outlay so far, each opening on where the play stands, to
 * be typed over — and following the play until something is typed. Sent as a reading, as an AT
 * won — the moment the counter is about to start over — or, where a CZ brings
 * the AT, as a CZ that missed. A counter that went back means an AT came that
 * was not written down, which can be added.
 */
export function AtReadingComposer(props: { readonly standing: AtStanding; readonly write: Write; readonly cz: boolean }): JSX.Element {
  const app = useApp()
  const standingForm = createMemo(() => atReadingFrom(props.standing))
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
  const problemOf = (field: keyof AtReadingForm) => {
    const found = read()
    return found.ok ? undefined : found.error.find((problem) => problem.field === field)
  }
  const errorOf = (field: keyof AtReadingForm): string | undefined => (problemOf(field)?.reason === "not-a-count" ? "整数で入力してください。" : undefined)
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
    const written = await props.write((ordered) =>
      mapOk(
        checkpointsForReading(
          ordered,
          { counterSpins: reading.value.sinceAt, outlay: reading.value.outlay, counterJackpots: undefined, at, jackpot: ended === "at" },
          missedAt,
        ),
        (checkpoints) => (ended === "cz-missed" ? czMissedAt(checkpoints) : checkpoints),
      ),
    )
    setSending(sendingOf(written, ended))
    if (written.type !== "written") return
    setTouched(false)
    setForm(standingForm())
  }
  const refused = (): (Sending & { type: "refused" }) | undefined => {
    const current = sending()
    return current.type === "refused" ? current : undefined
  }
  const failure = (): ApplicationError | undefined => {
    const current = sending()
    return current.type === "failed" ? current.error : undefined
  }
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3 border-t border-border bg-surface-2 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void send("going", false)
      }}
    >
      <div class="grid grid-cols-2 gap-3">
        <TextField
          label="AT間のゲーム数"
          value={form().sinceAt}
          onChange={(sinceAt) => typed({ sinceAt })}
          inputMode="numeric"
          suffix="G"
          error={errorOf("sinceAt")}
          invalid={nudge.red() && problemOf("sinceAt") !== undefined}
          onFocus={nudge.settle}
        />
        <TextField
          label="投資（累計）"
          value={form().outlay}
          onChange={(outlay) => typed({ outlay })}
          inputMode="numeric"
          suffix="円"
          error={errorOf("outlay")}
          invalid={nudge.red() && problemOf("outlay") !== undefined}
          onFocus={nudge.settle}
        />
      </div>
      <Show when={refused()} keyed>
        {(found) => (
          <div role="alert" class="flex flex-wrap items-center gap-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            <span class="flex-1">{describeAtReadingRefusal(found.refusal)}</span>
            <Show when={found.refusal.type === "counter-went-back"}>
              <Button size="small" variant="secondary" onClick={() => void send(found.ended, true)}>
                記録漏れのATを足して記録
              </Button>
            </Show>
          </div>
        )}
      </Show>
      <Show when={failure()} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
      <div class="flex gap-2">
        <Button type="submit">記録</Button>
        <Show when={props.cz}>
          <Button variant="secondary" onClick={() => void send("cz-missed", false)}>
            CZ失敗
          </Button>
        </Show>
        <Button variant="secondary" onClick={() => void send("at", false)}>
          AT当選
        </Button>
      </div>
    </form>
  )
}
