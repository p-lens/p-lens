import { For, Show, type JSX } from "solid-js"

import { shownNameOf } from "../../../core/catalog/catalog"
import type { HuddlePost } from "../../../core/huddle/post"
import type { PlayDraft } from "../../../core/live-play/draft"
import { useApp } from "../../context"
import { formatMoment } from "../../wording/dates"
import { describeError } from "../../wording/errors"
import { HUDDLE_HEADING, HUDDLE_WAITING, huddleShownAt } from "../../wording/huddle"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"
import { createHuddleBoard } from "./huddle-board"

/** One of the others' plays, as their device last showed it: who, on what and when, and the figures its own game shows of it. */
function HuddleCard(props: { readonly post: HuddlePost }): JSX.Element {
  const app = useApp()
  const play = (): HuddlePost["play"] => props.post.play
  return (
    <li class="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <p class="flex min-w-0 items-baseline gap-2 text-sm">
        <span class="shrink-0 font-bold text-text-primary">{props.post.name}</span>
        <span class="min-w-0 truncate text-text-secondary">
          {shownNameOf(app.machineNames(), play().machine)}
          {play().cabinetNumber === undefined ? "" : ` ${play().cabinetNumber}番台`}
        </span>
        <span class="ml-auto shrink-0 text-[10px] text-text-muted">{huddleShownAt(formatMoment(props.post.postedAt))}</span>
      </p>
      {((shown) => (shown.gameKind === "pachinko" ? <PachinkoViews.HuddleFigures play={shown} /> : <PachislotViews.HuddleFigures play={shown} />))(play())}
    </li>
  )
}

/**
 * The huddle beside a play, whichever game each plays: the play shown to
 * it, and each of the others' plays as they last showed it, a card each,
 * in the order they joined, a pachinko play beside a pachislot one; a word
 * while nobody else has shown one, and why the huddle cannot be reached
 * where it cannot. Nothing shown or read while it is not there, and
 * nothing on screen where the device is in no huddle.
 */
export function HuddleCards(props: { readonly draft: PlayDraft }): JSX.Element {
  const app = useApp()
  const board = createHuddleBoard(() => props.draft)
  return (
    <Show when={app.huddle.now()}>
      <section class="flex flex-col gap-1.5" aria-label={HUDDLE_HEADING}>
        <h2 class="text-xs font-bold text-text-muted">{HUDDLE_HEADING}</h2>
        <Show when={board.problem()} keyed>
          {(error) => <p class="text-xs text-negative">{describeError(error)}</p>}
        </Show>
        <Show when={board.others().length > 0} fallback={<p class="text-xs text-text-muted">{HUDDLE_WAITING}</p>}>
          <ul class="flex flex-col gap-1.5">
            <For each={board.others()}>{(post) => <HuddleCard post={post} />}</For>
          </ul>
        </Show>
      </section>
    </Show>
  )
}
