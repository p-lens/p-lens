import { Show, type JSX } from "solid-js"

import { jackpotCountingOf } from "../../../../core/live-play/draft"
import type { Play } from "../../../../core/live-play/draft-reading"
import { consumptionOf } from "../../../../core/pachinko/consumption"
import { standingBefore, takenOf } from "../../../../core/pachinko/revision"
import { parsePlayLog, type Checkpoint } from "../../../../core/play-log/checkpoint"
import { liveSummary, minutesPlayedOf } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { LiveFigures } from "./LiveFigures"
import { Timeline } from "./Timeline"

const checkpointsOf = (play: Play): readonly Checkpoint[] | undefined => {
  const log = parsePlayLog(play.log)
  return log.ok ? inPlayOrder(log.value) : undefined
}

/**
 * One of the others' pachinko plays in a huddle, only to be looked at:
 * its figures in full and its readings in order, as its own screen shows
 * them, with no line to press or hold and nothing to type.
 */
export function HuddlePlay(props: { readonly play: Extract<Play, { readonly gameKind: "pachinko" }> }): JSX.Element {
  return (
    <Show when={checkpointsOf(props.play)} keyed>
      {(checkpoints) => {
        const terms = props.play.venue.terms
        return (
          <div class="flex flex-col gap-3">
            <LiveFigures
              summary={liveSummary(checkpoints, jackpotCountingOf(props.play))}
              replayed={standingBefore(checkpoints, takenOf(checkpoints).length, jackpotCountingOf(props.play)).replay}
              minutesPlayed={minutesPlayedOf(props.play.startedAt, checkpoints)}
              consumption={terms === undefined ? undefined : consumptionOf(checkpoints, terms, props.play.pachinko)}
              formula={props.play.pachinko}
              overEntry={props.play.overEntry}
              terms={terms}
              folded={false}
              beside={() => undefined}
            />
            <Timeline checkpoints={checkpoints} terms={terms} revising={undefined} onRevise={undefined} onMerge={undefined} />
          </div>
        )
      }}
    </Show>
  )
}
