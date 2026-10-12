import { createEffect, createMemo, createResource, createSignal, Index, on, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { addCheckpoints, reviseCheckpoints } from "../../../../application/live-play"
import { weighPlay } from "../../../../application/pachislot/weighing"
import type { PlayDraft } from "../../../../core/live-play/draft"
import { daySeenOf } from "../../../../core/pachislot/observation"
import { atResultMatters } from "../../../../core/pachislot/path"
import {
  checkpointForReading,
  countCheckpoint,
  countedGamesOf,
  isCounting,
  startCountingCheckpoint,
  tallyNowOf,
  totalNowOf,
  type CounterRefusal,
} from "../../../../core/pachislot/reading"
import { stepsOf } from "../../../../core/pachislot/revision"
import { counterBonusesOf, counterBonusOf, countablesOf, type Countable, type Weighing } from "../../../../core/pachislot/weighing"
import { parsePlayLog, type Checkpoint, type PlayLogError, type Tally } from "../../../../core/play-log/checkpoint"
import { liveSummary } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError, describePlayLogError } from "../../../wording/errors"
import { formatCount } from "../../../wording/numbers"
import { describeCounterRefusal, observedOneInText, priorName } from "../../../wording/pachislot/formula"
import { ViewHeader } from "../../shell/ViewHeader"
import { AtFigures, AtReadingComposer, AtResultComposer } from "./AtPlay"
import { awaitsAtResult } from "./at-result-form"
import { CornerTerms } from "./CornerTerms"
import { OutlookPanel } from "./OutlookPanel"
import { StepReviser, type RevisedStep } from "./StepReviser"
import { Timeline } from "./Timeline"
import { readingFrom, readReadingForm, type ReadingField, type ReadingForm, type Standing } from "./reading-form"
import { RoleCounter, type CountDirection } from "./RoleCounter"
import type { Write, Written } from "./write"

/** The reading at a step of the log, where that step is one: what a pressed row is set right from. */
const revisedStepOf = (ordered: readonly Checkpoint[], index: number): RevisedStep | undefined => {
  const step = stepsOf(ordered)[index]
  return step === undefined || step.type === "kept" ? undefined : step
}

/** A machine with no tables, for the moment no formula is known. */
const NO_MACHINE = { schemaVersion: 0, bet: 0, tables: [] }

const NO_BONUSES = (): string | undefined => undefined

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

/** Where the play stands by its log: the games played and the day's, the outlay, and each bonus of the day with how often it has come. */
function PlayFigures(props: { readonly ordered: readonly Checkpoint[]; readonly bonuses: readonly Countable[]; readonly day: { readonly games: number; readonly bonuses: Tally } | undefined }): JSX.Element {
  const outlay = (): number | undefined => props.ordered.findLast((checkpoint) => checkpoint.outlay !== undefined)?.outlay
  const dayGames = (): number => props.day?.games ?? totalNowOf(props.ordered)
  return (
    <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="打ったゲーム数" value={formatCount(props.ordered.at(-1)?.spins ?? 0)} note="G" />
      <Tile label="累計ゲーム数" value={formatCount(dayGames())} note="G" />
      <Tile label="投資" value={outlay() === undefined ? "—" : `¥${formatCount(outlay() ?? 0)}`} />
      <Index each={props.bonuses}>
        {(bonus) => (
          <Tile
            label={bonus().label}
            value={formatCount(props.day?.bonuses[bonus().id] ?? 0)}
            note={observedOneInText(dayGames(), props.day?.bonuses[bonus().id] ?? 0)}
          />
        )}
      </Index>
    </dl>
  )
}

/**
 * Where readings of the data counter are typed: the day's games, each bonus
 * and the outlay so far, each opening on where the play stands, to be typed
 * over. Until something is typed the form follows the play — a tap on a
 * tile moves the games it shows — and once a reading is kept it follows
 * again.
 */
