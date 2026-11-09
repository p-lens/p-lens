import { writableText, type Entry } from "../journal/entry"
import { TALLY_TAGS } from "./tally"

/** A word a person tags a tally with, as an entry can hold it: what would end a tag given way to, nothing on either side. */
export const userTagOf = (text: string): string => writableText(text).replaceAll(":", "：")

/** The words a person tagged a tally with, each as an entry holds it and once, in the order given: an empty one is none. */
export const userTagsOf = (texts: readonly string[]): readonly string[] => [...new Set(texts.map(userTagOf))].filter((tag) => tag !== "")

/** The words a tally is tagged with, a tag of its own each, as an entry says them. */
export const userTagTags = (tags: readonly string[] | undefined): Entry["tags"] => userTagsOf(tags ?? []).map((tag) => [TALLY_TAGS.userTag, tag] as const)

/** The words an entry's tags say a tally is tagged with, in their order: none where it is tagged with none. */
export const userTagsIn = (ttags: readonly (readonly [string, string])[]): readonly string[] => userTagsOf(ttags.filter(([name]) => name === TALLY_TAGS.userTag).map(([, value]) => value))

/**
 * The words tallies are tagged with under some tags, each once, those
 * tagged most first and, among as many, the first met first: what a person
 * is offered to tag a tally with, the words they use most at hand.
 */
export const userTagsByUse = (ttagsOfEach: readonly (readonly (readonly [string, string])[])[], names: readonly string[]): readonly string[] => {
  const counts = ttagsOfEach
    .flatMap((ttags) => userTagsOf(ttags.filter(([name]) => names.includes(name)).map(([, value]) => value)))
    .reduce((counted, tag) => counted.set(tag, (counted.get(tag) ?? 0) + 1), new Map<string, number>())
  return [...counts].toSorted(([, left], [, right]) => right - left).map(([tag]) => tag)
}

/** The words offered to tag a tally with: those the book has used, most used first, then the preset ones it has not. */
export const offeredUserTags = (used: readonly string[], presets: readonly string[]): readonly string[] => [...used, ...presets.filter((tag) => !used.includes(tag))]
