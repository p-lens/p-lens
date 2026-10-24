import type { OutlayDto, SunkSummaryDto } from "@p-lens/contracts/pachinko"
import { createEffect, createSignal, Index, Match, on, onCleanup, Show, Switch, type JSX } from "solid-js"

import type { Weighable } from "../../application/pachinko/inference"
import { basisOf, type Formula } from "../../core/pachinko/formula"
import { seal } from "../../mummer"
import type { RunningRun } from "../../pachinko-engine/client/client"
import type { EngineFailure } from "../../pachinko-engine/protocol/messages"
import { useApp } from "../../ui/context"
import { Button } from "../../ui/primitives/button"
import { PanelDialog } from "../../ui/primitives/dialog"
import { TextField } from "../../ui/primitives/text-field"
import { amountText } from "../../ui/wording/numbers"
import { describeEngineFailure } from "../../ui/wording/pachinko/engine"
import { borderFor, playCounter } from "../application/sunk"
import { askedOf, type Asked, type Typed } from "../core/counter"
import { doneShareOf, readingOf, spreadOf, type Reading, type Spread } from "../core/reading"
import { busyWordAt, delayOf, LEAST_RUN_MILLIS, shownShareOf, shownTrialsOf, stepsOf, type Step } from "../core/theatre"
import {
  borderText,
  describeProblem,
  playedText,
  progressText,
  rarityText,
  stepText,
  ROUGH,
  SEARCHING,
  SINCE_LAST_PLACEHOLDER,
  SPREAD_LABELS,
  STALLING_WORDS,
  SUNK_BUTTON,
  SUNK_LABELS,
  SUNK_LEAD,
  SUNK_SUFFIXES,
  SUNK_TITLE,
  TERMS_NOTE,
  unmatchedText,
  WORKING_WORDS,
} from "./wording"

/** Where a counter's run is: a press scolded for spins since the last jackpot typed against a day of none — said under the field as a press finds it, never as it is typed, since only one who knew better types them; or run. A finished or stopped one keeps what it had come to. */
type Run =
  | { readonly type: "idle" }
  | { readonly type: "scolded" }
  | { readonly type: "running"; readonly summary: SunkSummaryDto | undefined; readonly handle: RunningRun; readonly startedAt: number; readonly endedAt: number | undefined }
  | { readonly type: "staged"; readonly summary: SunkSummaryDto; readonly steps: readonly Step[]; readonly shown: number }
  | { readonly type: "finished"; readonly summary: SunkSummaryDto }
  | { readonly type: "cancelled"; readonly summary: SunkSummaryDto | undefined }
  | { readonly type: "failed"; readonly failure: EngineFailure }

const outlayOf = (reading: Reading): (Reading & { type: "outlay" }) | undefined => (reading.type === "outlay" ? reading : undefined)

/** The spread of what the days took where it is said once, its middle half as wide as its middle eight tenths. */
const spreadOnceOf = (outlay: OutlayDto): (Spread & { type: "one" }) | undefined => ((spread) => (spread.type === "one" ? spread : undefined))(spreadOf(outlay))


function Yen(props: { readonly value: number }): JSX.Element {
  return <span class="tabular-nums">¥{amountText(seal.formula(props.value))}</span>
}

function Figure(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div>
      <dt class="text-xs text-text-muted">{props.label}</dt>
      <dd>{props.children}</dd>
    </div>
  )
}

