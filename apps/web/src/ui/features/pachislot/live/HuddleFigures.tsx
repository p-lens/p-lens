import { Show, type JSX } from "solid-js"

import type { Play } from "../../../../core/live-play/draft-reading"
import { daySeenOf } from "../../../../core/pachislot/observation"
import { counterBonusesOf, counterBonusOf, type Countable } from "../../../../core/pachislot/weighing"
import { parsePlayLog, type Checkpoint } from "../../../../core/play-log/checkpoint"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { AtFigures } from "./AtPlay"
import { NO_BONUSES, NO_MACHINE, PlayFigures } from "./LivePlay"

type Shown = Extract<Play, { readonly gameKind: "slot" }>

const checkpointsOf = (play: Shown): readonly Checkpoint[] | undefined => {
  const log = parsePlayLog(play.log)
  return log.ok ? inPlayOrder(log.value) : undefined
}

/** One of the others' pachislot plays as a huddle's card shows it: where it stands as its own screen says, the bonuses of the day for a machine that counts them, an AT machine's figures for one that has its AT. */
export function HuddleFigures(props: { readonly play: Shown }): JSX.Element {
  const weighing = () => props.play.pachislot
  const atRules = () => weighing()?.formula.normalized.atRules
  const bonuses = (): readonly Countable[] => {
    const found = weighing()
    return found === undefined || atRules() !== undefined ? [] : counterBonusesOf(found.formula)
  }
  const shownAs = () => {
    const found = weighing()
    return found === undefined ? NO_BONUSES : counterBonusOf(found.formula.normalized)
  }
  return (
    <Show when={checkpointsOf(props.play)} keyed>
      {(checkpoints) => (
        <Show when={atRules()} fallback={<PlayFigures ordered={checkpoints} bonuses={bonuses()} day={daySeenOf(checkpoints, shownAs())} />}>
          <AtFigures ordered={checkpoints} normalized={weighing()?.formula.normalized ?? NO_MACHINE} />
        </Show>
      )}
    </Show>
  )
}
