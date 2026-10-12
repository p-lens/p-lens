import { For, Show, type JSX } from "solid-js"

import type { Operation, PlayDraft } from "../../../core/live-play/draft"
import { formatMoment } from "../../wording/dates"

/** What a reading's fields are called, those this list names; any other is shown by the name the log gives it. */
const FIELDS: Readonly<Record<string, string>> = { spins: "回転", outlay: "投資", held: "持ち玉", replay: "再プレイ", support: "電サポ増減" }

/** The fields of a reading that say when it was written and not what it read: passed over, since an operation says when itself. */
const UNSAID = ["at"]

const valueText = (value: unknown): string => (typeof value === "object" && value !== null ? JSON.stringify(value) : String(value))

/** One line of a log as a person reads it: each thing it read, named, in the order the line has them. A line that does not read is shown as it is. */
const readingText = (line: string): string => {
  try {
    const fields: unknown = JSON.parse(line)
    if (typeof fields !== "object" || fields === null) return line
    return Object.entries(fields)
      .filter(([name]) => !UNSAID.includes(name))
      .map(([name, value]) => `${FIELDS[name] ?? name} ${valueText(value)}`)
      .join("・")
  } catch {
    return line
  }
}

/** How many lines of an operation are laid out before the rest are only counted. */
const LINES_SHOWN = 4

function Lines(props: { readonly sign: string; readonly lines: readonly string[] }): JSX.Element {
  return (
    <>
      <For each={props.lines.slice(0, LINES_SHOWN)}>
        {(line) => (
          <li class="break-all font-mono text-[11px] leading-relaxed text-text-secondary">
            {props.sign} {readingText(line)}
          </li>
        )}
      </For>
      <Show when={props.lines.length > LINES_SHOWN}>
        <li class="text-[11px] text-text-muted">
          {props.sign} ほか{props.lines.length - LINES_SHOWN}行
        </li>
      </Show>
    </>
  )
}

/** What an operation did, in a word: readings added and none taken away is an addition; anything taken away is a change. */
const kindOf = (operation: Operation): string => (operation.removed.length === 0 ? `計測を追加（${operation.added.length}件）` : "計測を変更")

/**
 * Everything done to a play's log since it began, oldest first, for whoever
 * the play was sent to: when, what kind of change, and for a change the
 * readings before and after. What was done after the play was said to be
 * over is set in red, since that is what a receiver looks for. It is shown
 * for a play that arrived from someone else and for no other: on the device
 * that keeps a play, its history is kept and not shown.
 */
export function OperationHistory(props: { readonly draft: PlayDraft }): JSX.Element {
  const ended = (): string | undefined => props.draft.received?.ended?.at
  const late = (operation: Operation): boolean => ((end) => end !== undefined && operation.at > end)(ended())
  return (
    <section class="flex flex-col gap-2 px-4 pt-4">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">操作履歴</h2>
      <Show when={(props.draft.history ?? []).length > 0} fallback={<p class="text-xs text-text-muted">操作の記録はありません。</p>}>
        <ol class="flex flex-col gap-2">
          <For each={props.draft.history ?? []}>
            {(operation) => (
              <li class="flex flex-col gap-0.5 rounded-md px-2 py-1.5" classList={{ "bg-negative/10": late(operation), "bg-surface-1": !late(operation) }}>
                <span class="flex flex-wrap items-baseline gap-x-2 text-xs" classList={{ "text-negative font-semibold": late(operation), "text-text-secondary": !late(operation) }}>
                  <span class="tabular-nums">{formatMoment(operation.at)}</span>
                  <span>{kindOf(operation)}</span>
                  <Show when={late(operation)}>
                    <span>終了後</span>
                  </Show>
                </span>
                <Show when={operation.removed.length > 0}>
                  <ul class="flex flex-col">
                    <Lines sign="−" lines={operation.removed} />
                    <Lines sign="＋" lines={operation.added} />
                  </ul>
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  )
}
