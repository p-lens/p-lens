import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { reviseCheckpoints } from "../../../../application/live-play"
import { loadFormula } from "../../../../application/pachinko/formulas"
import { reliefDriveOf } from "../../../../application/pachinko/hyena-hunt"
import { jackpotCountingOf, tokenValueOfDraft, type PachinkoDraft, type PlayDraft } from "../../../../core/live-play/draft"
import { consumptionOf, spinPerformanceOf } from "../../../../core/pachinko/consumption"
import { withReadingsMerged, type Span } from "../../../../core/pachinko/merging"
import { basisOf, type Basis } from "../../../../core/pachinko/formula"
import { supportPhaseOf } from "../../../../core/pachinko/reading"
import { gaugeNowOf, standingBefore, takenOf } from "../../../../core/pachinko/revision"
import { parsePlayLog, type Checkpoint, type PlayLogError } from "../../../../core/play-log/checkpoint"
import { liveSummary, minutesPlayedOf } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { ChevronDownIcon } from "../../../primitives/icons"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError, describePlayLogError } from "../../../wording/errors"
import { CHANGED_SINCE_MERGED, FOLD_FIGURES, MERGE_FAILED, MERGED, UNFOLD_FIGURES, TAKE_BACK, TAKE_BACK_FAILED, UNMERGED } from "../../../wording/pachinko/play"
import { ViewHeader } from "../../shell/ViewHeader"
import { useHuddleUrge } from "../../huddle/huddle-urge"
import { CornerTerms } from "./CornerTerms"
import { LiveFigures } from "./LiveFigures"
import { LiveHyenaHunt } from "./LiveHyenaHunt"
import { ReadingComposer } from "./ReadingComposer"
import { SeatComposer } from "./SeatComposer"
import { SupportComposer } from "./SupportComposer"
import { samePressed, Timeline, type Revised } from "./Timeline"

/** A merging as it was done: the log it was made from, and the play as it left it. */
interface Merged {
  readonly before: readonly Checkpoint[]
  readonly left: PlayDraft
}

/** What the composer is doing beside taking the next reading. */
type Work = Revised | { readonly type: "inserting"; readonly before: number }

/**
 * A pachinko play in progress: what it comes to so far, the 遊タイム狙い its
 * formula allows, its readings in order, and the place to add the next one
 * — or, a line pressed, to set it right, take it away, or put a reading
 * in before it. A run of readings held and dragged over is made one line.
 */
