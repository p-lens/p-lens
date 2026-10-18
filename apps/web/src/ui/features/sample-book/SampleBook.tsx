import * as DialogPrimitive from "@kobalte/core/dialog"
import { createEffect, createSignal, For, Index, Match, on, onCleanup, Show, Switch, type Accessor, type JSX } from "solid-js"
import type { RailItem } from "solid-gathering-shell"

import { makeSampleBook, type SampleEnd, type SampleReport } from "../../../application/sample-book/make-sample-book"
import type { BookId } from "../../../core/book/book"
import { previousDay } from "../../../core/calendar/calendar"
import { decimal } from "../../../core/decimal/decimal"
import { sampleTitleOf } from "../../../core/sample-book/title"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { Button } from "../../primitives/button"
import { DiceIcon } from "../../primitives/icons"
import { toast } from "../../primitives/toast"
import { formatDay } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { formatSignedYen, toneOf } from "../../wording/numbers"
import {
  CLOSE,
  describeSampleProblem,
  gatheringText,
  MADE_TOAST,
  madeText,
  MAKE,
  makingText,
  ofDaysText,
  OPEN,
  LOCATING_LINE,
  PASSING_LINES,
  placedLine,
  UNLOCATED_LINE,
  WAITING_LINE,
  REDRAW_LABEL,
  RESULT_LABEL,
  SAMPLE_ABOUT,
  SAMPLE_HEADING,
  SAMPLE_LABEL,
  SAMPLE_LINES,
  STOP,
  STOPPED_TEXT,
  THEORETICAL_LABEL,
  writingText,
} from "../../wording/sample-book"

const TONES = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-text-primary",
} as const

/** Where making a sample book is: not begun, under way and how far, made, stopped before anything was written, or failed and why. */
type Stage =
  | { readonly type: "ready" }
  | { readonly type: "running"; readonly report: SampleReport | undefined }
  | {
      readonly type: "made"
      readonly end: Extract<SampleEnd, { readonly type: "made" }>
    }
  | { readonly type: "stopped" }
  | { readonly type: "failed"; readonly reason: string }

const yenOf = (value: number): ReturnType<typeof decimal> => decimal(BigInt(Math.round(value)), 0)

function SignedYen(props: { readonly label: string; readonly value: number }): JSX.Element {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <dt class="text-xs text-text-muted">{props.label}</dt>
      <dd class={`text-lg font-semibold tabular-nums ${TONES[toneOf(yenOf(props.value))]}`}>{formatSignedYen(yenOf(props.value))}</dd>
    </div>
  )
}

/** A day being made: its number racing up against them all, the day, where it was played and at which machines, and what the book has come to so far. */
function Making(props: { readonly report: Extract<SampleReport, { readonly type: "making" }> }): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <p class="flex items-baseline gap-2">
        <span class="text-4xl font-bold tabular-nums text-text-primary">{props.report.done}</span>
        <span class="text-sm text-text-secondary">{makingText}</span>
        <span class="ml-auto text-xs tabular-nums text-text-muted">{ofDaysText(props.report.of)}</span>
      </p>
      <div class="h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
        <div
          class="h-full rounded-full bg-accent"
          style={{
            width: `${String((props.report.done / Math.max(1, props.report.of)) * 100)}%`,
          }}
        />
      </div>
      <div class="flex min-h-[8.5rem] flex-col gap-1">
        <Show when={props.report.day} keyed>
          {(day) => (
            <>
              <p class="text-xs text-text-muted">
                {formatDay(day.date)}・{day.parlor}
              </p>
              <ul class="flex flex-col gap-0.5 text-sm text-text-primary">
                <Index each={day.machines}>{(machine) => <li class="truncate">{machine()}</li>}</Index>
              </ul>
            </>
          )}
        </Show>
      </div>
      <dl class="flex flex-col gap-1 border-t border-border pt-2">
        <SignedYen label={RESULT_LABEL} value={props.report.result} />
        <SignedYen label={THEORETICAL_LABEL} value={props.report.theoreticalValue} />
      </dl>
    </div>
  )
}

/** A line said while a sample book gets ready: what it is really doing, or something said in passing. A count of the machines read stands in for the one before it. */
interface Line {
  readonly kind: "gathering" | "said"
  readonly text: string
}

/** How long each step of getting ready is held, so what it says is read, and how often something is said in passing meanwhile. */
const STEP_PAUSE = 1400

const PASSING_EVERY = 650

/** How many of the lines said are kept in sight, the newest last. */
const LINES_SHOWN = 5

