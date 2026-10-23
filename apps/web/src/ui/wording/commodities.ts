import { readTokenCommodity, tokenCommodity } from "../../core/commodity/commodity"
import { seal } from "../../mummer"
import { parlorNameText } from "./parlor"

/** A commodity as a screen shows it: a parlor's tokens with the parlor's name as 配信モード says, every other as it is written. */
export const commodityText = (commodity: string): string =>
  ((token) => (token === undefined ? commodity : tokenCommodity(token.kind, parlorNameText(seal.parlor(token.parlorName)), token.tier)))(readTokenCommodity(commodity))
