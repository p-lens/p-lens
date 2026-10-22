import { createResource, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadTodaysPlays } from "../../../application/live-play"
import { playsOfChosen, roomMembersOf, roomPlaysOf, roomTotalOf, type HeldTotal, type RoomMember, type RoomTotal } from "../../../core/huddle/room"
import { useApp } from "../../context"
import { Button, SWITCHED_ON } from "../../primitives/button"
import { cn } from "../../primitives/cn"
import { TickFilter } from "../../primitives/filter"
import { createHourStruck } from "../../primitives/hour"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { HUDDLE_NARROW, HUDDLE_OWN_ONLY, HUDDLE_SETTLE, HUDDLE_TOTAL } from "../../wording/huddle"
import { formatCount } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"
import { offeredMembers } from "./HuddleSide"

/** One figure of the total under its name, and what it comes to in yen beneath it where it is tokens. */
function Figure(props: { readonly label: string; readonly value: string; readonly unit?: string; readonly yen?: number | undefined }): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-md border border-border px-3 py-2">
      <dt class="truncate text-xs font-bold tracking-wide text-text-muted">{props.label}</dt>
      <dd class="truncate text-xl font-bold tabular-nums text-text-primary">
        {props.value}
        <Show when={props.unit}>
          <span class="ml-0.5 text-xs font-normal text-text-muted">{props.unit}</span>
        </Show>
      </dd>
      <Show when={props.yen} keyed>
        {(yen) => <dd class="truncate text-xs tabular-nums text-text-secondary">≒ ¥{formatCount(yen)}</dd>}
      </Show>
    </div>
  )
}

const tokensOf = (held: HeldTotal): { readonly value: string; readonly yen: number | undefined } => ({ value: formatCount(held.tokens), yen: held.tokens === 0 ? undefined : held.yen })

/**
 * What the plays of a huddle's members come to together, the members
 * chosen alone: the cash spent on every play of the day, and the balls
 * and medals in hand on the play each is on, with what they come to at
 * its corner's exchange rate. Above, 自分のみ narrows it to one's own at
 * a press — and back to everyone at another — as the filter beside it
 * would by ticking oneself alone; and across from them, the way to those
 * chosen settled up evenly, as a guide (精算目安を表示).
 */
export function HuddleTotalView(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  const members = (): readonly RoomMember[] => ((huddle) => (huddle === undefined ? [] : roomMembersOf(huddle, app.huddle.counted())))(app.huddle.now())
  const total = (): RoomTotal | undefined => {
    const huddle = app.huddle.now()
    const found = drafts()
    if (huddle === undefined) return undefined
    return roomTotalOf(playsOfChosen(roomPlaysOf(huddle, found?.ok === true ? found.value : [], app.huddle.counted(), app.huddle.idle()), app.huddle.chosen.totalled()))
  }
  const ownOnly = (): readonly string[] => ((huddle) => (huddle === undefined ? [] : [huddle.member]))(app.huddle.now())
  const isOwnOnly = (): boolean => ((chosen) => chosen !== undefined && chosen.length === 1 && chosen[0] === ownOnly()[0])(app.huddle.chosen.totalled())
  return (
    <MainContent header={<ViewHeader place={props.place} title={HUDDLE_TOTAL} />}>
      <div class="flex max-w-5xl flex-col gap-3 p-4">
        <div class="flex items-center justify-end gap-2">
          <Button variant="semipro" size="small" class="mr-auto" onClick={() => moves.go({ kind: "huddle-settlement" })}>
            {HUDDLE_SETTLE}
          </Button>
          <Button variant="outline" size="small" class={cn(isOwnOnly() && SWITCHED_ON)} aria-pressed={isOwnOnly()} onClick={() => app.huddle.chosen.setTotalled(isOwnOnly() ? undefined : ownOnly())}>
            {HUDDLE_OWN_ONLY}
          </Button>
          <TickFilter label={HUDDLE_NARROW} offered={offeredMembers(members())} chosen={app.huddle.chosen.totalled()} onChosen={app.huddle.chosen.setTotalled} none="まだ誰もいません。" />
        </div>
        <Show when={total()} keyed>
          {(found) => (
            <dl class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Figure label="現金投資" value={`¥${formatCount(found.outlay)}`} />
              <Figure label="持ち玉" {...tokensOf(found.held.pachinko)} unit="玉" />
              <Figure label="持ちメダル" {...tokensOf(found.held.pachislot)} unit="枚" />
            </dl>
          )}
        </Show>
        <p class="text-xs leading-5 text-text-muted">現金投資は本日のすべての稼働の合計です。持ち玉・持ちメダルは、各メンバーがいま打っている台で最後に数えた数で、≒ はその台の交換率での目安です。</p>
      </div>
    </MainContent>
  )
}