function ReadingComposer(props: { readonly bonuses: readonly Countable[]; readonly standing: Standing; readonly write: Write }): JSX.Element {
  const app = useApp()
  const standingForm = createMemo(() =>
    readingFrom(
      props.standing,
      props.bonuses.map((bonus) => bonus.id),
    ),
  )
  const [form, setForm] = createSignal<ReadingForm>(standingForm())
  const [touched, setTouched] = createSignal(false)
  createEffect(
    on(standingForm, (next) => {
      if (!touched()) setForm(next)
    }),
  )
  const [sending, setSending] = createSignal<{ readonly type: "typing" } | { readonly type: "keeping" } | Written<CounterRefusal>>({ type: "typing" })
  const nudge = createNudge()
  const read = () =>
    readReadingForm(
      form(),
      props.standing.bonuses,
      props.bonuses.map((bonus) => bonus.id),
    )
  const problemOf = (field: ReadingField) => {
    const found = read()
    return found.ok ? undefined : found.error.find((problem) => JSON.stringify(problem.field) === JSON.stringify(field))
  }
  const errorOf = (field: ReadingField): string | undefined => (problemOf(field)?.reason === "not-a-count" ? "整数で入力してください。" : undefined)
  const invalid = (field: ReadingField): boolean => nudge.red() && problemOf(field) !== undefined
  const typed = (change: Partial<ReadingForm>): void => {
    setTouched(true)
    setForm((current) => ({ ...current, ...change }))
    setSending({ type: "typing" })
  }
  const send = async (): Promise<void> => {
    settleTyping()
    const reading = read()
    if (sending().type === "keeping") return
    if (!reading.ok) {
      nudge.nudge()
      return
    }
    setSending({ type: "keeping" })
    const at = app.services.now()
    const written = await props.write((ordered) => {
      const made = checkpointForReading(ordered, { ...reading.value, at })
      return made.ok ? Ok([made.value]) : Err(made.error)
    })
    setSending(written.type === "written" ? { type: "typing" } : written)
    if (written.type !== "written") return
    setTouched(false)
    setForm(standingForm())
    toast({ title: "記録しました", stays: "glance" })
  }
  const refusal = (): CounterRefusal | undefined => {
    const current = sending()
    return current.type === "refused" ? current.refusal : undefined
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
        void send()
      }}
    >
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField
          label="累計ゲーム数"
          value={form().total}
          onChange={(total) => typed({ total })}
          inputMode="numeric"
          suffix="G"
          error={errorOf("total")}
          invalid={invalid("total")}
          onFocus={nudge.settle}
        />
        <Index each={props.bonuses}>
          {(bonus) => (
            <TextField
              label={bonus().label}
              value={form().bonuses[bonus().id] ?? ""}
              onChange={(count) => typed({ bonuses: { ...form().bonuses, [bonus().id]: count } })}
              inputMode="numeric"
              suffix="回"
              error={errorOf({ bonus: bonus().id })}
              invalid={invalid({ bonus: bonus().id })}
              onFocus={nudge.settle}
            />
          )}
        </Index>
        <TextField
          label="投資（累計）"
          value={form().outlay}
          onChange={(outlay) => typed({ outlay })}
          inputMode="numeric"
          suffix="円"
          error={errorOf("outlay")}
          invalid={invalid("outlay")}
          onFocus={nudge.settle}
        />
      </div>
      <Show when={refusal()} keyed>
        {(refused) => (
          <p role="alert" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            {describeCounterRefusal(refused, (id) => props.bonuses.find((bonus) => bonus.id === id)?.label ?? id)}
          </p>
        )}
      </Show>
      <Show when={failure()} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
      <div>
        <Button type="submit">記録</Button>
      </div>
    </form>
  )
}

/**
 * Counting small wins and bonuses as they come, beneath the counter's
 * readings: off until the player starts it, then a tile for everything the
 * formula has. A tap is kept at once; the next reading of the counter says
 * how many games the counting has covered.
 */
function Counting(props: { readonly weighing: Weighing; readonly ordered: readonly Checkpoint[]; readonly write: Write }): JSX.Element {
  const app = useApp()
  const [direction, setDirection] = createSignal<CountDirection>("up")
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const kept = (written: Written<never>): void => {
    setFailure(written.type === "failed" ? written.error : undefined)
  }
  const start = (): void => {
    const at = app.services.now()
    void props.write((ordered) => Ok([startCountingCheckpoint(ordered, at)])).then(kept)
  }
  const count = (id: string, by: 1 | -1): void => {
    const at = app.services.now()
    void props.write((ordered) => Ok([countCheckpoint(ordered, id, by, at)])).then(kept)
  }
  return (
    <section class="flex flex-col gap-3">
      <Show
        when={isCounting(props.ordered)}
        fallback={
          <div class="flex flex-col items-start gap-2">
            <Button variant="secondary" onClick={start}>
              小役も数える
            </Button>
            <p class="text-xs text-text-muted">ブドウやチェリー、単独・重複のボーナスまで数えると、設定の見込みがより確かになります。数え始めたら、最後まで数えてください。</p>
          </div>
        }
      >
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-xs font-bold uppercase tracking-wide text-text-secondary">
            小役カウンター <span class="ml-2 font-normal normal-case tabular-nums text-text-muted">数え始めてから {formatCount(countedGamesOf(props.ordered))}G</span>
          </h3>
          <Button size="small" variant="secondary" aria-pressed={direction() === "down"} onClick={() => setDirection(direction() === "up" ? "down" : "up")}>
            {direction() === "up" ? "取り消しモードへ" : "数えるモードへ"}
          </Button>
        </div>
        <RoleCounter
          countables={countablesOf(props.weighing.formula)}
          counts={tallyNowOf(props.ordered)}
          games={countedGamesOf(props.ordered)}
          direction={direction()}
          onCount={count}
        />
        <p class="text-xs text-text-muted">ゲーム数は、データカウンターの累計ゲーム数を記録したときに進みます。</p>
      </Show>
      <Show when={failure()} keyed>
        {(error) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </p>
        )}
      </Show>
    </section>
  )
}

