/**
 * Text as a search compares it: widths and case aside, katakana as hiragana,
 * and no spaces or marks — so D'station, D station and Dstation, ルミナ and
 * るみな, ゲンキ and げんき, are each one thing.
 */
export const searchKeyOf = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s'’・.\-&!_]/g, "")
    .replace(/[ァ-ヶ]/g, (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60))
