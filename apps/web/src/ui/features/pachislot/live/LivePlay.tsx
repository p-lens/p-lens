import { createEffect, createMemo, createResource, createSignal, Index, on, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { addCheckpoints, reviseCheckpoints } from "../../../../application/live-play"
import { weighPlay } from "../../../../application/pachislot/weighing"
import type { PachislotDraft, PlayDraft } from "../../../../core/live-play/draft"
import { daySeenOf } from "../../../../core/pachislot/observation"
import { atEndingsOf, atResultMatters, type AtEnding, inAt } from "../../../../core/pachislot/path"
import {
  checkpointForReading,
  countCheckpoint,
  countedGamesOf,
  countsNowOf,
  totalNowOf,
  type CounterRefusal,
} from "../../../../core/pachislot/reading"
import { withStepsMerged, type Span } from "../../../../core/pachislot/merging"
import { stepsOf, withStepRemoved, type RevisionRefusal } from "../../../../core/pachislot/revision"
import { counterBonusesOf, counterBonusOf, countablesOf, countedOutOf, type Countable, type Weighing } from "../../../../core/pachislot/weighing"
import { parsePlayLog, type Checkpoint, type PlayLogError, type Counts } from "../../../../core/play-log/checkpoint"
import { liveSummary } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { Err, Ok, type Result } from "../../../../core/result/result"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { createNudge } from "../../../primitives/nudge"
import { Loaded } from "../../../primitives/states"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { feelTap } from "../../../primitives/vibration"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError, describePlayLogError } from "../../../wording/errors"
import { FIELD_PROBLEM_TEXT } from "../../../wording/fields"
import { amountText, formatCount } from "../../../wording/numbers"
import { seal } from "../../../../mummer"
import { describeCounterRefusal, observedOneInText, priorName } from "../../../wording/pachislot/formula"
import { CHANGED_SINCE_MERGED, CHANGED_SINCE_REMOVED, MERGE_FAILED, MERGED, READING_REMOVED, REMOVAL_TAKEN_BACK, TAKE_BACK, TAKE_BACK_FAILED, UNMERGED } from "../../../wording/pachislot/play"
import { triggerWordsOf } from "../../../wording/pachislot/trigger"
import { ViewHeader } from "../../shell/ViewHeader"
import { useHuddleUrge } from "../../huddle/huddle-urge"
import { AtCounting, AtFigures, AtReadingComposer, createAtReading } from "./AtPlay"
import { awaitsAtResult } from "./at-result-form"
import { CornerTerms } from "./CornerTerms"
import { createNoticeBoard, NoticeStack, type Post } from "./NoticeBoard"
import { OutlookPanel } from "./OutlookPanel"
import { StepReviser, type RevisedStep } from "./StepReviser"
import { Timeline } from "./Timeline"
import { readingFrom, readReadingForm, type ReadingField, type ReadingForm, type Standing } from "./reading-form"
import { RoleCounter } from "./RoleCounter"
import type { PlayTerms } from "../../../../core/parlor/terms"
import { HandTiles } from "./HandTiles"
import { Tile } from "./Tile"
import type { Write, Written } from "./write"

/** The reading at a step of the log, where that step is one: what a pressed row is set right from. */
const revisedStepOf = (ordered: readonly Checkpoint[], index: number): RevisedStep | undefined => {
  const step = stepsOf(ordered)[index]
  return step === undefined || step.type === "kept" ? undefined : step
}

/** A machine with no tables, for the moment no formula is known. */
export const NO_MACHINE = { schemaVersion: 0, bet: 0, tables: [] }

export const NO_BONUSES = (): string | undefined => undefined

/** The medals the play has drawn from savings so far, where the log says. */
const replayOf = (ordered: readonly Checkpoint[]): number | undefined => ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay

/** The medals in hand as last counted, where the log counted any. */
const heldOf = (ordered: readonly Checkpoint[]): number | undefined => ordered.findLast((checkpoint) => checkpoint.held !== undefined)?.held

