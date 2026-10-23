import type { Kind, KindWith } from "./policy"

/** The key a secret's value is held under: never exported from the folder, so nothing outside reads it. */
export const SEALED: unique symbol = Symbol("sealed")

/** What a secret turns into wherever it is made a string by mistake: its veiled shape, whether mumming or not, so that the mistake shows at once. */
const MISTAKEN = "•••"

/**
 * A value sealed as a kind: nothing outside the folder reaches the value,
 * and a screen cannot draw it, only what `veil` gives for it. Made a
 * string by mistake, in a template or as JSON, it gives its veiled shape.
 */
export type Secret<K extends Kind, T> = {
  readonly kind: K
  readonly [SEALED]: T
}

/** The kinds a value is sealed as: those of a value, not of a part of a screen. */
export type SealedKind = KindWith<"text"> | KindWith<"figure">

const sealedAs = <K extends SealedKind, T>(kind: K, value: T): Secret<K, T> =>
  Object.freeze({
    kind,
    [SEALED]: value,
    [Symbol.toPrimitive]: (): string => MISTAKEN,
    toString: (): string => MISTAKEN,
    toJSON: (): string => MISTAKEN,
  })

const sealing =
  <K extends SealedKind>(kind: K) =>
  <T>(value: T): Secret<K, T> =>
    sealedAs(kind, value)

/** Seal a value as what it is, where it comes into a screen. */
export const seal = {
  parlor: sealing("parlor"),
  cabinet: sealing("cabinet"),
  book: sealing("book"),
  member: sealing("member"),
  savings: sealing("savings"),
  tally: sealing("tally"),
  play: sealing("play"),
  formula: sealing("formula"),
  journal: sealing("journal"),
} as const satisfies { readonly [K in SealedKind]: <T>(value: T) => Secret<K, T> }

/** Work a secret out into another of the same kind, still sealed. */
const map = <K extends SealedKind, T, U>(secret: Secret<K, T>, worked: (value: T) => U): Secret<K, U> => sealedAs(secret.kind, worked(secret[SEALED]))

/** Work two secrets of one kind out into a third of it, still sealed: two kinds are never mixed. */
const lift2 = <K extends SealedKind, T, U, V>(first: Secret<K, T>, second: Secret<NoInfer<K>, U>, worked: (first: T, second: U) => V): Secret<K, V> =>
  sealedAs(first.kind, worked(first[SEALED], second[SEALED]))

/** What is done to secrets without opening them. */
export const Secret = { map, lift2 } as const