export function LivePlay(props: {
  readonly place: Place
  readonly draft: PachinkoDraft
  readonly title: string
}): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const urged = useHuddleUrge()
  const parsed = createMemo(() => parsePlayLog(props.draft.log))
  const [found] = createResource(
    () => (props.draft.pachinko === undefined ? undefined : { machineId: props.draft.pachinko.machineId, formulaId: props.draft.pachinko.id }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  /** The basis of the play's formula, read from the catalog since a play carries only its figures, where its machine has a 遊タイム. */
  const huntBasis = createMemo((): Basis | undefined => {
    const loaded = found()
    const basis = loaded?.ok === true ? basisOf(loaded.value.listing.formula) : undefined
    return basis !== undefined && reliefDriveOf(basis) !== undefined ? basis : undefined
  })
  const reliefDrive = (): number | undefined => {
    const basis = huntBasis()
    return basis === undefined ? undefined : reliefDriveOf(basis)
  }
  /** Whether the play's figures are all shown: they are folded to the few anyone reads first until a person unfolds them, and stay as the device was left. */
  const [unfolded, setUnfolded] = createSignal(app.services.preferences.figuresUnfolded("pachinko"))
  const fold = (): void => {
    const next = !unfolded()
    app.services.preferences.setFiguresUnfolded("pachinko", next)
    setUnfolded(next)
  }
  /** What the composer is doing beside taking the next reading: setting a line right, or putting a reading in before another. */
  const [work, setWork] = createSignal<Work | undefined>(undefined)
  const revised = (): Revised | undefined => {
    const doing = work()
    return doing === undefined || doing.type === "inserting" ? undefined : doing
  }
  const done = (): void => {
    setWork(undefined)
  }
  const insertBefore = (before: number): void => {
    setWork({ type: "inserting", before })
  }
  /**
   * Puts back the log a merging was made from. Written against the log as
   * the merging left it, so one changed since — a reading added, a line
   * set right — is left as it is, and that is said.
   */
  const unmerge = async (turn: Merged): Promise<void> => {
    const kept = await reviseCheckpoints(app.services.drafts, turn.left, turn.before)
    if (!kept.ok) {
      const changed = kept.error.type === "draft" && kept.error.error.type === "changed-elsewhere"
      toast({ title: TAKE_BACK_FAILED, description: changed ? CHANGED_SINCE_MERGED : describeError(kept.error), tone: "error" })
      return
    }
    setWork(undefined)
    toast({ title: UNMERGED, stays: "glance" })
    app.played()
  }
  /**
   * Keeps the play's log with a run of its readings made one, and lets go
   * of any line taken up: its place among the readings is no longer its
   * own. The word that it was done stays, with the way to take it back,
   * until it is closed.
   */
  const merge = async (checkpoints: readonly Checkpoint[], span: Span): Promise<void> => {
    const made = withReadingsMerged(checkpoints, span)
    if (!made.ok) {
      toast({ title: MERGE_FAILED, tone: "error" })
      return
    }
    const kept = await reviseCheckpoints(app.services.drafts, props.draft, made.value)
    if (!kept.ok) {
      toast({ title: MERGE_FAILED, description: describeError(kept.error), tone: "error" })
      return
    }
    setWork(undefined)
    toast({ title: MERGED, action: { label: TAKE_BACK, onPress: () => void unmerge({ before: checkpoints, left: kept.value }) } })
    app.played()
  }
  const ordered = (): readonly Checkpoint[] | undefined => {
    const log = parsed()
    return log.ok ? inPlayOrder(log.value) : undefined
  }
  const failure = (): PlayLogError | undefined => {
    const log = parsed()
    return log.ok ? undefined : log.error
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
          when={ordered()}
          keyed
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
          {(checkpoints) => {
            const summary = liveSummary(checkpoints, jackpotCountingOf(props.draft))
            const terms = props.draft.venue.terms
            const consumption = terms === undefined ? undefined : consumptionOf(checkpoints, terms)
            const measured = consumption?.measured
            return (
              <div class="flex flex-1 flex-col">
                <div class="flex flex-1 flex-col gap-3 p-3">
                  <CornerTerms
                    draft={props.draft}
                    between={
                      <button
                        type="button"
                        aria-expanded={unfolded()}
                        aria-label={unfolded() ? FOLD_FIGURES : UNFOLD_FIGURES}
                        title={unfolded() ? FOLD_FIGURES : UNFOLD_FIGURES}
                        onClick={fold}
                        class="flex h-5 w-10 items-center justify-center rounded-[3px] text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4"
                      >
                        <span classList={{ "rotate-180": unfolded() }}>
                          <ChevronDownIcon />
                        </span>
                      </button>
                    }
                  />
                  <LiveFigures
                    summary={summary}
                    replayed={standingBefore(checkpoints, takenOf(checkpoints).length).replay}
                    minutesPlayed={minutesPlayedOf(props.draft.startedAt, checkpoints)}
                    consumption={consumption}
                    formula={props.draft.pachinko}
                    overEntry={props.draft.overEntry}
                    terms={terms}
                    folded={!unfolded()}
                    beside={(formula) => (
                      <Show when={huntBasis()}>
                        {(basis) => (
                          <LiveHyenaHunt
                            draft={props.draft}
                            ordered={checkpoints}
                            formula={formula}
                            basis={basis()}
                            gaugeNow={gaugeNowOf(checkpoints)}
                            spinPerformance={measured === undefined || terms === undefined ? undefined : spinPerformanceOf(measured, terms)}
                            ballValue={tokenValueOfDraft(props.draft)}
                          />
                        )}
                      </Show>
                    )}
                  />
                  <Timeline checkpoints={checkpoints} terms={terms} revising={revised()} onRevise={(pressed) => (samePressed(pressed, revised()) ? done() : setWork(pressed))} onMerge={(span) => merge(checkpoints, span)} />
                </div>
                <div class="sticky bottom-0">
                  <Show
                    when={work()}
                    keyed
                    fallback={
                      <Show when={supportPhaseOf(checkpoints)} keyed fallback={<ReadingComposer draft={props.draft} ordered={checkpoints} revising={undefined} inserting={undefined} onRevised={done} onInsertBefore={insertBefore} />}>
                        {(phase) => <SupportComposer draft={props.draft} ordered={checkpoints} phase={phase} />}
                      </Show>
                    }
                  >
                    {(doing) => {
                      if (doing.type === "seat") return <SeatComposer draft={props.draft} ordered={checkpoints} reliefDrive={reliefDrive()} onDone={done} />
                      const taken = takenOf(checkpoints)
                      const before = doing.type === "inserting" ? doing.before : doing.index
                      const at = taken[before - 1]?.reading.at ?? checkpoints.at(0)?.at ?? ""
                      const revising = doing.type === "reading" ? taken[doing.index] : undefined
                      return (
                        <ReadingComposer
                          draft={props.draft}
                          ordered={checkpoints}
                          revising={revising === undefined ? undefined : { index: before, taken: revising }}
                          inserting={doing.type === "inserting" ? { before, at } : undefined}
                          onRevised={done}
                          onInsertBefore={insertBefore}
                        />
                      )
                    }}
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
