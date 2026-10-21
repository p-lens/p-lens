import type { PlayDraft } from "../live-play/draft"
import { readPlay, type Play } from "../live-play/draft-reading"
import type { Huddle } from "./huddle"

/**
 * One play as a member of a huddle shows it to the others: the play as
 * their device has it — its readings, where and on what it is played,
 * what it is weighed by — and who they are in the huddle. Its history is
 * left behind: the others see where it stands, and a play shown again
 * and again stays small.
 */
export interface HuddlePost {
  readonly member: string
  readonly name: string
  /** ISO 8601. */
  readonly postedAt: string
  readonly play: Play
}

/** The shape a post is written in, counted up when one an older app could not read is made. */
const FORMAT = 1

/** A play as it is shown to a huddle: what the device keeps of it for itself, and its history, left behind. */
export const huddlePostOf = (draft: PlayDraft, huddle: Huddle, postedAt: string): HuddlePost => {
  const { bookId: _book, recorded: _recorded, sent: _sent, received: _received, history: _history, ...play } = draft
  return { member: huddle.member, name: huddle.name, postedAt, play }
}

export const huddlePostText = (post: HuddlePost): string => JSON.stringify({ format: FORMAT, ...post })

const PARTS: ReadonlySet<string> = new Set(["format", "member", "name", "postedAt", "play"])

const isText = (value: unknown): value is string => typeof value === "string" && value !== ""

/** A post read back from its text, or none where it is none this app reads: its play must read as a kept draft's does. */
export const readHuddlePost = (written: string): HuddlePost | undefined => {
  try {
    const sent: unknown = JSON.parse(written)
    if (typeof sent !== "object" || sent === null || Array.isArray(sent)) return undefined
    const fields = sent as Readonly<Record<string, unknown>>
    if (fields["format"] !== FORMAT || !Object.keys(fields).every((part) => PARTS.has(part))) return undefined
    const [member, name, postedAt, play] = [fields["member"], fields["name"], fields["postedAt"], readPlay(fields["play"])]
    return isText(member) && isText(name) && isText(postedAt) && play !== undefined ? { member, name, postedAt, play } : undefined
  } catch {
    return undefined
  }
}

/** One of the others' plays as it was last shown, and whether it is the latest they showed: the one they are on, or were last. */
export interface HuddlePlay {
  readonly post: HuddlePost
  readonly latest: boolean
}

const laterOf = (found: HuddlePost | undefined, post: HuddlePost): HuddlePost => (found !== undefined && found.postedAt > post.postedAt ? found : post)

/**
 * Each of the others' plays as it was last shown, the others in the order
 * they first showed anything and each one's plays newest shown first: a
 * person moving to another machine keeps the play they left, and the one
 * they are on is their latest. This device's own are left out, its plays
 * being in its own list.
 */
export const othersPlays = (posts: readonly HuddlePost[], member: string): readonly HuddlePlay[] => {
  const others = posts.filter((post) => post.member !== member)
  const byPlay = others.reduce((found, post) => new Map(found).set(`${post.member} ${post.play.id}`, laterOf(found.get(`${post.member} ${post.play.id}`), post)), new Map<string, HuddlePost>())
  return [...new Set(others.map((post) => post.member))].flatMap((who) => {
    const theirs = [...byPlay.values()].filter((post) => post.member === who).toSorted((left, right) => right.postedAt.localeCompare(left.postedAt))
    return theirs.map((post, at) => ({ post, latest: at === 0 }))
  })
}