/** The setting levels' odds and what the play is worth, inferred again whenever the log changes. */
function Outlook(props: { readonly draft: PlayDraft; readonly weighing: Weighing; readonly ordered: readonly Checkpoint[] }): JSX.Element {
  const app = useApp()
  const [outlook] = createResource(
    () => ({ weighing: props.weighing, ordered: props.ordered, terms: props.draft.venue.terms }),
    (source) => weighPlay(app.services.pachislot, source.weighing, source.ordered, source.terms),
  )
  return <Loaded outcome={outlook()}>{(found) => <OutlookPanel outlook={found} prior={priorName(props.weighing.prior)} />}</Loaded>
}

const orderedOf = (draft: PlayDraft) => {
  const parsed = parsePlayLog(draft.log)
  return parsed.ok ? Ok(inPlayOrder(parsed.value)) : parsed
}

/**
 * A pachislot play in progress, followed at the cabinet: where it stands,
 * how likely each setting level is and what the play is worth — for a
 * machine from the catalog — its readings in order, the counting tiles, and
 * the place to read the counter. The view is kept while the play is: what it
 * shows is worked out afresh from the log, and writes go one after another
 * from the log as it stands, so taps quicker than the screen reloads are
 * each kept. A reading of the counter, pressed, is set right or taken away
 * where the next one would be typed, and every line after it is made again;
 * the log's last line, whatever it is, can be taken away a line at a time.
 */
