/**
 * Words no shared name may be, written in hiragana where they are kana:
 * text is compared in hiragana, so katakana and half-width forms are caught
 * too. Only a word standing alone is refused — `ぱちんこ ウルトラマン` holds
 * one inside an ordinary word and is a real machine.
 */
const FORBIDDEN_WORDS: ReadonlySet<string> = new Set([
  "うんこ",
  "うんち",
  "ちんこ",
  "ちんちん",
  "ちんぽ",
  "まんこ",
  "おまんこ",
  "おっぱい",
  "せっくす",
  "えっち",
  "ふぇら",
  "れいぷ",
  "ぺにす",
  "糞",
  "死ね",
  "殺す",
  "殺せ",
  "氏ね",
  "きちがい",
  "基地外",
  "気違い",
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "pussy",
  "porn",
  "nigger",
])

/** Text as forbidden words are looked for in it: widths and case aside, katakana as hiragana. */
const folded = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (character) => String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60))

/** What separates the words of a name: spaces, punctuation and symbols. */
const SEPARATORS = /[\s\p{P}\p{S}]+/u

/**
 * Whether a name is, or has as a word of its own, a forbidden word: each
 * word between spaces and symbols, and the whole name with those taken out,
 * so `う ん こ` is caught as surely as `ウンコ`.
 */
export const holdsForbiddenWord = (name: string): boolean => {
  const words = folded(name).split(SEPARATORS).filter((word) => word !== "")
  return [...words, words.join("")].some((word) => FORBIDDEN_WORDS.has(word))
}
