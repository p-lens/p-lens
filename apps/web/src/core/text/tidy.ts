/** Full-width letters, digits and signs — `Ｐ` `１` `（` `＿` — each the ASCII character it stands for. */
const FULL_WIDTH_ASCII = /[！-～]/g

/** The full-width offset: `（` (U+FF08) less this is `(` (U+0028). */
const FULL_WIDTH_OFFSET = 0xfee0

/** Half-width katakana, `ﾎｼｿﾞﾗ`, written as the full-width kana they are. */
const HALF_WIDTH_KANA = /[｡-ﾟ]+/g

/** The minus sign typography uses, which a number reads as `-`. */
const MINUS_SIGN = /−/g

/** Slashes that look like `/` but are not: the division and fraction slashes text pasted from elsewhere can carry. */
const LOOKALIKE_SLASHES = /[\u2215\u2044]/g

/** Any run of spaces, full-width or not, and the invisible zero-width one. */
const SPACES = /[\s​]+/g

/**
 * Typed text as it is kept: what a Japanese keyboard types full-width for
 * letters, digits, brackets, spaces and the like becomes plain ASCII,
 * half-width kana become full-width, spaces run to one, and the ends are
 * trimmed. `　Ｐ流星の剣（強敵）＿ＬＴ　` is `P流星の剣(強敵)_LT`. Kanji,
 * kana and anything else are left as typed.
 */
export const tidyTyped = (text: string): string =>
  text
    .replace(FULL_WIDTH_ASCII, (character) => String.fromCharCode(character.charCodeAt(0) - FULL_WIDTH_OFFSET))
    .replace(HALF_WIDTH_KANA, (run) => run.normalize("NFKC"))
    .replace(MINUS_SIGN, "-")
    .replace(LOOKALIKE_SLASHES, "/")
    .replace(SPACES, " ")
    .trim()
