import type { JSX } from "solid-js"
import type { RailItem } from "solid-gathering-shell"

import { othersInJackpot } from "../../../core/huddle/standing"
import { useApp } from "../../context"
import { HuddleIcon } from "../../primitives/icons"
import { useMoves } from "../../navigation/moves"
import { inHuddleRoom, type Place } from "../../navigation/place"
import { huddleRoomLabel, huddleRoomUnheardLabel } from "../../wording/huddle"

/** The semipro colour on the rail: the room is told from the books by it. */
const SEMIPRO = { chosen: "bg-semipro text-on-semipro", hovered: "hover:bg-semipro hover:text-on-semipro" } as const

/** A count on a space's corner, red, as many as wait there. */
export function CountBadge(props: { readonly count: number }): JSX.Element {
  return <span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-negative px-1 text-[11px] font-bold tabular-nums text-accent-contrast ring-2 ring-surface-0">{props.count}</span>
}

/**
 * The room of the huddle the device is in, as a space on the rail: there
 * while the huddle is kept up (`HuddleLine.keptUp`), in the semipro
 * colour, wearing how many of the others are in a jackpot — those gone
 * quiet left out, and none while the line cannot be read, when nobody
 * knows. It is simply there, with no wait and no animation:
 * the dialog a huddle is joined in covers the rail as it comes.
 */
export const useHuddleRoomItem = (place: () => Place): (() => RailItem | undefined) => {
  const app = useApp()
  const moves = useMoves()
  return () => {
    const huddle = app.huddle.now()
    if (huddle === undefined || app.huddle.line.keptUp() !== huddle.secret) return undefined
    const heard = app.huddle.line.heard()
    const inJackpot = heard.type === "unreached" ? 0 : othersInJackpot(app.huddle.others(), app.huddle.idle())
    return {
      id: "huddle",
      label: heard.type === "unreached" ? huddleRoomUnheardLabel(heard.error) : huddleRoomLabel(inJackpot),
      icon: <HuddleIcon />,
      colour: SEMIPRO,
      ...(inJackpot === 0 ? {} : { badge: <CountBadge count={inJackpot} /> }),
      selected: inHuddleRoom(place()),
      onSelect: () => moves.go({ kind: "huddle" }),
    }
  }
}
