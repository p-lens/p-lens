import { Show, type JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import type { BookId, ListedBook } from "../../../core/book/book"
import { OVERALL } from "../../../core/report/breakdown"
import { ActivityIcon, BreakdownIcon, FileIcon, HoldingsIcon, TalliesIcon, PlusIcon } from "../../primitives/icons"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import type { BookView, Place } from "../../navigation/place"
import { openingQueryOn } from "../period/periods"
import { RESULT_CALENDAR, ResultCalendarIcon } from "../result-calendar"
import { BookTitle } from "./BookTitle"
import { SideList, type SideListItem } from "./SideList"

const VIEWS: readonly { readonly view: BookView; readonly label: string; readonly icon: () => JSX.Element }[] = [
  { view: "tallies", label: "収支", icon: TalliesIcon },
  { view: "holdings", label: "貯玉・貯メダル", icon: HoldingsIcon },
  { view: "result-calendar", label: RESULT_CALENDAR, icon: ResultCalendarIcon },
  { view: "files", label: "生ファイル", icon: FileIcon },
  { view: "activity", label: "操作履歴", icon: ActivityIcon },
]

const ADD_TALLY = "収支を追加"

const viewOf = (place: Place): BookView | undefined =>
  place.kind === "book-view" ? place.view : place.kind === "tally" || place.kind === "tally-new" || place.kind === "tally-revise" ? "tallies" : place.kind === "book-file" ? "files" : place.kind === "passbook" || place.kind === "parlor-passbook" ? "holdings" : undefined

/** The side panel of one book: its title, renamed where it stands, and its views, tallies first with the way to add one, and the breakdown of its results, opening on this year, before its files, after everything that shows what it holds and made. */
export function BookSpaceSide(props: { readonly place: Place; readonly bookId: BookId; readonly book: ListedBook | undefined }): JSX.Element {
  const moves = useMoves()
  const app = useApp()
  const breakdown = (): SideListItem => ({
    id: "breakdown",
    label: "集計",
    icon: <BreakdownIcon />,
    selected: props.place.kind === "book-breakdown",
    onSelect: () => moves.go({ kind: "book-breakdown", bookId: props.bookId, by: OVERALL }, openingQueryOn(app.services.businessDay())),
  })
  const items = (): readonly SideListItem[] =>
    VIEWS.flatMap(({ view, label, icon }): readonly SideListItem[] => [
      ...(view === "files" ? [breakdown()] : []),
      {
        id: view,
        label,
        icon: icon(),
        selected: viewOf(props.place) === view,
        onSelect: () => moves.go({ kind: "book-view", bookId: props.bookId, view }),
        ...(view === "tallies"
          ? { action: { label: ADD_TALLY, icon: <PlusIcon />, onSelect: () => moves.go({ kind: "tally-new", bookId: props.bookId }) } }
          : {}),
      },
    ])
  return (
    <SidePanel
      header={
        <Show when={props.book} keyed fallback={<span class="truncate font-semibold text-text-primary">帳簿</span>}>
          {(book) => <BookTitle book={book} nameClass="truncate font-semibold" />}
        </Show>
      }
      resizeLabel="サイドパネルの幅を変える"
    >
      <SideList heading="ビュー" items={items()} />
    </SidePanel>
  )
}
