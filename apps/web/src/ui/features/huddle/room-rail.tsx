import { createEffect, createSignal, on, onCleanup, type JSX } from "solid-js"
import type { RailItem } from "solid-gathering-shell"

import { othersPlaysFor } from "../../../core/huddle/post"
import { othersInJackpot } from "../../../core/huddle/standing"
import { useApp } from "../../context"
import { HuddleIcon } from "../../primitives/icons"
import { useMoves } from "../../navigation/moves"
import { inHuddleRoom, type Place } from "../../navigation/place"
import { huddleRoomLabel } from "../../wording/huddle"

/** The semipro colour on the rail: the room is told from the books by it. */
const SEMIPRO = { chosen: "bg-semipro text-on-semipro", hovered: "hover:bg-semipro hover:text-on-semipro" } as const

/** How a room joined just now comes onto the rail: half a beat after, springing up slowly. */
const BOARDING = "motion-safe:animate-[board_3s_cubic-bezier(0.25,0.8,0.3,1)_500ms_both] origin-top"

/** How long a room joined just now is drawn as coming, in milliseconds: its spring, and the half beat before it. */
const BOARDING_FOR = 3_600

/** A count on a space's corner, red, as many as wait there. */
export function CountBadge(props: { readonly count: number }): JSX.Element {
  return <span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-negative px-1 text-[11px] font-bold tabular-nums text-accent-contrast ring-2 ring-surface-0">{props.count}</span>
}

/**
 * The room of the huddle the device is in, as a space on the rail: there
 * while the huddle is kept up (`HuddleLine.keptUp`), in the semipro
 * colour, wearing how many of the others are in a jackpot. A huddle joined
 * while the page is open is seen to come, below the live space; one the
 * device was already in as the page opened is simply there.
 */
export const useHuddleRoomItem = (place: () => Place): (() => RailItem | undefined) => {
  const app = useApp()
  const moves = useMoves()
  const [boarding, setBoarding] = createSignal(false)
  const held: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  createEffect(
    on(
      () => app.huddle.now()?.secret,
      (now, before) => {
        if (now === undefined || before !== undefined) return
        clearTimeout(held.timer)
        setBoarding(true)
        held.timer = setTimeout(() => setBoarding(false), BOARDING_FOR)
      },
      { defer: true },
    ),
  )
  onCleanup(() => clearTimeout(held.timer))
  return () => {
    const huddle = app.huddle.now()
    if (huddle === undefined || app.huddle.line.keptUp() !== huddle.secret) return undefined
    const inJackpot = othersInJackpot(othersPlaysFor(app.huddle.line.entries(), huddle))
    return {
      id: "huddle",
      label: huddleRoomLabel(inJackpot),
      icon: <HuddleIcon />,
      colour: SEMIPRO,
      ...(inJackpot === 0 ? {} : { badge: <CountBadge count={inJackpot} /> }),
      ...(boarding() ? { arriving: BOARDING } : {}),
      selected: inHuddleRoom(place()),
      onSelect: () => moves.go({ kind: "huddle" }),
    }
  }
}
