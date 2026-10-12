/** How wide a character of a result is taken to be, in ems: a bold tabular digit, the widest a result holds. */
const CHARACTER_EMS = 0.64

/** The size a result is written at where its cell has room to spare, in rems. */
const LARGEST_REMS = 0.75

/** How many characters a result of six digits comes to, signed and grouped (`+360,000`): the length every shorter result is sized as. */
const COMMON_CHARACTERS = 8

/**
 * The font size a text is written at to fit the width of what holds it,
 * as CSS: the largest size where it fits at that, and otherwise the size
 * at which so many characters come to the holder's width (`100cqw`, the
 * holder being a container). A result of six digits or fewer is sized as
 * one of six, so a month's cells read in one size of figures whatever
 * each made; only a longer one — `+1,360,000` — is in smaller figures,
 * and none is cut short.
 */
export const fittedSize = (text: string): string => `min(${LARGEST_REMS}rem, calc(100cqw / ${(Math.max(text.length, COMMON_CHARACTERS) * CHARACTER_EMS).toFixed(2)}))`
