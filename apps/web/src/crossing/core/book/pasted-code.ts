/**
 * The run of a code in pasted text: printable ASCII beginning as a sync
 * code or an invitation code does. The message a code is sent in has it on
 * a line of its own between Japanese lines, and a one-line field drops the
 * breaks, so the code's own characters are what mark where it ends.
 */
const CODE_IN_TEXT = /p-lens-(?:sync|invite):1:[\x21-\x7e]+/

/** The code in what a person pasted: the code alone, or the code out of the whole message it was sent in. */
export const codeIn = (text: string): string => text.match(CODE_IN_TEXT)?.[0] ?? text
