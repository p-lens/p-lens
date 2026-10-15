import { createMemo, createSignal, Index, onCleanup, Show, type Accessor, type JSX } from "solid-js"

import { Button } from "../../../primitives/button"
import { holdTheEnd } from "../../../primitives/scroll-end"

/** What a play's screen has to say of a press that did not go as asked: refused as the play stands, or failed to be kept; and what may be pressed about it. */
export interface Notice {
  readonly tone: "refused" | "failed"
  readonly said: string
  readonly action?: { readonly label: string; readonly onPress: () => void }
}

/** Puts up whatever a part of the screen has to say, for as long as that part is there. */
export type Post = (notice: Accessor<Notice | undefined>) => void

/**
 * Where a play's screen says what did not go as asked, kept in one place
 * at the top of the form at its foot: the counting tiles at the scroll's end and
 * the form pinned below it are one place to type into, and a word said
 * among the tiles would be scrolled out of sight.
 */
export interface NoticeBoard {
  readonly notices: Accessor<readonly Notice[]>
  readonly post: Post
}

export const createNoticeBoard = (): NoticeBoard => {
  const [posted, setPosted] = createSignal<readonly Accessor<Notice | undefined>[]>([])
  const post: Post = (notice) => {
    setPosted((before) => [...before, notice])
    onCleanup(() => setPosted((before) => before.filter((each) => each !== notice)))
  }
  const notices = createMemo(() => posted().flatMap((each) => ((now) => (now === undefined ? [] : [now]))(each())))
  return { notices, post }
}

const TONES: Readonly<Record<Notice["tone"], string>> = {
  refused: "border-warning/50 bg-warning/10",
  failed: "border-negative/40 bg-negative/10",
}

/**
 * The notices, at the top of the form at the screen's foot. The form is
 * pinned over the scroll's end, so a notice coming in would cover what was
 * last in view there: where the scroll stood at or near its end, it is
 * taken to the end at once as the notice comes.
 */
export function NoticeStack(props: { readonly notices: readonly Notice[] }): JSX.Element {
  const held: { stack: HTMLDivElement | undefined } = { stack: undefined }
  holdTheEnd(() => held.stack, () => props.notices)
  return (
    <div ref={(element) => (held.stack = element)} class="flex flex-col gap-2 empty:hidden">
      <Index each={props.notices}>
        {(notice) => (
          <div role="alert" class={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm text-text-primary ${TONES[notice().tone]}`}>
            <span class="flex-1">{notice().said}</span>
            <Show when={notice().action} keyed>
              {(action) => (
                <Button size="small" variant="secondary" onClick={() => action.onPress()}>
                  {action.label}
                </Button>
              )}
            </Show>
          </div>
        )}
      </Index>
    </div>
  )
}
