import { Show, type JSX } from "solid-js"

import type { Play } from "../../../../core/live-play/draft-reading"
import { consumptionOf } from "../../../../core/pachinko/consumption"
import { standingBefore, takenOf } from "../../../../core/pachinko/revision"
import { parsePlayLog, type Checkpoint } from "../../../../core/play-log/checkpoint"
import { liveSummary, minutesPlayedOf } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { LiveFigures } from "./LiveFigures"

const checkpointsOf = (play: Play): readonly Checkpoint[] | undefined => {
  const log = parsePlayLog(play.log)
  return log.ok ? inPlayOrder(log.value) : undefined
}

/** One of the others' pachinko plays as a huddle's card shows it: the figures a folded play shows, its mark beside its spin performance. */
export function HuddleFigures(props: { readonly play: Extract<Play, { readonly gameKind: "pachinko" }> }): JSX.Element {
  return (
    <Show when={checkpointsOf(props.play)} keyed>
      {(checkpoints) => {
        const terms = props.play.venue.terms
        return (
          <LiveFigures
            summary={liveSummary(checkpoints)}
            replayed={standingBefore(checkpoints, takenOf(checkpoints).length).replay}
            minutesPlayed={minutesPlayedOf(props.play.startedAt, checkpoints)}
            consumption={terms === undefined ? undefined : consumptionOf(checkpoints, terms)}
            formula={props.play.pachinko}
            terms={terms}
            folded
            beside={() => undefined}
          />
        )
      }}
    </Show>
  )
}