/** What a run has come to: the cash the cabinet took, its spread and how seldom such a day comes, or that no day matched. */
function Outcome(props: { readonly summary: SunkSummaryDto; readonly dryFor: number }): JSX.Element {
  const reading = () => readingOf(props.summary, props.dryFor)
  return (
    <Switch>
      <Match when={outlayOf(reading())}>
        {(found) => (
          <div class="flex flex-col gap-2">
            <p class="text-sm">
              投資はだいたい <span class="text-lg font-bold"><Yen value={found().outlay.middle} /></span>
            </p>
            <Switch>
              <Match when={spreadOnceOf(found().outlay)}>
                {(spread) => (
                  <dl class="text-sm">
                    <Figure label={SPREAD_LABELS.both}>
                      <Yen value={spread().low} />〜<Yen value={spread().high} />
                    </Figure>
                  </dl>
                )}
              </Match>
              <Match when={spreadOf(found().outlay).type === "two"}>
                <dl class="grid grid-cols-2 gap-2 text-sm">
                  <Figure label={SPREAD_LABELS.half}>
                    <Yen value={found().outlay.lower} />〜<Yen value={found().outlay.upper} />
                  </Figure>
                  <Figure label={SPREAD_LABELS.most}>
                    <Yen value={found().outlay.low} />〜<Yen value={found().outlay.high} />
                  </Figure>
                </dl>
              </Match>
            </Switch>
            <Show when={found().rarity} keyed>
              {(rarity) => <p class="text-sm font-bold">{rarityText(rarity)}</p>}
            </Show>
            <Show when={found().rough}>
              <p class="text-xs text-text-muted">{ROUGH}</p>
            </Show>
          </div>
        )}
      </Match>
      <Match when={reading().type === "unmatched"}>
        <p class="text-sm text-text-secondary">{props.summary.finished ? unmatchedText(props.summary.trials) : SEARCHING}</p>
      </Match>
    </Switch>
  )
}

/** How far a run, or a dry day being worked out, is: the whole width, the same bar whichever it is, with nothing beside it. */
function ProgressBar(props: { readonly share: number }): JSX.Element {
  return <progress class="h-2 w-full accent-accent" max={1} value={props.share} />
}

/** The last steps shown of a dry day being worked out. */
const STEPS_SHOWN = 6

/**
 * A dry day being worked out, step by step, in far finer steps than it
 * takes, the last few steps rising as each comes: its cash faster than it
 * can be read, its rarity at leisure.
 */
function Staged(props: { readonly steps: readonly Step[]; readonly shown: number }): JSX.Element {
  const recent = () => props.steps.slice(Math.max(0, props.shown - STEPS_SHOWN), props.shown)
  return (
    <div class="flex flex-col gap-2">
      <ProgressBar share={props.shown / Math.max(1, props.steps.length)} />
      <ol class="flex h-24 flex-col justify-end overflow-hidden font-mono text-xs text-text-muted">
        <Index each={recent()}>{(step, index) => <li classList={{ "text-text-primary font-bold": index === recent().length - 1 }}>{stepText(step())}</li>}</Index>
      </ol>
    </div>
  )
}

/** How often a running bar moves on. */
const TICK_MILLIS = 50

