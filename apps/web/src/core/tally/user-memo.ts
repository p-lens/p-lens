import { writableText, type Entry } from "../journal/entry"
import { TALLY_TAGS } from "./tally"

/** A note a person wrote of a tally, as an entry can hold it: on one line, what would end a tag given way to, nothing on either side. */
export const userMemoOf = (text: string): string => writableText(text).replaceAll(":", "：")

/** The most characters a note may run to: a word or two of what to remember, kept to a few lines beside the tags on a phone. */
export const USER_MEMO_MOST = 40

/** How many characters a note runs to as an entry would hold it, each character one however it is encoded. */
export const userMemoLength = (text: string): number => [...userMemoOf(text)].length

/** The note a tally was written down with, as a tag of its own: none where it is empty. */
export const userMemoTags = (memo: string | undefined): Entry["tags"] => ((text) => (text === "" ? [] : [[TALLY_TAGS.userMemo, text] as const]))(userMemoOf(memo ?? ""))

/** The note an entry's tags say a tally was written down with: undefined where there is none. */
export const userMemoIn = (ttags: readonly (readonly [string, string])[]): string | undefined =>
  ((text) => (text === "" ? undefined : text))(userMemoOf(ttags.find(([name]) => name === TALLY_TAGS.userMemo)?.[1] ?? ""))