const linesOf = (report: SampleReport): readonly Line[] => {
  switch (report.type) {
    case "locating":
      return [{ kind: "said", text: LOCATING_LINE }]
    case "placed":
      return [...(report.located ? [] : [{ kind: "said", text: UNLOCATED_LINE } as const]), { kind: "said", text: placedLine(report.prefecture, report.parlors) }]
    case "gathering":
      return [{ kind: "gathering", text: gatheringText(report.done, report.of) }]
    case "making":
    case "writing":
      return []
  }
}

const withLines = (lines: readonly Line[], added: readonly Line[]): readonly Line[] =>
  added.reduce((all, line) => (line.kind === "gathering" && all.at(-1)?.kind === "gathering" ? [...all.slice(0, -1), line] : [...all, line]), lines)

/** Getting ready, as an installer tells it: one line after another, the newest turning, those before it fading above. */
function Preparing(props: { readonly lines: readonly Line[] }): JSX.Element {
  const shown = (): readonly Line[] => props.lines.slice(-LINES_SHOWN)
  return (
    <div class="flex min-h-[8.5rem] flex-col justify-end gap-1.5" aria-live="polite">
      <Index each={shown()}>
        {(line, index) => (
          <Show when={index === shown().length - 1} fallback={<p class="truncate text-xs text-text-muted">{line().text}</p>}>
            <p class="flex items-center gap-2 text-sm text-text-primary">
              <span class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
              <span class="min-w-0 truncate">{line().text}</span>
            </p>
          </Show>
        )}
      </Index>
    </div>
  )
}

function Running(props: { readonly report: SampleReport | undefined; readonly lines: readonly Line[] }): JSX.Element {
  return (
    <Switch fallback={<Preparing lines={props.lines} />}>
      <Match when={props.report?.type === "making" ? props.report : undefined}>{(report) => <Making report={report()} />}</Match>
      <Match when={props.report?.type === "writing" ? props.report : undefined} keyed>
        {(report) => <p class="text-sm text-text-secondary">{writingText(report.done, report.of)}</p>}
      </Match>
    </Switch>
  )
}

/**
 * Making a sample book, laid over whatever screen the person is on: its
 * title, with a die to draw another picture, and a button to make it; then
 * its days racing up as they are played, each day's parlor and machines
 * shown as it goes by, and what the book has come to so far; then what it
 * came to, and the book to open. Stopped before it is written, nothing is
 * left behind.
 */
