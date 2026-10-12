/** How wide a character of a result is taken to be, in ems: a bold tabular digit, the widest a result holds. */
const CHARACTER_EMS = 0.64

/** The size a result is written at where its cell has room to spare, in rems. */
const LARGEST_REMS = 0.75

/**
 * The font size a text is written at to fit the width of what holds it,
 * as CSS: the largest size where it fits at that, and otherwise the size
 * at which so many characters come to the holder's width (`100cqw`, the
 * holder being a container). So a cell seven to a phone's width holds
 * `+12,340` and `+1,360,000` alike, the longer in smaller figures, and
 * neither is cut short.
 */
export const fittedSize = (text: string): string => `min(${LARGEST_REMS}rem, calc(100cqw / ${(Math.max(text.length, 1) * CHARACTER_EMS).toFixed(2)}))`
