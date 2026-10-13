const V_ROW: Readonly<Record<string, string>> = { ゔぁ: "ば", ゔぃ: "び", ゔぇ: "べ", ゔぉ: "ぼ", ゔ: "ぶ" }

/**
 * ヴ as the バ row it is said and typed as: ヴァ is バ, ヴィ is ビ, ヴェ is ベ,
 * ヴォ is ボ, and a ヴ alone is ブ. A name is registered by whoever comes to it
 * first, in whichever spelling they knew, so the two are made one here rather
 * than by a word added to each machine.
 */
const withoutV = (hiragana: string): string => hiragana.replace(/ゔ[ぁぃぇぉ]?/g, (written) => V_ROW[written] ?? written)

/**
 * Text as a search compares it: widths and case aside, katakana as hiragana,
 * ヴ as the バ row, and no spaces or marks — so D'station, D station and
 * Dstation, ルミナ and るみな, ゲンキ and げんき, ヴヴヴ and ブブブ, are each
 * one thing.
 */
export const searchKeyOf = (text: string): string =>
  withoutV(
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s'’・.\-&!_]/g, "")
      .replace(/[ァ-ヶ]/g, (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60)),
  )