/** Where the play stands by its log, three to a row: the cash spent, the games played and the day's, the medals drawn from savings, the medals in hand where last counted with what the play had come to there, and each bonus of the day with how often it has come. */
export function PlayFigures(props: { readonly ordered: readonly Checkpoint[]; readonly terms: PlayTerms | undefined; readonly bonuses: readonly Countable[]; readonly day: { readonly games: number; readonly bonuses: Counts } | undefined }): JSX.Element {
  const outlay = (): number | undefined => props.ordered.findLast((checkpoint) => checkpoint.outlay !== undefined)?.outlay
  const replay = (): number | undefined => replayOf(props.ordered)
  const dayGames = (): number => props.day?.games ?? totalNowOf(props.ordered)
  return (
    <dl class="grid grid-cols-3 gap-2">
      <Tile label="現金投資" value={outlay() === undefined ? "--" : `¥${amountText(seal.play(outlay() ?? 0))}`} />
      <Tile label="打ったゲーム数" value={formatCount(props.ordered.at(-1)?.spins ?? 0)} note="G" />
      <Tile label="累計ゲーム数" value={formatCount(dayGames())} note="G" />
      <Tile label="貯メダル" value={replay() === undefined ? "--" : formatCount(replay() ?? 0)} note="枚" />
      <HandTiles ordered={props.ordered} terms={props.terms} />
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
 * Where readings of the data counter are typed, in one row: the day's games,
 * the cash spent and the medals drawn from savings so far, and the medals
 * in hand, empty until counted — the bonuses
 * being counted on the tiles, a reading takes them as they stand — each opening on where the play stands, to be typed
 * over. Until something is typed the form follows the play — a tap on a
 * tile moves the games it shows — and once a reading is kept it follows
 * again.
 */
function ReadingComposer(props: { readonly bonuses: readonly Countable[]; readonly standing: Standing; readonly write: Write; readonly post: Post }): JSX.Element {
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
  const errorOf = (field: ReadingField): string | undefined => (problemOf(field)?.reason === "not-a-count" ? FIELD_PROBLEM_TEXT["not-a-count"] : undefined)
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
      const { held, ...counted } = reading.value
      const made = checkpointForReading(ordered, { ...counted, ...(held === undefined ? {} : { held }), at })
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
  props.post(() => {
    const refused = refusal()
    if (refused !== undefined) return { tone: "refused", said: describeCounterRefusal(refused, (id) => props.bonuses.find((bonus) => bonus.id === id)?.label ?? id) }
    const error = failure()
    return error === undefined ? undefined : { tone: "failed", said: describeError(error) }
  })
  return (
    <form autocomplete="off"
      class="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div class="grid grid-cols-4 items-end gap-1.5">
        <TextField
          label="累計G"
          value={form().total}
          onChange={(total) => typed({ total })}
          inputMode="numeric"
          suffix="G"
          error={errorOf("total")}
          invalid={invalid("total")}
          onFocus={nudge.settle}
          compact
        />
        <TextField
          label="投資"
          value={form().outlay}
          onChange={(outlay) => typed({ outlay })}
          inputMode="numeric"
          suffix="円"
          error={errorOf("outlay")}
          invalid={invalid("outlay")}
          onFocus={nudge.settle}
          compact
        />
        <TextField
          label="貯メダル"
          value={form().replay}
          onChange={(replay) => typed({ replay })}
          inputMode="numeric"
          suffix="枚"
          error={errorOf("replay")}
          invalid={invalid("replay")}
          onFocus={nudge.settle}
          compact
        />
        <TextField
          label="持ちメダル"
          value={form().held}
          onChange={(held) => typed({ held, heldCarried: false })}
          inputMode="numeric"
          suffix="枚"
          error={errorOf("held")}
          invalid={invalid("held")}
          onFocus={nudge.settle}
          compact
        />
      </div>
      <div>
        <Button type="submit" onClick={feelTap}>記録</Button>
      </div>
    </form>
  )
}

/**
 * Counting small wins and bonuses as they come, beneath the counter's
 * readings: a tile for everything the formula has, counted over the play
 * from its first game. A tap is kept at once; the next reading of the
 * counter says how many games the counting has covered. On an AT machine only regular
 * games are counted in, so a press while it is in an AT is passed over,
 * and that is said.
 */
function Counting(props: { readonly weighing: Weighing; readonly ordered: readonly Checkpoint[]; readonly write: Write; readonly post: Post }): JSX.Element {
  const app = useApp()
  const held = (): boolean => props.weighing.formula.normalized.atRules !== undefined && inAt(props.ordered)
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const kept = (written: Written<never>): void => {
    setFailure(written.type === "failed" ? written.error : undefined)
  }
  props.post(() => ((error) => (error === undefined ? undefined : { tone: "failed", said: describeError(error) }))(failure()))
  /** A tap, counted over the play from its first game. None while held. */
  const count = (id: string, by: 1 | -1): void => {
    if (held()) return
    const at = app.services.now()
    void props.write((ordered) => Ok([countCheckpoint(ordered, id, by, at)])).then(kept)
  }
  return (
    <section class="flex flex-col gap-3">
      <h3 class="text-xs font-bold uppercase tracking-wide text-text-secondary">
        小役カウンター
        <span class="ml-2 font-normal normal-case text-text-muted">長押しで1つ戻します</span>
      </h3>
      <RoleCounter
        countables={countablesOf(props.weighing.formula)}
        counts={countsNowOf(props.ordered)}
        outOf={countedOutOf(props.weighing.formula.normalized, countsNowOf(props.ordered), countedGamesOf(props.ordered))}
        held={held()}
        onCount={count}
      />
      <Show when={held()}>
        <p class="text-xs text-text-muted">AT中は数えません。ATのあとのゲーム数を記録すると、また数えられます。</p>
      </Show>
    </section>
  )
}

/** The setting levels' odds and what the play is worth, inferred again whenever the log changes. */
function Outlook(props: { readonly draft: PachislotDraft; readonly weighing: Weighing; readonly ordered: readonly Checkpoint[] }): JSX.Element {
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

/** A merging or a removal as it was done, to be taken back: the log it was made from, and the log's text as it left it. */
interface Rewritten {
  readonly before: readonly Checkpoint[]
  readonly left: string
}

/**
 * A pachislot play in progress, followed at the cabinet: its readings in a
 * strip across the top, the newest in view, then where it stands, how
 * likely each setting level is and what the play is worth — for a machine
 * from the catalog — the counting tiles, always there, and the place to
 * read the counter. The view is kept while the play is: what it
 * shows is worked out afresh from the log, and writes go one after another
 * from the log as it stands, so taps quicker than the screen reloads are
 * each kept. A reading of the counter, pressed, is set right or taken away
 * where the next one would be typed, and every line after it is made again;
 * the log's last line, whatever it is, can be taken away a line at a time.
 * A run of readings held and dragged over is made one line.
 */
export function LivePlay(props: {
  readonly place: Place
  readonly draft: PachislotDraft
  readonly title: string
}): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const urged = useHuddleUrge()
  /** The draft as this screen last wrote it, with the log the screen had been given when it did: it stands until the screen is given a log that has caught up. */
  const [mine, setMine] = createSignal<{ readonly draft: PachislotDraft; readonly over: string } | undefined>(undefined)
  const current = (): PachislotDraft => {
    const local = mine()
    if (local === undefined || local.draft.id !== props.draft.id) return props.draft
    return local.draft.log.length > props.draft.log.length || local.over === props.draft.log ? local.draft : props.draft
  }
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
  const board = createNoticeBoard()
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
    app.played()
    return { type: "written" }
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
  /**
   * Puts back the log a merging was made from, where the log still stands
   * as the merging left it: one changed since — a reading added, a tile
   * tapped — is left as it is, and that is said.
   */
  const unmerge = async (turn: Rewritten): Promise<void> => {
    const written = await rewrite(() => (current().log === turn.left ? Ok(turn.before) : Err({ type: "changed-since-merged" as const })))
    if (written.type !== "written") {
      toast({ title: TAKE_BACK_FAILED, ...(written.type === "failed" ? { description: describeError(written.error) } : written.type === "refused" ? { description: CHANGED_SINCE_MERGED } : {}), tone: "error" })
      return
    }
    setRevising(undefined)
    toast({ title: UNMERGED, stays: "glance" })
  }
  /** Puts back the log a removal was made from, where the log still stands as the removal left it, as a merging is taken back. */
  const unremove = async (turn: Rewritten): Promise<void> => {
    const written = await rewrite(() => (current().log === turn.left ? Ok(turn.before) : Err({ type: "changed-since-removed" as const })))
    if (written.type !== "written") {
      toast({ title: TAKE_BACK_FAILED, ...(written.type === "failed" ? { description: describeError(written.error) } : written.type === "refused" ? { description: CHANGED_SINCE_REMOVED } : {}), tone: "error" })
      return
    }
    setRevising(undefined)
    toast({ title: REMOVAL_TAKEN_BACK, stays: "glance" })
  }
  /** Takes a reading away, and says so with the way to take it back until the word is closed. */
  const removeStep = async (index: number): Promise<Written<RevisionRefusal>> => {
    const turn: { before: readonly Checkpoint[] | undefined } = { before: undefined }
    const written = await rewrite((ordered) => {
      turn.before = ordered
      return withStepRemoved(ordered, index)
    })
    const before = turn.before
    if (written.type === "written" && before !== undefined) {
      const done: Rewritten = { before, left: current().log }
      toast({ title: READING_REMOVED, action: { label: TAKE_BACK, onPress: () => void unremove(done) } })
    }
    return written
  }
  /**
   * Keeps the play's log with a run of its readings made one, and lets go
   * of any reading taken up: its place among the steps is no longer its
   * own. The word that it was done stays, with the way to take it back,
   * until it is closed.
   */
  const merge = async (span: Span): Promise<void> => {
    const turn: { before: readonly Checkpoint[] | undefined } = { before: undefined }
    const written = await rewrite((ordered) => {
      turn.before = ordered
      return withStepsMerged(ordered, span)
    })
    const done: Rewritten | undefined = turn.before === undefined ? undefined : { before: turn.before, left: current().log }
    if (written.type !== "written" || done === undefined) {
      toast({ title: MERGE_FAILED, ...(written.type === "failed" ? { description: describeError(written.error) } : {}), tone: "error" })
      return
    }
    setRevising(undefined)
    toast({ title: MERGED, action: { label: TAKE_BACK, onPress: () => void unmerge(done) } })
  }
  const weighing = (): Weighing | undefined => props.draft.pachislot
  const shownAs = () => {
    const found = weighing()
    return found === undefined ? NO_BONUSES : counterBonusOf(found.formula.normalized)
  }
  const atRules = () => weighing()?.formula.normalized.atRules
  const endings = (): readonly AtEnding[] => {
    const found = weighing()
    return found === undefined ? [] : atEndingsOf(found.formula.normalized, found.formula.labels)
  }
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
          urged={urged()}
          framed
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
            const atReading = createAtReading(() => ({ sinceAt: liveSummary(found()).counterNow, outlay: liveSummary(found()).outlay, replay: replayOf(found()), held: heldOf(found()) }), () => triggerWordsOf(weighing()?.formula.normalized), write, board.post)
            const composers = (): JSX.Element => (
              <Show when={atRules() === undefined} fallback={<AtReadingComposer reading={atReading} />}>
                <ReadingComposer bonuses={bonuses()} standing={{ total: day()?.games ?? totalNowOf(found()), bonuses: day()?.bonuses ?? {}, outlay: liveSummary(found()).outlay, replay: replayOf(found()), held: heldOf(found()) }} write={write} post={board.post} />
              </Show>
            )
            return (
              <div class="flex flex-1 flex-col">
                <div class="flex flex-1 flex-col gap-5 p-4">
                  <div class="-mb-2 flex flex-col gap-2">
                    <Timeline checkpoints={found()} bonuses={bonuses()} trigger={triggerWordsOf(weighing()?.formula.normalized)} endings={endings()} revising={revising()?.index} onRevise={(index) => setRevising({ index })} onMerge={merge} strip />
                    <hr class="border-border" />
                  </div>
                  <CornerTerms draft={props.draft} />
                  <Show when={atRules()} fallback={<PlayFigures ordered={found()} terms={props.draft.venue.terms} bonuses={bonuses()} day={day()} />}>
                    <AtFigures ordered={found()} terms={props.draft.venue.terms} normalized={weighing()?.formula.normalized ?? NO_MACHINE} />
                  </Show>
                  <Show when={weighing()}>
                    {(weighed) => (
                      <>
                        <Outlook draft={props.draft} weighing={weighed()} ordered={found()} />
                        <Show when={atRules() !== undefined}>
                          <AtCounting reading={atReading} ordered={found()} normalized={weighed().formula.normalized} endings={endings()} write={write} rewrite={rewrite} post={board.post} awaitsResult={atResultMatters(weighed().formula.normalized) && awaitsAtResult(found())} />
                        </Show>
                        <Show when={countablesOf(weighed().formula).length > 0}>
                          <Counting weighing={weighed()} ordered={found()} write={write} post={board.post} />
                        </Show>
                      </>
                    )}
                  </Show>
                </div>
                <div class="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-surface-2 p-4">
                  <NoticeStack notices={board.notices()} />
                  <Show when={revising()} keyed fallback={composers()}>
                    {(doing) => (
                      <Show when={revisedStepOf(found(), doing.index)} fallback={composers()}>
                        {(step) => <StepReviser index={doing.index} step={step()} bonuses={bonuses()} trigger={atRules()?.trigger === undefined ? undefined : triggerWordsOf(weighing()?.formula.normalized)} rewrite={rewrite} post={board.post} onRemove={() => removeStep(doing.index)} onDone={() => setRevising(undefined)} />}
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
