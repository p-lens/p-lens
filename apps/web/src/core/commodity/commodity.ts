/**
 * What a parlor lends and exchanges: balls for pachinko, medals for pachislot.
 */
export type TokenKind = "ball" | "medal"

/** The currency every token is valued in. */
export const YEN = "JPY"

/** What a play's time is kept in: seconds, so that a book's plays add up to the second. */
export const SECONDS = "秒"

const TOKEN_NAMES: Readonly<Record<TokenKind, string>> = { ball: "玉", medal: "枚" }

/**
 * The commodity a parlor's tokens are at one rental rate, e.g.
 * `玉(4円・マレハン東京皇国店)`.
 *
 * One commodity per parlor, kind and rental rate, on purpose. A ball at one
 * parlor cannot be exchanged at another, nor a 1-yen ball as a 4-yen one, so
 * economically they are different things, and hledger keeps them apart only if
 * their symbols differ. The parlor and rate are in the symbol so the journal
 * stays readable without any lookup table.
 */
export const tokenCommodity = (kind: TokenKind, parlorName: string, tier: string): string => `${TOKEN_NAMES[kind]}(${tier}・${parlorName})`

/** A token commodity read back into what it was written from; undefined for any other commodity. The rate never holds `・`, so the first one ends it. */
export const readTokenCommodity = (commodity: string): { readonly kind: TokenKind; readonly tier: string; readonly parlorName: string } | undefined =>
  (Object.keys(TOKEN_NAMES) as TokenKind[])
    .filter((kind) => commodity.startsWith(`${TOKEN_NAMES[kind]}(`) && commodity.endsWith(")"))
    .map((kind) => ({ kind, inside: commodity.slice(TOKEN_NAMES[kind].length + 1, -1) }))
    .flatMap(({ kind, inside }) => {
      const at = inside.indexOf("・")
      return at <= 0 || at === inside.length - 1 ? [] : [{ kind, tier: inside.slice(0, at), parlorName: inside.slice(at + 1) }]
    })
    .at(0)

/**
 * Characters hledger accepts in a commodity symbol written without quotes.
 * Anything else — the parentheses in a token commodity, a digit in a parlor's
 * name — means the symbol has to be quoted.
 */
const BARE_SYMBOL = /^\p{L}+$/u

/** A commodity symbol as it is written in a journal. */
export const renderCommodity = (symbol: string): string => (BARE_SYMBOL.test(symbol) ? symbol : `"${symbol}"`)
