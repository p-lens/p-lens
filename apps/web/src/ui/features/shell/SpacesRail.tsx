import { createResource, type JSX } from "solid-js"
import { RailBar, type RailItem } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { loadTodaysPlays } from "../../../application/live-play"
import { roleIn, type Book, type MemberId, type TitledBook } from "../../../core/book/book"
import { awaitsSending } from "../../../core/live-play/draft"
import type { Destination } from "../../../sync/port/destination-store"
import { useApp } from "../../context"
import { createHourStruck } from "../../primitives/hour"
import { ConsolidatedIcon, LiveIcon, SendIcon, SettingsIcon } from "../../primitives/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/tooltip"
import { useMoves } from "../../navigation/moves"
import { bookOf, inLiveSpace, inSettings, type Place } from "../../navigation/place"
import { bookTitle } from "../../wording/book"
import { destinationLabel } from "../../wording/sync"
import { consolidationShown } from "../consolidated/shown"

/** The semipro colour on the rail: the consolidation is of that kind, as the button that turns it on is, and is told from the books by it. */
const SEMIPRO = { chosen: "bg-semipro text-on-semipro", hovered: "hover:bg-semipro hover:text-on-semipro" } as const

/**
 * A book this device may only send plays to, on the rail: an outline with
 * nothing in it, since nothing of the book is here, filled only once chosen
 * or under the pointer.
 */
const DESTINATION = {
  chosen: "bg-accent text-accent-contrast",
  hovered: "hover:border-transparent hover:bg-accent hover:text-accent-contrast",
  resting: "border-2 border-dashed border-text-muted text-text-secondary",
} as const

/** A book on the rail is its title's first character, as a server is its initials. */
const initialOf = (title: string): string => [...title.trim()].at(0) ?? "?"

const ownedBy = (member: MemberId) => (book: Book): boolean => roleIn(book, member) === "owner"

/**
 * The spaces down the left: plays in progress at the top, where they are
 * reached from anywhere; then your own books; then the books others have let
 * you into; then the books you may only send plays to, each an outline
 * with a paper plane, wearing the number of the day's plays that wait to
 * be sent there; then all of the books together, consolidated, where a
 * person has turned that on; settings at the foot. Machines and formulas
 * are reached from starting a play.
 */
export function SpacesRail(props: {
  readonly place: Place
  readonly books: Outcome<readonly TitledBook[]> | undefined
  readonly destinations: Outcome<readonly Destination[]> | undefined
}): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const books = (): readonly TitledBook[] => (props.books?.ok === true ? props.books.value : [])
  const destinations = (): readonly Destination[] => (props.destinations?.ok === true ? props.destinations.value : [])
  /** The hours as they strike: the day whose plays are counted may turn on any of them. */
  const hour = createHourStruck()
  const [drafts] = createResource(
    () => (destinations().length > 0 ? ([app.revision(), hour()] as const) : undefined),
    () => loadTodaysPlays(app.services.drafts, app.services.businessDay()),
  )
  const waitingFor = (destination: Destination): number => ((found) => (found?.ok === true ? found.value.filter((draft) => awaitsSending(draft, destination.lineId)).length : 0))(drafts())
  const destinationItem = (destination: Destination): RailItem => ({
    id: destination.lineId,
    label: destinationLabel(destination.title, waitingFor(destination)),
    icon: (
      <span class="relative flex size-full items-center justify-center">
        <span class="text-base font-semibold">{initialOf(destination.title)}</span>
        <span class="absolute bottom-1.5 right-1.5 [&_svg]:size-3">
          <SendIcon />
        </span>
      </span>
    ),
    colour: DESTINATION,
    ...(waitingFor(destination) === 0
      ? {}
      : { badge: <span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-negative px-1 text-[11px] font-bold tabular-nums text-accent-contrast ring-2 ring-surface-0">{waitingFor(destination)}</span> }),
    selected: props.place.kind === "destination" && props.place.lineId === destination.lineId,
    onSelect: () => moves.go({ kind: "destination", lineId: destination.lineId }),
  })
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
    destinations().map(destinationItem),
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
