/**
 * What makes a text small to carry and gives it back whole: a play shown
 * to a huddle again and again is mostly the same lines, and goes far
 * smaller packed than as it is.
 */
export interface Packer {
  readonly pack: (text: string) => string
  /** The text a packed one was made from; none where it is not one. */
  readonly unpack: (packed: string) => string | undefined
}
