import { Show, type JSX } from "solid-js"

import { parseIsoDate, type IsoDate } from "../../../core/calendar/calendar"
import { TextField } from "../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { widenedNote } from "../../wording/breakdown"
import { EVERY_DAY, queryOf, rangeOf, sameRange, shortcutsOn, widenedFor, type DateRange } from "./periods"

const dayTyped = (text: string): IsoDate | undefined => ((read) => (read.ok ? read.value : undefined))(parseIsoDate(text))

/**
 * The period a view is asked about, chosen as two days: the first and the
 * last, each a date field, either left empty for no end on that side.
 * Before them the ranges offered by name — 本日, 今月, 今年 — which do
 * nothing but fill the two fields in; one is marked while the fields say
 * exactly its days, and pressed again it empties them, which is every day
 * there is. The period is the address's query and nothing is
 * kept here: the fields show what the address says, and a change is told
 * as the query it makes. A grouping by month or by year sums whole months
 * or years (`queryFor`), and a line says which days where they are more
 * than the days typed. It is laid out by the row it is put in — the
 * names, the fields and then the line, which takes a row of its own under
 * everything beside them — so whatever stands in that row stays level
 * with the fields.
 */
export function PeriodPicker(props: {
  readonly query: string
  /** The business day, which 本日 and the ranges around it are counted from. */
  readonly today: IsoDate
  /** A day typed into a field: the address is changed where it stands. */
  readonly onTyped: (query: string) => void
  /** A range pressed by name: a step of its own, which back undoes. */
  readonly onPressed: (query: string) => void
  /** How the tallies are grouped, where they are: by month or by year, the days summed are whole months or years, and are said where they are more than the days typed. */
  readonly by?: string | undefined
}): JSX.Element {
  const range = (): DateRange | undefined => rangeOf(props.query)
  const held = (): DateRange => range() ?? EVERY_DAY
  const pressed = (): string | null => ((now) => (now === undefined ? undefined : shortcutsOn(props.today).find((shortcut) => sameRange(shortcut.range, now))?.id))(range()) ?? null
  const note = (): string | undefined => ((wide) => (wide === undefined ? undefined : widenedNote(wide.span, wide.range.from, wide.range.to)))(props.by === undefined ? undefined : widenedFor(props.by, props.query))
  return (
    <>
      <ToggleGroup value={pressed()} onChange={(id: string | null) => props.onPressed(queryOf(shortcutsOn(props.today).find((candidate) => candidate.id === id)?.range ?? EVERY_DAY))} aria-label="期間">
        {shortcutsOn(props.today).map((shortcut) => (
          <ToggleGroupItem value={shortcut.id}>{shortcut.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div class="flex min-w-0 items-end gap-2">
        <div class="w-40 min-w-0">
          <TextField label="開始日" type="date" value={held().from ?? ""} onChange={(text) => props.onTyped(queryOf({ ...held(), from: dayTyped(text) }))} />
        </div>
        <div class="w-40 min-w-0">
          <TextField label="終了日" type="date" value={held().to ?? ""} onChange={(text) => props.onTyped(queryOf({ ...held(), to: dayTyped(text) }))} />
        </div>
      </div>
      <Show when={note()} keyed>
        {(words) => <p class="-mt-1.5 w-full text-xs text-text-muted">{words}</p>}
      </Show>
    </>
  )
}
