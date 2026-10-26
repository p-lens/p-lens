import type { JSX } from "solid-js"

import { decimal } from "../../../../core/decimal/decimal"
import type { PlayTerms } from "../../../../core/parlor/terms"
import { handOf } from "../../../../core/pachislot/hand"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { seal } from "../../../../mummer"
import { amountText, formatCount, formatSignedYen, signedAmountText } from "../../../wording/numbers"
import { Tile } from "./Tile"

/**
 * The medals in hand where they were last counted, with the games played by
 * then, and what the play had come to there: the medals won or lost and the
 * same in yen. Each waits empty until medals are counted after the seat,
 * and the last two where the play has no terms to rent and exchange on.
 */
export function HandTiles(props: { readonly ordered: readonly Checkpoint[]; readonly terms: PlayTerms | undefined }): JSX.Element {
  const hand = () => handOf(props.ordered, props.terms)
  return (
    <>
      <Tile label="持ちメダル" value={((found) => (found === undefined ? "--" : amountText(seal.play(found.held))))(hand())} note={((found) => (found === undefined ? "枚" : `枚 ${formatCount(found.games)}G時点`))(hand())} />
      <Tile label="差枚" value={((found) => (found?.net === undefined ? "--" : signedAmountText(seal.play(found.net))))(hand())} note="枚" />
      <Tile label="収支" value={((found) => (found?.result === undefined ? "--" : formatSignedYen(seal.play(decimal(BigInt(found.result), 0)))))(hand())} />
    </>
  )
}
