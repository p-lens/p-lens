import { createSignal, type Accessor, type Setter } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import type { HuddlePost } from "../../../core/huddle/post"

/**
 * What the page has of a huddle's line, kept for as long as the page is
 * open rather than as long as one screen is: a play's screen is made
 * again each time its play is written, and must not read the line from
 * its start, or show the play again at once, on each.
 *
 * - `secret`: the huddle the rest is of; another's begins it all again.
 * - `read`: where the line has been read to.
 * - `lineEnd`: where it was last seen to end, read or shown to.
 * - `shownAt`: when this device last showed its play, in milliseconds.
 * - `reading`: a reading on its way, which another waits behind.
 */
export interface HuddleLine {
  readonly posts: Accessor<readonly HuddlePost[]>
  readonly setPosts: Setter<readonly HuddlePost[]>
  readonly problem: Accessor<ApplicationError | undefined>
  readonly setProblem: Setter<ApplicationError | undefined>
  readonly held: { secret: string | undefined; read: number; lineEnd: number; shownAt: number; reading: boolean }
}

export const createHuddleLine = (): HuddleLine => {
  const [posts, setPosts] = createSignal<readonly HuddlePost[]>([])
  const [problem, setProblem] = createSignal<ApplicationError | undefined>()
  return { posts, setPosts, problem, setProblem, held: { secret: undefined, read: 0, lineEnd: 0, shownAt: 0, reading: false } }
}
