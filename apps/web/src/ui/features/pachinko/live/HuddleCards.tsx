import { For, Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../../core/catalog/catalog"
import type { HuddlePost } from "../../../../core/huddle/post"
import type { PachinkoDraft } from "../../../../core/live-play/draft"
import { consumptionOf } from "../../../../core/pachinko/consumption"
import { standingBefore, takenOf } from "../../../../core/pachinko/revision"
import { parsePlayLog, type Checkpoint } from "../../../../core/play-log/checkpoint"
import { liveSummary, minutesPlayedOf } from "../../../../core/play-log/live"
import { inPlayOrder } from "../../../../core/play-log/performance"
import { useApp } from "../../../context"
import { formatMoment } from "../../../wording/dates"
import { describeError } from "../../../wording/errors"
import { HUDDLE_HEADING, HUDDLE_WAITING, huddleShownAt } from "../../../wording/huddle"
import { createHuddleBoard } from "../../live/huddle-board"
import { LiveFigures } from "./LiveFigures"

const checkpointsOf = (post: HuddlePost): readonly Checkpoint[] | undefined => {
  const log = parsePlayLog(post.play.log)
  return log.ok ? inPlayOrder(log.value) : undefined
}

/** One of the others' pachinko plays, as their device last showed it: who, on what, and the figures a folded play shows, its mark beside its spin performance. */
function HuddleCard(props: { readonly post: HuddlePost }): JSX.Element {
  const app = useApp()
  const terms = (): HuddlePost["play"]["venue"]["terms"] => props.post.play.venue.terms
  return (
    <li class="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <p class="flex min-w-0 items-baseline gap-2 text-sm">
        <span class="shrink-0 font-bold text-text-primary">{props.post.name}</span>
        <span class="min-w-0 truncate text-text-secondary">
          {shownNameOf(app.machineNames(), props.post.play.machine)}
          {props.post.play.cabinetNumber === undefined ? "" : ` ${props.post.play.cabinetNumber}番台`}
        </span>
        <span class="ml-auto shrink-0 text-[10px] text-text-muted">{huddleShownAt(formatMoment(props.post.postedAt))}</span>
      </p>
      <Show when={props.post.play.gameKind === "pachinko" ? checkpointsOf(props.post) : undefined} keyed>
        {(checkpoints) => {
          const consumption = (() => {
            const found = terms()
            return found === undefined ? undefined : consumptionOf(checkpoints, found)
          })()
          return (
            <LiveFigures
              summary={liveSummary(checkpoints)}
              replayed={standingBefore(checkpoints, takenOf(checkpoints).length).replay}
              minutesPlayed={minutesPlayedOf(props.post.play.startedAt, checkpoints)}
              consumption={consumption}
              formula={props.post.play.gameKind === "pachinko" ? props.post.play.pachinko : undefined}
              terms={terms()}
              folded
              beside={() => undefined}
            />
          )
        }}
      </Show>
    </li>
  )
}

/**
 * The huddle beside a pachinko play: the play shown to it, and each of the
 * others' pachinko plays as they last showed it, a card each, in the order
 * they joined; a word while nobody else has shown one, and why the huddle
 * cannot be reached where it cannot. Nothing shown or read while it is
 * not there, and nothing on screen where the device is in no huddle.
 */
export function HuddleCards(props: { readonly draft: PachinkoDraft }): JSX.Element {
  const app = useApp()
  const board = createHuddleBoard(() => props.draft)
  const shown = (): readonly HuddlePost[] => board.others().filter((post) => post.play.gameKind === "pachinko")
  return (
    <Show when={app.huddle.now()}>
      <section class="flex flex-col gap-1.5" aria-label={HUDDLE_HEADING}>
        <h2 class="text-xs font-bold text-text-muted">{HUDDLE_HEADING}</h2>
        <Show when={board.problem()} keyed>
          {(error) => <p class="text-xs text-negative">{describeError(error)}</p>}
        </Show>
        <Show when={shown().length > 0} fallback={<p class="text-xs text-text-muted">{HUDDLE_WAITING}</p>}>
          <ul class="flex flex-col gap-1.5">
            <For each={shown()}>{(post) => <HuddleCard post={post} />}</For>
          </ul>
        </Show>
      </section>
    </Show>
  )
}