function SampleBookDialog(props: { readonly open: boolean; readonly titles: readonly string[]; readonly onClose: () => void }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [stage, setStage] = createSignal<Stage>({ type: "ready" })
  const [unnamed, setUnnamed] = createSignal(app.services.unnamedTitle(props.titles))
  const [lines, setLines] = createSignal<readonly Line[]>([])
  const held: { cancelled: boolean; passing: number } = { cancelled: false, passing: Math.floor(Math.random() * PASSING_LINES.length) }
  const title = (): string => sampleTitleOf(unnamed())
  const preparing = (): boolean => ((current) => current.type === "running" && current.report?.type !== "making" && current.report?.type !== "writing")(stage())
  createEffect(
    on(preparing, (now) => {
      if (!now) return
      const timer = setInterval(() => {
        held.passing += 1
        setLines((said) => withLines(said, [{ kind: "said", text: PASSING_LINES[held.passing % PASSING_LINES.length] ?? "" }]))
      }, PASSING_EVERY)
      onCleanup(() => clearInterval(timer))
    }),
  )
  const writing = (): boolean => ((current) => current.type === "running" && current.report?.type === "writing")(stage())
  const close = (): void => {
    if (writing()) return
    held.cancelled = true
    if (stage().type !== "running") setStage({ type: "ready" })
    props.onClose()
  }
  const make = async (): Promise<void> => {
    if (stage().type === "running") return
    held.cancelled = false
    setLines([{ kind: "said", text: WAITING_LINE }])
    setStage({ type: "running", report: undefined })
    const services = app.services
    const made = await makeSampleBook(
      {
        session: services.session,
        maker: services.sampleMaker,
        catalog: services.catalog,
        parlors: services.parlors,
        locate: services.locate,
        deletion: services.deletion,
      },
      {
        title: title(),
        fresh: services.firstBook(),
        businessDayTurn: services.preferences.businessDayTurn(),
        through: previousDay(services.businessDay()),
        seed: services.newSeed(),
      },
      {
        onReport: (report) => {
          setLines((said) => withLines(said, linesOf(report)))
          setStage({ type: "running", report })
        },
        pause: () => new Promise((resolve) => setTimeout(resolve, STEP_PAUSE)),
        cancelled: () => held.cancelled,
      },
    )
    if (!made.ok)
      return void setStage({
        type: "failed",
        reason: describeError(made.error),
      })
    if (!made.value.ok)
      return void setStage({
        type: "failed",
        reason: describeSampleProblem(made.value.error),
      })
    const end = made.value.value
    if (end.type === "cancelled") return void setStage(props.open ? { type: "stopped" } : { type: "ready" })
    setUnnamed(app.services.unnamedTitle([...props.titles, title()]))
    toast({ title: MADE_TOAST, description: title() })
    app.wrote()
    setStage({ type: "made", end })
  }
  const open = (bookId: BookId): void => {
    setStage({ type: "ready" })
    props.onClose()
    moves.go({ kind: "book", bookId })
  }
  return (
    <DialogPrimitive.Root
      open={props.open}
      onOpenChange={(isOpen) => {
        if (!isOpen) close()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-surface-0/80" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content class="flex max-h-full w-[min(26rem,100%)] flex-col gap-4 overflow-y-auto rounded-md border border-border bg-surface-1 p-5 shadow-lg outline-none">
            <DialogPrimitive.Title class="text-base font-semibold text-text-primary">{SAMPLE_HEADING}</DialogPrimitive.Title>
            <Switch>
              <Match when={stage().type === "ready" || stage().type === "stopped" || stage().type === "failed"}>
                <DialogPrimitive.Description as="div" class="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
                  <p>{SAMPLE_ABOUT}</p>
                </DialogPrimitive.Description>
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{title()}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    class="shrink-0"
                    aria-label={REDRAW_LABEL}
                    title={REDRAW_LABEL}
                    onClick={() => setUnnamed(app.services.unnamedTitle([...props.titles, unnamed()]))}
                  >
                    <DiceIcon />
                  </Button>
                  <Button type="button" class="shrink-0" onClick={() => void make()}>
                    {MAKE}
                  </Button>
                </div>
                <Show when={stage().type === "stopped"}>
                  <p class="text-sm text-text-muted">{STOPPED_TEXT}</p>
                </Show>
                <Show when={((current) => (current.type === "failed" ? current.reason : undefined))(stage())} keyed>
                  {(reason) => (
                    <p role="alert" class="text-sm text-negative">
                      {reason}
                    </p>
                  )}
                </Show>
              </Match>
              <Match when={((current) => (current.type === "running" ? current : undefined))(stage())}>
                {(running) => (
                  <>
                    <Running report={running().report} lines={lines()} />
                    <Show when={!writing()}>
                      <div class="flex justify-end">
                        <Button type="button" variant="secondary" onClick={close}>
                          {STOP}
                        </Button>
                      </div>
                    </Show>
                  </>
                )}
              </Match>
              <Match when={((current) => (current.type === "made" ? current.end : undefined))(stage())} keyed>
                {(end) => (
                  <>
                    <p class="text-sm text-text-secondary">{madeText(end.days, end.tallies)}</p>
                    <dl class="flex flex-col gap-1">
                      <SignedYen label={RESULT_LABEL} value={end.result} />
                      <SignedYen label={THEORETICAL_LABEL} value={end.theoreticalValue} />
                    </dl>
                    <div class="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={close}>
                        {CLOSE}
                      </Button>
                      <Button type="button" onClick={() => open(end.bookId)}>
                        {OPEN}
                      </Button>
                    </div>
                  </>
                )}
              </Match>
            </Switch>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function SampleLetters(): JSX.Element {
  return (
    <span class="flex flex-col items-center gap-y-[3px] text-[16px] font-semibold leading-none tracking-tighter">
      <For each={SAMPLE_LINES}>{(line) => <span>{line}</span>}</For>
    </span>
  )
}

/**
 * Making a sample book from the rail: its place on the rail, a space of
 * its own above settings that opens it, and what it opens, to be set
 * beside the rail. The books there are what a new one's picture is kept
 * apart from.
 */
export const useSampleBook = (titles: Accessor<readonly string[]>): { readonly item: () => RailItem; readonly view: () => JSX.Element } => {
  const [open, setOpen] = createSignal(false)
  return {
    item: () => ({
      id: "sample-book",
      label: SAMPLE_LABEL,
      icon: <SampleLetters />,
      selected: open(),
      onSelect: () => setOpen(true),
    }),
    view: () => <SampleBookDialog open={open()} titles={titles()} onClose={() => setOpen(false)} />,
  }
}
