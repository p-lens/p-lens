import { leadingGraphemesOf } from "../text/leading-graphemes"

/**
 * The pictures a book nobody has named is told apart by: animals, plants,
 * things to eat and things to hold, many enough that two drawn by chance
 * seldom match. Each is one code point, drawn as a picture without help,
 * so that every device shows it; and none is a face, a hand, a heart or a
 * flag, nor stands for a country, a faith, a party or a cause — a name
 * given unasked must be one nobody minds being handed.
 */
export const TITLE_PICTURES: readonly string[] = [
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉",
  "🦇", "🐺", "🐴", "🐝", "🦋", "🐌", "🐞", "🐢", "🦎", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋",
  "🦈", "🐊", "🐅", "🐆", "🦓", "🦒", "🦘", "🐘", "🦛", "🦏", "🐪", "🐫", "🦙", "🐑", "🐏", "🐐", "🦌", "🐂", "🐃", "🐄",
  "🐎", "🐕", "🐩", "🐈", "🐓", "🐔", "🦃", "🦚", "🦜", "🦢", "🦩", "🐇", "🦝", "🦦", "🦥", "🦔", "🦡", "🦕", "🦖", "🐲",
  "🐉", "🦭", "🌵", "🌲", "🌳", "🌴", "🌱", "🌿", "🍀", "🍁", "🍂", "🍃", "🌷", "🌸", "🌼", "🌺", "🌾", "🍄", "🌰", "🍎",
  "🍊", "🍋", "🍌", "🍍", "🥝", "🍇", "🍓", "🍒", "🍈", "🍐", "🥭", "🥥", "🥑", "🥕", "🌽", "🥦", "🥔", "🍅", "🥜", "🍙",
  "🍘", "🍡", "🍣", "🍜", "🍛", "🍝", "🍞", "🥐", "🥨", "🥞", "🧇", "🧀", "🥚", "🍩", "🍪", "🍰", "🧁", "🍫", "🍬", "🍭",
  "🍮", "🍯", "🍿", "🍦", "🍧", "🍵", "🎈", "🎁", "🎲", "🎯", "🎳", "🎮", "🎸", "🎺", "🎻", "🥁", "🎹", "🔔", "🔑", "💡",
  "🔦", "📌", "🧲", "🧩", "🔮", "💎", "👑", "🎩", "🧢", "👓", "🎒", "🧦", "🧤", "🧣", "☔", "⚓", "🚀", "🛸", "🚲", "🛵",
  "🚗", "🚕", "🚌", "🚂", "🚁", "⛵", "🚤", "🎡", "🎢", "🎠", "🏰", "🗻", "🌋", "🌙", "⭐", "🌟", "⚡", "🔥", "💧", "🌊",
  "⛄", "🎃", "🧭", "⏰", "📷", "📚", "📎", "🧵", "🧶", "🪀", "🪁", "🗿",
]

/** What a book is called after its picture, until its owner names it. */
const UNNAMED = "マイ帳簿"

const leadingOf = (title: string): string => leadingGraphemesOf(title.trim(), 1)

const untaken = (taken: readonly string[]): readonly string[] => {
  const leading = new Set(taken.map(leadingOf))
  return TITLE_PICTURES.filter((picture) => !leading.has(picture))
}

/** Whether a title begins as one of those there does: a title drawn before a book took its picture is to be drawn again, and no other. */
export const beginsAsOneOf = (title: string, taken: readonly string[]): boolean => taken.some((other) => leadingOf(other) === leadingOf(title))

/**
 * A title for a book nobody has named: a picture, then マイ帳簿 — so that
 * a dozen books made one after another, or one shared before it is named,
 * are told apart at a glance and renamed whenever their owner cares to.
 * The picture is one no book there begins with, while there is one, and
 * `drawn` — a number from 0 up to 1 — says which.
 */
export const unnamedTitle = (taken: readonly string[], drawn: number): string => {
  const free = untaken(taken)
  const pictures = free.length > 0 ? free : TITLE_PICTURES
  return `${pictures[Math.min(pictures.length - 1, Math.floor(drawn * pictures.length))] ?? ""}${UNNAMED}`
}
