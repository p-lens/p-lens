import { Show, type JSX } from "solid-js"

import type { Play } from "../../../../core/live-play/draft-reading"
import { daySeenOf } from "../../../../core/pachislot/observation"
import { atEndingsOf, type AtEnding } from "../../../../core/pachislot/path"
import { counterBonusesOf, counterBonusOf, type Countable } from "../../../../core/pachislot/weighing"
import { parsePlayLog, type Checkpoint } from "../../../../core/play-log/checkpoint"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { triggerWordsOf } from "../../../wording/pachislot/trigger"
import { AtFigures } from "./AtPlay"
import { NO_BONUSES, NO_MACHINE, PlayFigures } from "./LivePlay"
import { Timeline } from "./Timeline"

type Shown = Extract<Play, { readonly gameKind: "pachislot" }>

const checkpointsOf = (play: Shown): readonly Checkpoint[] | undefined => {
  const log = parsePlayLog(play.log)
  return log.ok ? inPlayOrder(log.value) : undefined
}

/**
 * One of the others' pachislot plays in a huddle, only to be looked at:
 * its readings across a strip and where it stands, as its own screen shows
 * them — the bonuses of the day for a machine that counts them, an AT
 * machine's figures for one that has its AT — with no reading to press or
 * hold and no tile to count on.
 */
export function HuddlePlay(props: { readonly play: Shown }): JSX.Element {
  const weighing = () => props.play.pachislot
  const atRules = () => weighing()?.formula.normalized.atRules
  const bonuses = (): readonly Countable[] => {
    const found = weighing()
    return found === undefined || atRules() !== undefined ? [] : counterBonusesOf(found.formula)
  }
  const endings = (): readonly AtEnding[] => {
    const found = weighing()
    return found === undefined ? [] : atEndingsOf(found.formula.normalized, found.formula.labels)
  }
  const shownAs = () => {
    const found = weighing()
    return found === undefined ? NO_BONUSES : counterBonusOf(found.formula.normalized)
  }
  return (
    <Show when={checkpointsOf(props.play)} keyed>
      {(checkpoints) => (
        <div class="flex flex-col gap-3">
          <Timeline checkpoints={checkpoints} bonuses={bonuses()} trigger={triggerWordsOf(weighing()?.formula.normalized)} endings={endings()} revising={undefined} onRevise={undefined} onMerge={undefined} strip />
          <Show when={atRules()} fallback={<PlayFigures ordered={checkpoints} bonuses={bonuses()} day={daySeenOf(checkpoints, shownAs())} />}>
            <AtFigures ordered={checkpoints} normalized={weighing()?.formula.normalized ?? NO_MACHINE} />
          </Show>
        </div>
      )}
    </Show>
  )
}
