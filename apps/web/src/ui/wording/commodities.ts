import { readTokenCommodity, tokenCommodity, type TokenKind } from "../../core/commodity/commodity"
import { readRateKey } from "../../core/report/narrowing"
import { seal } from "../../mummer"
import { parlorNameText } from "./parlor"

/** A commodity as a screen shows it: a parlor's tokens with the parlor's name as 配信モード says, every other as it is written. */
export const commodityText = (commodity: string): string =>
  ((token) => (token === undefined ? commodity : tokenCommodity(token.kind, parlorNameText(seal.parlor(token.parlorName)), token.tier)))(readTokenCommodity(commodity))

const RATE_GAMES: Readonly<Record<TokenKind, string>> = { ball: "パチンコ", medal: "スロット" }

/** A rate by `rateKey` as a person reads it, its price and game: 4円パチンコ, 20円スロット. */
export const rateText = (key: string): string => ((pool) => (pool === undefined ? key : `${pool.tier}${RATE_GAMES[pool.kind]}`))(readRateKey(key))
