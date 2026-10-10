import type { JSX } from "solid-js"
import { RailBar, type RailItem } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { roleIn, type Book, type MemberId, type TitledBook } from "../../../core/book/book"
import { useApp } from "../../context"
import { ConsolidatedIcon, LiveIcon, SettingsIcon } from "../../primitives/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/tooltip"
import { useMoves } from "../../navigation/moves"
import { bookOf, inLiveSpace, inSettings, type Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { consolidationShown } from "../consolidated/shown"

/** The semipro colour on the rail: the consolidation is of that kind, as the button that turns it on is, and is told from the books by it. */
const SEMIPRO = { chosen: "bg-semipro text-on-semipro", hovered: "hover:bg-semipro hover:text-on-semipro" } as const

/** A book on the rail is its title's first character, as a server is its initials. */
const initialOf = (title: string): string => [...title.trim()].at(0) ?? "?"

const ownedBy = (member: MemberId) => (book: Book): boolean => roleIn(book, member) === "owner"

/**
 * The spaces down the left: plays in progress at the top, where they are
 * reached from anywhere; then your own books; then the books others have let
 * you into; then all of them together, consolidated, where a person has
 * turned that on; settings at the foot. Machines and formulas are reached from
 * starting a play.
 */
export function SpacesRail(props: { readonly place: Place; readonly books: Outcome<readonly TitledBook[]> | undefined }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const books = (): readonly TitledBook[] => (props.books?.ok === true ? props.books.value : [])
  const bookItem = (book: TitledBook): RailItem => ({
    id: book.id,
    label: bookTitle(book),
    icon: <span class="text-base font-semibold">{initialOf(bookTitle(book))}</span>,
    selected: bookOf(props.place) === book.id,
    onSelect: () => moves.go({ kind: "book", bookId: book.id }),
  })
  const groups = (): readonly (readonly RailItem[])[] => [
    [{ id: "live", label: "稼働", icon: <LiveIcon />, selected: inLiveSpace(props.place), onSelect: () => moves.go({ kind: "live" }) }],
    books().filter(ownedBy(app.services.member)).map(bookItem),
    books().filter((book) => !ownedBy(app.services.member)(book)).map(bookItem),
    consolidationShown(app.services.preferences)
      ? [{ id: "consolidated", label: "連結", icon: <ConsolidatedIcon />, colour: SEMIPRO, selected: props.place.kind === "consolidated" || props.place.kind === "consolidated-breakdown", onSelect: () => moves.go({ kind: "consolidated" }) }]
      : [],
  ]
  const footer = (): readonly RailItem[] => [
    { id: "settings", label: "設定", icon: <SettingsIcon />, selected: inSettings(props.place), onSelect: () => moves.go({ kind: "settings" }) },
  ]
  return (
    <RailBar
      label="スペース"
      groups={groups()}
      footer={footer()}
      renderTooltip={(label, trigger) => (
        <Tooltip placement="right">
          <TooltipTrigger as="div" class="w-full">
            {trigger}
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      )}
    />
  )
}
