import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadBreakdown, loadRates } from "../../../application/breakdown"
import { loadUserTags } from "../../../application/user-tags"
import type { Outcome } from "../../../application/errors"
import type { BookSession } from "../../../application/book-session"
import type { BookId } from "../../../core/book/book"
import { UNSAID } from "../../../core/report/breakdown"
import { mapOk } from "../../../core/result/result"
import { EVERY_TALLY, isNarrowed, NARROWED_BY, narrowedTo, type NarrowedBy, type Narrowing } from "../../../core/report/narrowing"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { TickFilter, type Offered } from "../../primitives/filter"
import { NARROWING_NAMES, narrowedName, narrowingNone, narrowingShown, UNNARROW } from "../../wording/breakdown"
import { queryFor } from "../period/periods"

/** The games a breakdown can be narrowed to, whatever the period: both, always. */
const GAMES = ["pachinko", "pachislot"] as const

/** What a filter that offers what was read can offer: the rates, the parlors or the machines. */
export type Offering = Exclude<NarrowedBy, "game">

/** How what a filter offers is read, for a period: the keys of the groups it can narrow to, in the order they are offered in. */
export type OffersOf = (by: Offering, query: string) => Promise<Outcome<readonly string[]>>

/** What a book's breakdown can be narrowed to: the rates it keeps savings at, the parlors and machines its tallies of the period say, best first, and the words they are tagged with, most used first. */
export const bookOffers =
  (session: BookSession, bookId: BookId): OffersOf =>
  async (by, query) =>
    by === "rate" ? loadRates(session, bookId) : by === "tag" ? loadUserTags(session, bookId, query) : mapOk(await loadBreakdown(session, bookId, by, queryFor(by, query)), (groups) => groups.map((group) => group.key).filter((key) => key !== UNSAID))

/** A filter's button drawn tighter than elsewhere: five of them, each a short word beside its funnel, stand on one line of a phone as narrow as 375px. */
const TIGHT = "gap-1 px-2"

/**
 * The filters a breakdown is narrowed by, one beside the next, each saying
 * on its button what it lets through: the games, the rates, the parlors,
 * the machines and the tags. What a filter offers but the games is read as
 * `offersOf` says, and only once it is first opened, so a breakdown is
 * asked nothing more for being looked at — and again where what it is a
 * breakdown of changes (`scope`). What is chosen and not among them is
 * offered all the same, so a tick never drops it unseen. What is ticked
 * is handed on as it is ticked, and while anything is held back a button
 * lets every tally through again.
 */
export function NarrowingFilters(props: { readonly scope: string; readonly offersOf: OffersOf; readonly query: string; readonly narrowing: Narrowing; readonly onNarrowed: (narrowing: Narrowing) => void }): JSX.Element {
  const app = useApp()
  const [opened, setOpened] = createSignal<ReadonlySet<NarrowedBy>>(new Set())
  const offersFor = (by: Offering) =>
    createResource(
      () => (opened().has(by) ? { scope: props.scope, query: props.query, revision: app.revision() } : undefined),
      (source) => props.offersOf(by, source.query),
    )
  const [rates] = offersFor("rate")
  const [parlors] = offersFor("parlor")
  const [machines] = offersFor("machine")
  const [tags] = offersFor("tag")
  const read = { rate: rates, parlor: parlors, machine: machines, tag: tags } as const
  const keysOf = (by: NarrowedBy): readonly string[] | undefined => (by === "game" ? GAMES : ((found) => (found?.ok === true ? found.value : undefined))(read[by]()))
  const reading = (by: NarrowedBy): boolean => by !== "game" && (read[by].loading || read[by]() === undefined)
  const offered = (by: NarrowedBy): readonly Offered[] =>
    ((keys) => (keys === undefined ? [] : [...keys, ...(props.narrowing[by] ?? []).filter((key) => !keys.includes(key))].map((key) => ({ key, label: narrowedName(by, key, app.machineNames()) }))))(keysOf(by))
  const names = (by: NarrowedBy): readonly string[] | undefined => props.narrowing[by]?.map((key) => narrowedName(by, key, app.machineNames()))
  return (
    <div class="flex flex-wrap items-center gap-1.5">
      <For each={NARROWED_BY}>
        {(by) => (
          <TickFilter
            label={NARROWING_NAMES[by]}
            shown={narrowingShown(by, names(by))}
            offered={offered(by)}
            none={narrowingNone(by, reading(by))}
            chosen={props.narrowing[by]}
            onChosen={(chosen) => props.onNarrowed(narrowedTo(props.narrowing, by, chosen))}
            onOpened={() => setOpened((before) => new Set([...before, by]))}
            class={TIGHT}
          />
        )}
      </For>
      <Show when={isNarrowed(props.narrowing)}>
        <Button type="button" variant="ghost" size="small" class="ml-auto shrink-0 text-text-muted" onClick={() => props.onNarrowed(EVERY_TALLY)}>
          {UNNARROW}
        </Button>
      </Show>
    </div>
  )
}
