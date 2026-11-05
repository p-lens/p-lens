import { createSignal, For, Index, Show, type JSX } from "solid-js"

import type { BookFiles } from "../../../core/journal/layout"
import { outlineOf, settledText, type BookConflict, type FileConflict, type MergePart, type Side } from "../../../crossing"
import { Button } from "../../primitives/button"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { CONFLICT_ABOUT, CONFLICT_PLAY_TWICE, CONFLICT_SETTLE, CONFLICT_UNREADABLE, sideName } from "../../wording/sync"

/** The side of a conflict a choice of "this device" or "the other" is, by which head's id is the lower. */
const sideOf = (conflict: BookConflict, mine: boolean): Side => ((mine ? conflict.mine : conflict.theirs) < (mine ? conflict.theirs : conflict.mine) ? "first" : "second")

/** A file that would not merge, as a person settles it: stretch by stretch where its lines met, or whole where it is not lines that disagree. */
interface Contested {
  readonly conflict: FileConflict
  readonly parts: readonly MergePart[]
  readonly whole: boolean
}

const contestedOf = (conflict: BookConflict, each: FileConflict): Contested => {
  const [first, second] = conflict.mine < conflict.theirs ? [conflict.ours, conflict.others] : [conflict.others, conflict.ours]
  const parts = outlineOf(each.path, conflict.base[each.path] ?? "", first[each.path] ?? "", second[each.path] ?? "")
  return { conflict: each, parts, whole: each.why === "play-twice" || !parts.some((part) => part.type === "contested") }
}

/** One stretch's lines on one side, as they read. */
function Lines(props: { readonly lines: readonly string[] }): JSX.Element {
  return <pre class="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-1 px-2 py-1.5 font-mono text-xs text-text-secondary">{props.lines.length === 0 ? "（なし）" : props.lines.join("\n")}</pre>
}

/** A choice of one side or the other, this device's first. */
function SidePick(props: { readonly mineChosen: boolean; readonly onChange: (mine: boolean) => void }): JSX.Element {
  return (
    <ToggleGroup value={props.mineChosen ? "mine" : "theirs"} onChange={(value: string | null) => (value === null ? undefined : props.onChange(value === "mine"))}>
      <ToggleGroupItem value="mine">{sideName(true)}</ToggleGroupItem>
      <ToggleGroupItem value="theirs">{sideName(false)}</ToggleGroupItem>
    </ToggleGroup>
  )
}

/** Whether a settings file still reads as JSON once its stretches are chosen. */
const reads = (path: string, text: string): boolean => {
  if (path !== "settings.json") return true
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Where this device's book and another's would not merge: each stretch
 * changed two ways, side by side, for a person to keep one of; a file that
 * holds one play recorded twice, kept whole from one side; and where what the
 * two merge to is no book hledger reads, one side's book kept whole. Every
 * other file is as the two merged. Nothing is chosen for the person: this
 * device's side is picked to begin with, and nothing is written until they
 * press.
 */
export function ConflictPanel(props: { readonly conflict: BookConflict; readonly onSettle: (files: BookFiles) => void; readonly onUnreadable: () => void }): JSX.Element {
  const contested = (): readonly Contested[] => (props.conflict.files === "unreadable" ? [] : props.conflict.files.map((each) => contestedOf(props.conflict, each)))
  const [picks, setPicks] = createSignal<ReadonlyMap<string, readonly boolean[]>>(new Map())
  const [wholes, setWholes] = createSignal<ReadonlyMap<string, boolean>>(new Map())
  const [wholeBook, setWholeBook] = createSignal(true)
  const picked = (path: string, index: number): boolean => picks().get(path)?.[index] ?? true
  const pick = (path: string, index: number, mine: boolean, count: number): void => {
    setPicks((was) => new Map(was).set(path, Array.from({ length: count }, (_, at) => (at === index ? mine : (was.get(path)?.[at] ?? true)))))
  }
  const contestedCount = (parts: readonly MergePart[]): number => parts.filter((part) => part.type === "contested").length
  const settledFiles = (): BookFiles | undefined => {
    if (props.conflict.files === "unreadable") return wholeBook() ? props.conflict.ours : props.conflict.others
    const chosen = contested().map((each): readonly [string, string | undefined] => {
      const path = each.conflict.path
      if (each.whole) return [path, ((wholes().get(path) ?? true) ? props.conflict.ours : props.conflict.others)[path]]
      return [path, settledText(each.parts, Array.from({ length: contestedCount(each.parts) }, (_, index) => sideOf(props.conflict, picked(path, index))))]
    })
    if (chosen.some(([path, text]) => text !== undefined && !reads(path, text))) return undefined
    return { ...props.conflict.merged, ...Object.fromEntries(chosen.flatMap(([path, text]) => (text === undefined ? [] : [[path, text]]))) }
  }
  const settle = (): void => {
    const files = settledFiles()
    if (files === undefined) props.onUnreadable()
    else props.onSettle(files)
  }
  return (
    <div class="flex flex-col gap-4 rounded-md border border-border px-3 py-3">
      <Show
        when={props.conflict.files !== "unreadable"}
        fallback={
          <>
            <p class="text-sm text-text-secondary">{CONFLICT_UNREADABLE}</p>
            <SidePick mineChosen={wholeBook()} onChange={setWholeBook} />
          </>
        }
      >
        <p class="text-sm text-text-secondary">{CONFLICT_ABOUT}</p>
        <For each={contested()}>
          {(each) => (
            <section class="flex flex-col gap-2">
              <h3 class="break-all font-mono text-xs font-bold text-text-muted">{each.conflict.path}</h3>
              <Show
                when={!each.whole}
                fallback={
                  <>
                    <p class="text-sm text-text-secondary">{CONFLICT_PLAY_TWICE}</p>
                    <SidePick mineChosen={wholes().get(each.conflict.path) ?? true} onChange={(mine) => setWholes((was) => new Map(was).set(each.conflict.path, mine))} />
                  </>
                }
              >
                <Index each={each.parts.filter((part): part is Extract<MergePart, { type: "contested" }> => part.type === "contested")}>
                  {(part, index) => {
                    const mineFirst = (): boolean => sideOf(props.conflict, true) === "first"
                    return (
                      <div class="flex flex-col gap-2">
                        <div class="grid gap-2 sm:grid-cols-2">
                          <div class="flex flex-col gap-1">
                            <span class="text-xs text-text-muted">{sideName(true)}</span>
                            <Lines lines={mineFirst() ? part().first : part().second} />
                          </div>
                          <div class="flex flex-col gap-1">
                            <span class="text-xs text-text-muted">{sideName(false)}</span>
                            <Lines lines={mineFirst() ? part().second : part().first} />
                          </div>
                        </div>
                        <div class="flex justify-end">
                          <SidePick mineChosen={picked(each.conflict.path, index)} onChange={(mine) => pick(each.conflict.path, index, mine, contestedCount(each.parts))} />
                        </div>
                      </div>
                    )
                  }}
                </Index>
              </Show>
            </section>
          )}
        </For>
      </Show>
      <div class="flex justify-end">
        <Button size="small" onClick={settle}>
          {CONFLICT_SETTLE}
        </Button>
      </div>
    </div>
  )
}
