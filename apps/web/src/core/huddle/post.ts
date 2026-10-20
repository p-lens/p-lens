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

/**
 * What each of the others last showed, in the order they first showed
 * anything: a person moving to another machine shows that play from then
 * on, and keeps their place among the cards. This device's own are left
 * out, its plays being on its own screen.
 */
export const othersLatest = (posts: readonly HuddlePost[], member: string): readonly HuddlePost[] => {
  const latest = posts.reduce((found, post) => (post.member === member || (found.get(post.member)?.postedAt ?? "") > post.postedAt ? found : new Map(found).set(post.member, post)), new Map<string, HuddlePost>())
  return [...new Set(posts.map((post) => post.member))].flatMap((who) => latest.get(who) ?? [])
}
