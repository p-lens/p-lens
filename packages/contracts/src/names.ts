/**
 * A machine's name as it is compared, by the app and the API alike: width
 * and case folded and spaces collapsed, so `ＣＲ流星` and `cr流星` are one
 * machine and a search for either finds it.
 */
export const comparableName = (name: string): string => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")

/**
 * A machine's name as it is kept, however it was typed: letters, digits
 * and marks at half width and kana at full, one space where there were
 * several, and none between the letter a name opens with — P, e, L, S —
 * and the Japanese it stands before. `Ｐ　流星無双　Ⅱ！` is kept as
 * `P流星無双 II!`; `P FABLE TALE` keeps its space, there being no telling
 * the letter from the word without it. The wave dash is a tilde as the
 * full-width tilde is: `〜焔の紋章〜` and `～焔の紋章～` are both
 * `~焔の紋章~`, the two being typed for one another everywhere. A slash
 * stands close between what it parts, as a model name writes it — `P／ 押忍
 * 団長 ／A03` is `P/押忍団長/A03` — and a colon typed twice, once at each
 * width, is one: `Re:：ノヴァ` is `Re:ノヴァ`.
 */
export const keptName = (name: string): string =>
  name
    .normalize("NFKC")
    .replace(/〜/g, "~")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ ?\/ ?/g, "/")
    .replace(/:{2,}/g, ":")
    .replace(/^([PeLS]) (?=[^\x00-\x7f])/, "$1")

/**
 * A machine's 大当り確率 as a spec sheet writes it, `1/319.7`: one in so
 * many, the many a number above one. Kept as written, for showing beside the
 * machine's name; nothing is calculated from it.
 */
export const isHitChanceText = (text: string): boolean => {
  const many = /^1\/(\d{1,5}(?:\.\d{1,3})?)$/.exec(text)?.[1]
  return many !== undefined && Number(many) >= 1
}

/** The most words a machine is searched by beside its name, and the longest one may be. */
export const MACHINE_KEYWORDS = { count: 10, length: 30 } as const

/** The most bonuses a machine lists, the longest a bonus's name may be, and the most balls one may pay out. */
export const MACHINE_BONUSES = { count: 20, nameLength: 20, payout: 100_000 } as const
