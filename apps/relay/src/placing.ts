import type { Database } from "./relay"

/**
 * How many buckets the relay's lines are spread over, each line always in
 * the same one, worked out from its id (`bucketOf`). A bucket is what moves
 * between databases: its lines' rows copied to another, and `Placing`
 * changed to name it. The number is never changed, since every line would
 * then be in another bucket.
 */
export const BUCKETS = 64

/** FNV-1a over a line's id, which is base64url and so one byte a character: the same bucket for a line on every relay, and lines spread evenly over them. */
export const bucketOf = (line: string): number =>
  [...line].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5) % BUCKETS

/** Which bound database keeps each bucket: `home` all of them but those `moved` elsewhere, each by its binding's name. */
export interface Placing<B extends string> {
  readonly home: B
  readonly moved: Readonly<Partial<Record<number, B>>>
}

/**
 * The relay's databases: the one a line is kept in, with its grants and its
 * owner kept, and every one of them, each once, for what runs over all
 * lines — letting go of those left idle.
 */
export interface Databases {
  readonly of: (line: string) => Database
  readonly all: readonly Database[]
}

/** The databases bound to a deployment, each line sent to the one its bucket is placed in. */
export const placedIn = <B extends string>(bound: Readonly<Record<B, Database>>, placing: Placing<B>): Databases => ({
  of: (line) => bound[placing.moved[bucketOf(line)] ?? placing.home],
  all: [...new Set(Object.values<Database>(bound))],
})