/** The form and the run, for a machine that has a formula to play out by. */
function Counter(props: { readonly weighable: Weighable; readonly ballValue: number | undefined }): JSX.Element {
  const app = useApp()
  const border = () => borderFor(props.weighable, props.ballValue)
  const [spins, setSpins] = createSignal("")
  const [jackpots, setJackpots] = createSignal("0")
  const [sinceLast, setSinceLast] = createSignal("")
  const [spinPerformance, setSpinPerformance] = createSignal(border().toFixed(1))
  const [pressed, setPressed] = createSignal(false)
  const [run, setRun] = createSignal<Run>({ type: "idle" })
  const held: { staging: ReturnType<typeof setTimeout> | undefined; ticking: ReturnType<typeof setInterval> | undefined } = { staging: undefined, ticking: undefined }
  const [now, setNow] = createSignal(Date.now())
  const stopStaging = (): void => {
    clearTimeout(held.staging)
    held.staging = undefined
  }
  const stopTicking = (): void => {
    clearInterval(held.ticking)
    held.ticking = undefined
  }
  /** A run that ended before `LEAST_RUN_MILLIS`, let end once they are up. */
  const tick = (): void => {
    setNow(Date.now())
    const current = run()
    if (current.type !== "running") return stopTicking()
    if (current.endedAt !== undefined && current.summary !== undefined && now() - current.startedAt >= LEAST_RUN_MILLIS) {
      stopTicking()
      setRun({ type: "finished", summary: current.summary })
    }
  }
  /** Stop a run: one still going is cancelled, and one already ended and only shown running is let end at once. */
  const stop = (current: Run & { type: "running" }): void => {
    if (current.endedAt === undefined) return current.handle.cancel()
    stopTicking()
    if (current.summary !== undefined) setRun({ type: "finished", summary: current.summary })
  }
  /** The next step of a dry day being worked out, after the one shown has stayed its while; what it took, after the last. */
  const nextStep = (): void => {
    const now = run()
    if (now.type !== "staged") return
    if (now.shown >= now.steps.length) return void setRun({ type: "finished", summary: now.summary })
    const step = now.steps[now.shown]
    setRun({ ...now, shown: now.shown + 1 })
    held.staging = setTimeout(nextStep, step === undefined ? 0 : delayOf(step, now.steps))
  }
  /** Show a dry day being worked out before what it took: its cash rattled through, its rarity a step at a time, and then the figures. */
  const stage = (summary: SunkSummaryDto, asked: Asked): void => {
    const steps = stepsOf({ spins: asked.counter.spins, spinPerformance: asked.spinPerformance, outlay: summary.outlay?.middle ?? 0, hitChance: props.weighable.basis.normalized.hitChance })
    setRun({ type: "staged", summary, steps, shown: 0 })
    nextStep()
  }
  const typed = (): Typed => ({ spins: spins(), jackpots: jackpots(), sinceLast: sinceLast(), spinPerformance: spinPerformance() })
  const asked = () => askedOf(typed())
  const problemOn = (field: "spins" | "jackpots" | "since-last" | "spin-performance"): string | undefined => {
    const current = asked()
    if (!pressed() || current.ok) return undefined
    if (current.error.type === "since-not-spins") return field === "since-last" && run().type === "scolded" ? describeProblem(current.error) : undefined
    const type = current.error.type === "since-past-spins" ? "since-last" : current.error.type
    return type === field ? describeProblem(current.error) : undefined
  }
  const running = (): (Run & { type: "running" }) | undefined => {
    const current = run()
    return current.type === "running" ? current : undefined
  }
  const staged = (): (Run & { type: "staged" }) | undefined => {
    const current = run()
    return current.type === "staged" ? current : undefined
  }
  const failure = (): EngineFailure | undefined => {
    const current = run()
    return current.type === "failed" ? current.failure : undefined
  }
  /** What a run has come to, to show: a running one's only once it has run `LEAST_RUN_MILLIS`, so that the bar is not raced by the answer. */
  const shownSummary = (): SunkSummaryDto | undefined => {
    const current = run()
    if (current.type === "running") return now() - current.startedAt >= LEAST_RUN_MILLIS ? current.summary : undefined
    return current.type === "finished" || current.type === "cancelled" ? current.summary : undefined
  }
  /** The spins since the last jackpot of the counter being played out: the day's, where it had none or they were not read. */
  const dryFor = (): number => {
    const current = asked()
    return current.ok ? (current.value.counter.sinceLast ?? current.value.counter.spins) : 0
  }
  onCleanup(() => {
    running()?.handle.cancel()
    stopStaging()
    stopTicking()
  })
  /** A run belongs to the counter it was run for: when a figure changes, it is stopped and put away. */
  createEffect(
    on(
      () => [spins(), jackpots(), sinceLast(), spinPerformance()],
      () => {
        running()?.handle.cancel()
        stopStaging()
        stopTicking()
        setRun({ type: "idle" })
      },
      { defer: true },
    ),
  )
  const start = (): void => {
    setPressed(true)
    const current = asked()
    if (!current.ok) return current.error.type === "since-not-spins" ? void setRun({ type: "scolded" }) : undefined
    const handle = playCounter(app.services.pachinko, props.weighable, current.value, (event) => {
      switch (event.type) {
        case "progress":
          return setRun((now) => (now.type === "running" ? { ...now, summary: event.summary } : now))
        case "completed":
          if (event.summary.way === "dry") {
            stopTicking()
            return stage(event.summary, current.value)
          }
          return setRun((now) => (now.type === "running" ? { ...now, summary: event.summary, endedAt: Date.now() } : now))
        case "cancelled":
          return setRun({ type: "cancelled", summary: event.summary })
        case "failed":
          return setRun({ type: "failed", failure: event.failure })
      }
    })
    setNow(Date.now())
    setRun({ type: "running", summary: undefined, handle, startedAt: Date.now(), endedAt: undefined })
    held.ticking = setInterval(tick, TICK_MILLIS)
  }
  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-2">
        <TextField label={SUNK_LABELS.spins} value={spins()} onChange={setSpins} inputMode="numeric" suffix={SUNK_SUFFIXES.spins} compact invalid={problemOn("spins") !== undefined} error={problemOn("spins")} />
        <TextField label={SUNK_LABELS.jackpots} value={jackpots()} onChange={setJackpots} inputMode="numeric" suffix={SUNK_SUFFIXES.jackpots} compact error={problemOn("jackpots")} />
        <TextField label={SUNK_LABELS.sinceLast} value={sinceLast()} onChange={setSinceLast} inputMode="numeric" suffix={SUNK_SUFFIXES.sinceLast} placeholder={SINCE_LAST_PLACEHOLDER} compact error={problemOn("since-last")} />
        <div>
          <TextField label={SUNK_LABELS.spinPerformance} value={spinPerformance()} onChange={setSpinPerformance} inputMode="decimal" suffix={SUNK_SUFFIXES.spinPerformance} compact error={problemOn("spin-performance")} />
          <p class="mt-1 text-xs text-text-muted">{borderText(border())}</p>
        </div>
      </div>
      <Switch
        fallback={
          <div class="flex justify-end">
            <Button variant="secondary" onClick={start}>
              シミュレーション
            </Button>
          </div>
        }
      >
        <Match when={staged()}>{(now) => <Staged steps={now().steps} shown={now().shown} />}</Match>
        <Match when={running()}>
          {(current) => (
            <div class="flex flex-col gap-2">
              <ProgressBar share={shownShareOf(doneShareOf(current().summary), now() - current().startedAt)} />
              <div class="flex items-center gap-3">
                <span class="shrink-0 text-sm tabular-nums text-text-secondary">{progressText(shownTrialsOf(current().summary?.trials ?? 0, current(), now()))}</span>
                <span class="min-w-0 flex-1 truncate text-xs text-text-muted">{((words) => words[busyWordAt(now(), words.length)])(current().endedAt === undefined ? WORKING_WORDS : STALLING_WORDS)}</span>
                <Button variant="secondary" size="small" onClick={() => stop(current())}>
                  中止
                </Button>
              </div>
            </div>
          )}
        </Match>
      </Switch>
      <Show when={failure()} keyed>
        {(failed) => <p role="alert" class="text-sm text-negative">{describeEngineFailure(failed)}</p>}
      </Show>
      <Show when={shownSummary()} keyed>
        {(summary) => (
          <div class="flex flex-col gap-2">
            <Outcome summary={summary} dryFor={dryFor()} />
            <p class="text-xs text-text-muted">
              {playedText(summary.trials, summary.matched)}
              {TERMS_NOTE}
            </p>
          </div>
        )}
      </Show>
    </div>
  )
}

/**
 * ハマり台の投資額 on a formula's card beside 「これを使う」 — above it on a phone, at its left wider: a press opens
 * a panel where a cabinet's data counter is typed in and what it took in
 * cash played out by this formula. A formula with no basis has nothing to
 * play out from, and no button.
 */
export function SunkButton(props: { readonly formula: Formula; readonly ballValue: number | undefined }): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const weighable = (): Weighable | undefined => ((basis) => (basis === undefined ? undefined : { formula: props.formula, basis }))(basisOf(props.formula))
  return (
    <Show when={weighable()} keyed>
      {(found) => (
        <>
          <Button variant="secondary" size="small" onClick={() => setOpen(true)}>
            {SUNK_BUTTON}
          </Button>
          <PanelDialog open={open()} title={SUNK_TITLE} onClosed={() => setOpen(false)}>
            <p class="text-xs text-text-muted">{SUNK_LEAD}</p>
            <Counter weighable={found} ballValue={props.ballValue} />
          </PanelDialog>
        </>
      )}
    </Show>
  )
}
