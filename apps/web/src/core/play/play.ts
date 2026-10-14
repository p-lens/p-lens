import type { TokenKind } from "../commodity/commodity"

/**
 * The id of a play followed live — its draft, its log, and the tally it
 * comes to in a book — and of a tally typed in by hand, which is given one
 * as no play's. A book writes it as `play-id`, data already written.
 */
export type PlayId = string & { readonly __brand: "PlayId" }

/**
 * The game a play is of, as its book says in `game-kind`: pachislot is `slot`
 * there, data already written, where the catalog's `GameKind` says
 * `pachislot`. Pachinko is played with balls, pachislot with medals.
 */
export type PlayGameKind = "pachinko" | "slot"

const TOKENS_OF: Readonly<Record<PlayGameKind, TokenKind>> = { pachinko: "ball", slot: "medal" }

export const tokenKindOf = (kind: PlayGameKind): TokenKind => TOKENS_OF[kind]
