import type { JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import type { PlayGameKind } from "../../../core/play/play"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ODD_PRIZE_CALCULATOR_LABEL } from "../../wording/odd-prize-calculator"
import { SideList } from "../shell/SideList"

const GAMES: readonly { readonly game: PlayGameKind; readonly label: string }[] = [
  { game: "pachinko", label: "パチンコ" },
  { game: "slot", label: "スロット" },
]

/** The odd-prize calculator's games, one calculator each. */
export function OddPrizeCalculatorSide(props: { readonly place: Place }): JSX.Element {
  const moves = useMoves()
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">{ODD_PRIZE_CALCULATOR_LABEL}</span>} resizeLabel="サイドパネルの幅を変える">
      <SideList
        items={GAMES.map(({ game, label }) => ({
          id: game,
          label,
          selected: props.place.kind === "odd-prize-calculator-game" && props.place.game === game,
          onSelect: () => moves.go({ kind: "odd-prize-calculator-game", game }),
        }))}
      />
    </SidePanel>
  )
}