export function LivePlay(props: { readonly place: Place; readonly draft: PlayDraft; readonly title: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  /** The draft as this screen last wrote it, with the log the screen had been given when it did: it stands until the screen is given a log that has caught up. */
  const [mine, setMine] = createSignal<{ readonly draft: PlayDraft; readonly over: string } | undefined>(undefined)
  const current = (): PlayDraft => {
    const local = mine()
    if (local === undefined || local.draft.id !== props.draft.id) return props.draft
    return local.draft.log.length > props.draft.log.length || local.over === props.draft.log ? local.draft : props.draft
  }
  const [undoFailure, setUndoFailure] = createSignal<ApplicationError | undefined>(undefined)
  const ordered = createMemo(() => orderedOf(current()))
  const checkpoints = (): readonly Checkpoint[] | undefined => {
    const found = ordered()
    return found.ok ? found.value : undefined
  }
  const failure = (): PlayLogError | undefined => {
    const found = ordered()
    return found.ok ? undefined : found.error
  }
  /** The reading being set right, by its step in the log; held as one value so that it stands while the log around it is written. */
  const [revising, setRevising] = createSignal<{ readonly index: number } | undefined>(undefined)
  const keepNow = async <R,>(keep: typeof addCheckpoints, make: (ordered: readonly Checkpoint[]) => Result<readonly Checkpoint[], R>): Promise<Written<R>> => {
    const base = current()
    const now = orderedOf(base)
    if (!now.ok) return { type: "unreadable" }
    const made = make(now.value)
    if (!made.ok) return { type: "refused", refusal: made.error }
    const kept = await keep(app.services.drafts, base, made.value)
    if (!kept.ok) {
      setMine(undefined)
      return { type: "failed", error: kept.error }
    }
    setMine({ draft: kept.value, over: props.draft.log })
    app.wrote()
    return { type: "written" }
  }
  /** Takes the log's last line away: a reading, a tap or a result kept by mistake. The seat as it was found is never taken. */
  const undoNow = async (): Promise<void> => {
    const base = current()
    const now = orderedOf(base)
    if (!now.ok || now.value.length <= 1) return
    const kept = await reviseCheckpoints(app.services.drafts, base, now.value.slice(0, -1))
    setUndoFailure(kept.ok ? undefined : kept.error)
    setMine(kept.ok ? { draft: kept.value, over: props.draft.log } : undefined)
    if (kept.ok) app.wrote()
  }
  const held: { chain: Promise<unknown> } = { chain: Promise.resolve() }
  const inTurn =
    (keep: typeof addCheckpoints): Write =>
    (make) => {
      const turn = held.chain.then(() => keepNow(keep, make))
      held.chain = turn
      return turn
    }
  const write = inTurn(addCheckpoints)
  /** Puts the log made in place of the one there is, where `write` adds to it. */
  const rewrite = inTurn(reviseCheckpoints)
  const undo = (): void => {
    setRevising(undefined)
    held.chain = held.chain.then(undoNow)
  }
  const weighing = (): Weighing | undefined => props.draft.pachislot
  const shownAs = () => {
    const found = weighing()
    return found === undefined ? NO_BONUSES : counterBonusOf(found.formula.normalized)
  }
  const atRules = () => weighing()?.formula.normalized.atRules
  const bonuses = (): readonly Countable[] => {
    const found = weighing()
    return found === undefined || atRules() !== undefined ? [] : counterBonusesOf(found.formula)
  }
  return (
    <MainContent
      header={
        <ViewHeader
          place={props.place}
          title={props.title}
          actions={
            <Button size="small" onClick={() => moves.go({ kind: "live-record", playId: props.draft.id })}>
              遊技を終了
            </Button>
          }
        />
      }
    >
      <div class="flex min-h-full max-w-5xl flex-col">
        <Show
          when={checkpoints()}
          fallback={
            <Show when={failure()} keyed>
              {(error) => (
                <div role="alert" class="m-4 rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-text-primary">
                  {describePlayLogError(error)}
                </div>
              )}
            </Show>
          }
        >
          {(found) => {
            const day = () => daySeenOf(found(), shownAs())
            const composers = (): JSX.Element => (
              <>
                <Show when={atResultMatters(weighing()?.formula.normalized ?? NO_MACHINE) && awaitsAtResult(found())}>
                  <AtResultComposer write={write} normalized={weighing()?.formula.normalized ?? NO_MACHINE} />
                </Show>
                <Show when={atRules() === undefined} fallback={<AtReadingComposer standing={{ sinceAt: liveSummary(found()).counterNow, outlay: liveSummary(found()).outlay }} write={write} cz={atRules()?.trigger !== undefined} />}>
                  <ReadingComposer bonuses={bonuses()} standing={{ total: day()?.games ?? totalNowOf(found()), bonuses: day()?.bonuses ?? {}, outlay: liveSummary(found()).outlay }} write={write} />
                </Show>
              </>
            )
            return (
              <div class="flex flex-1 flex-col">
                <div class="flex flex-1 flex-col gap-5 p-4">
                  <CornerTerms draft={props.draft} />
                  <Show when={atRules()} fallback={<PlayFigures ordered={found()} bonuses={bonuses()} day={day()} />}>
                    <AtFigures ordered={found()} normalized={weighing()?.formula.normalized ?? NO_MACHINE} />
                  </Show>
                  <Show when={weighing()}>
                    {(weighed) => (
                      <>
                        <Outlook draft={props.draft} weighing={weighed()} ordered={found()} />
                        <Show when={atRules() === undefined}>
                          <Counting weighing={weighed()} ordered={found()} write={write} />
                        </Show>
                      </>
                    )}
                  </Show>
                  <Timeline checkpoints={found()} bonuses={bonuses()} revising={revising()?.index} onRevise={(index) => setRevising({ index })} />
                  <Show when={found().length > 1}>
                    <div class="flex flex-col items-start gap-2">
                      <Button variant="ghost" size="small" onClick={undo}>
                        最後の記録を取り消す
                      </Button>
                      <Show when={undoFailure()} keyed>
                        {(error) => (
                          <p role="alert" class="text-xs text-negative">
                            {describeError(error)}
                          </p>
                        )}
                      </Show>
                    </div>
                  </Show>
                </div>
                <div class="sticky bottom-0">
                  <Show when={revising()} keyed fallback={composers()}>
                    {(doing) => (
                      <Show when={revisedStepOf(found(), doing.index)} fallback={composers()}>
                        {(step) => <StepReviser index={doing.index} step={step()} bonuses={bonuses()} cz={atRules()?.trigger !== undefined} rewrite={rewrite} onDone={() => setRevising(undefined)} />}
                      </Show>
                    )}
                  </Show>
                </div>
              </div>
            )
          }}
        </Show>
      </div>
    </MainContent>
  )
}
