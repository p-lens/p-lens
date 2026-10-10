import { createMemo, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { tokenValueOfDraft, type PlayDraft } from "../../../../core/live-play/draft"
import { consumptionOf, spinPerformanceOf } from "../../../../core/pachinko/consumption"
import { standingBefore, takenOf } from "../../../../core/pachinko/revision"
import { parsePlayLog, type Checkpoint, type PlayLogError } from "../../../../core/play-log/checkpoint"
import { liveSummary } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { Button } from "../../../primitives/button"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describePlayLogError } from "../../../wording/errors"
import { ViewHeader } from "../../shell/ViewHeader"
import { CornerTerms } from "./CornerTerms"
import { LiveFigures } from "./LiveFigures"
import { LiveHyenaHunt } from "./LiveHyenaHunt"
import { ReadingComposer } from "./ReadingComposer"
import { SeatComposer } from "./SeatComposer"
import { Timeline, type Revised } from "./Timeline"

/** What the composer is doing beside taking the next reading. */
type Work = Revised | { readonly type: "inserting"; readonly before: number }

/**
 * A pachinko play in progress: what it comes to so far, the 遊タイム狙い its
 * formula allows, its readings in order, and the place to add the next one
 * — or, a line pressed, to set it right, take it away, or put a reading
 * in before it.
 */
export function LivePlay(props: { readonly place: Place; readonly draft: PlayDraft; readonly title: string }): JSX.Element {
  const moves = useMoves()
  const parsed = createMemo(() => parsePlayLog(props.draft.log))
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
          actions={
            <Button size="small" onClick={() => moves.go({ kind: "live-record", playId: props.draft.id })}>
              収支を記帳
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
            const summary = liveSummary(checkpoints)
            const terms = props.draft.venue.terms
            const consumption = terms === undefined ? undefined : consumptionOf(checkpoints, terms)
            const measured = consumption?.measured
            return (
              <div class="flex flex-1 flex-col">
                <div class="flex flex-1 flex-col gap-3 p-3">
                  <CornerTerms draft={props.draft} />
                  <LiveFigures
                    summary={summary}
                    replayed={standingBefore(checkpoints, takenOf(checkpoints).length).replay}
                    consumption={consumption}
                    formula={props.draft.pachinko}
                    terms={terms}
                    beside={(formula) => (
                      <LiveHyenaHunt
                        formula={formula}
                        counterNow={summary.counterNow}
                        spinPerformance={measured === undefined || terms === undefined ? undefined : spinPerformanceOf(measured, terms)}
                        ballValue={tokenValueOfDraft(props.draft)}
                      />
                    )}
                  />
                  <Timeline checkpoints={checkpoints} revising={revised()} onRevise={setWork} />
                </div>
                <div class="sticky bottom-0">
                  <Show when={work()} keyed fallback={<ReadingComposer draft={props.draft} ordered={checkpoints} revising={undefined} inserting={undefined} onRevised={done} onInsertBefore={insertBefore} />}>
                    {(doing) => {
                      if (doing.type === "seat") return <SeatComposer draft={props.draft} ordered={checkpoints} onDone={done} />
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
