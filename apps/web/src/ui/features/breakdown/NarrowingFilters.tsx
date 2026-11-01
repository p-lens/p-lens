import { createResource, createSignal, For, Show, type JSX } from "solid-js"

import { loadBreakdown, loadRates } from "../../../application/breakdown"
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

/**
 * The filters a breakdown is narrowed by, one beside the next, each saying
 * on its button what it lets through: the games, the rates, the parlors
 * and the machines. The rates are those the book keeps savings at, and a
 * filter's parlors or machines those the period's tallies say, best
 * first; each is read only once its filter is first opened, so a
 * breakdown is asked nothing more for being looked at; what is chosen and
 * not among them is offered all the same, so a tick never drops it
 * unseen. What is ticked is handed on as it is ticked, and while anything
 * is held back a button lets every tally through again.
 */
export function NarrowingFilters(props: { readonly bookId: BookId; readonly query: string; readonly narrowing: Narrowing; readonly onNarrowed: (narrowing: Narrowing) => void }): JSX.Element {
  const app = useApp()
  const [opened, setOpened] = createSignal<ReadonlySet<NarrowedBy>>(new Set())
  const groupsOf = (by: "parlor" | "machine") =>
    createResource(
      () => (opened().has(by) ? { bookId: props.bookId, query: queryFor(by, props.query), revision: app.revision() } : undefined),
      async (source) => mapOk(await loadBreakdown(app.services.session, source.bookId, by, source.query), (groups) => groups.map((group) => group.key).filter((key) => key !== UNSAID)),
    )
  const [rates] = createResource(
    () => (opened().has("rate") ? { bookId: props.bookId, revision: app.revision() } : undefined),
    (source) => loadRates(app.services.session, source.bookId),
  )
  const [parlors] = groupsOf("parlor")
  const [machines] = groupsOf("machine")
  const read = { rate: rates, parlor: parlors, machine: machines } as const
  const keysOf = (by: NarrowedBy): readonly string[] | undefined => (by === "game" ? GAMES : ((found) => (found?.ok === true ? found.value : undefined))(read[by]()))
  const reading = (by: NarrowedBy): boolean => by !== "game" && (read[by].loading || read[by]() === undefined)
  const offered = (by: NarrowedBy): readonly Offered[] =>
    ((keys) => (keys === undefined ? [] : [...keys, ...(props.narrowing[by] ?? []).filter((key) => !keys.includes(key))].map((key) => ({ key, label: narrowedName(by, key, app.machineNames()) }))))(keysOf(by))
  const names = (by: NarrowedBy): readonly string[] | undefined => props.narrowing[by]?.map((key) => narrowedName(by, key, app.machineNames()))
  return (
    <div class="flex flex-wrap items-center gap-2">
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
