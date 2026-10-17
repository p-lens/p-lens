const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * The first characters of a text as a person sees them, as many as asked
 * for or as there are: a flag, a family or a heart with its colour is
 * several code points joined, and a cut between them leaves half a picture.
 */
export const leadingGraphemesOf = (text: string, count: number): string => leadingGraphemeListOf(text, count).join("")

/** The same first characters, each on its own: for setting them out one by one. */
export const leadingGraphemeListOf = (text: string, count: number): readonly string[] =>
  [...GRAPHEMES.segment(text)].slice(0, count).map((each) => each.segment)
