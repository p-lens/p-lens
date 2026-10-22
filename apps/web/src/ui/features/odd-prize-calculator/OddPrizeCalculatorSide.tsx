import type { JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import type { PlayGameKind } from "../../../core/play/play"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { CalculatorIcon } from "../../primitives/icons"
import { SideList } from "../shell/SideList"

const GAMES: readonly { readonly game: PlayGameKind; readonly label: string }[] = [
  { game: "pachinko", label: "パチンコ端玉電卓" },
  { game: "pachislot", label: "スロット端玉電卓" },
]

/** The odd-prize calculator's games, one calculator each. */
export function OddPrizeCalculatorSide(props: { readonly place: Place }): JSX.Element {
  const moves = useMoves()
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">ツール</span>} resizeLabel="サイドパネルの幅を変える">
      <SideList
        heading="計算電卓"
        items={GAMES.map(({ game, label }) => ({
          id: game,
          label,
          icon: <CalculatorIcon />,
          selected: props.place.kind === "odd-prize-calculator-game" && props.place.game === game,
          onSelect: () => moves.go({ kind: "odd-prize-calculator-game", game }),
        }))}
      />
    </SidePanel>
  )
}
