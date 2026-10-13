const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/**
 * The first character of a text as a person sees one, or none in an empty
 * text: a flag, a family or a heart with its colour is several code points
 * joined, and a cut at the first of them leaves half a picture.
 */
export const firstGraphemeOf = (text: string): string | undefined => GRAPHEMES.segment(text)[Symbol.iterator]().next().value?.segment
