import type { JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { BreakdownIcon, HoldingsIcon } from "../../primitives/icons"
import { useMoves } from "../../navigation/moves"
import { consolidatedBooksOf, type Place } from "../../navigation/place"
import { RESULT_CALENDAR, ResultCalendarIcon } from "../result-calendar"
import { SideList } from "../shell/SideList"

/**
 * The side panel of the consolidation: its views, listed as a book's are
 * and in a book's order. The books a view is of go with a person from one
 * view to the next; the grouping and the period are chosen in a view
 * itself.
 */
export function ConsolidatedSide(props: { readonly place: Place }): JSX.Element {
  const moves = useMoves()
  const bookIds = () => consolidatedBooksOf(props.place)
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">連結</span>} resizeLabel="サイドパネルの幅を変える">
      <SideList
        heading="ビュー"
        items={[
          {
            id: "holdings",
            label: "貯玉・貯メダル",
            icon: <HoldingsIcon />,
            selected: props.place.kind === "consolidated-holdings",
            onSelect: () => moves.go({ kind: "consolidated-holdings", bookIds: bookIds() }),
          },
          {
            id: "result-calendar",
            label: RESULT_CALENDAR,
            icon: <ResultCalendarIcon />,
            selected: props.place.kind === "consolidated-result-calendar",
            onSelect: () => moves.go({ kind: "consolidated-result-calendar", bookIds: bookIds() }),
          },
          {
            id: "breakdown",
            label: "集計",
            icon: <BreakdownIcon />,
            selected: props.place.kind === "consolidated-breakdown",
            onSelect: () => moves.go({ kind: "consolidated-breakdown", by: "book", bookIds: bookIds() }),
          },
        ]}
      />
    </SidePanel>
  )
}
