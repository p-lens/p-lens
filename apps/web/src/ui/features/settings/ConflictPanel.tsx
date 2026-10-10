import { createSignal, For, Index, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { type Conflict, type FileConflict, settleConflict } from "../../../application/sync"
import type { MergePart, Side } from "../../../core/sync/merge"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { createNudge, redRing } from "../../primitives/nudge"
import { toast } from "../../primitives/toast"
import { describeError } from "../../wording/errors"
import { sideName } from "../../wording/sync"

/** A contested stretch as the panel shows it: the two sides, and the lines just above for bearings. */
interface Choice {
  readonly above: readonly string[]
  readonly ours: readonly string[]
  readonly theirs: readonly string[]
}

/** How many agreed lines are shown above a contested stretch. */
const LINES_ABOVE = 2

const choicesOf = (parts: readonly MergePart[]): readonly Choice[] =>
  parts.flatMap((part, index) => {
    if (part.type !== "contested") return []
    const before = parts[index - 1]
    return [{ above: before?.type === "agreed" ? before.lines.slice(-LINES_ABOVE) : [], ours: part.ours, theirs: part.theirs }]
  })

/** What a press on the panel is doing, or how the last one failed. */
type Settling = { readonly type: "choosing" } | { readonly type: "settling" } | { readonly type: "failed"; readonly error: ApplicationError }

/** One side of a contested stretch, pressed to take it. */
function SideCard(props: { readonly side: Side; readonly lines: readonly string[]; readonly picked: boolean; readonly onPick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={props.picked}
      class="flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-border bg-surface-0 px-3 py-2 text-left hover:bg-surface-3/60"
      classList={{ "border-accent bg-accent/5": props.picked }}
      onClick={props.onPick}
    >
      <span class="text-xs font-bold text-text-muted">{sideName(props.side)}</span>
      <Show when={props.lines.length > 0} fallback={<span class="text-xs text-text-muted">（この箇所を消す）</span>}>
        <pre class="overflow-x-auto font-mono text-xs leading-relaxed text-text-primary">{props.lines.join("\n")}</pre>
      </Show>
    </button>
  )
}

/** One file's contested stretches, each with its two sides to choose between. */
function FileChoices(props: {
  readonly file: FileConflict
  readonly picks: readonly (Side | undefined)[]
  readonly nudged: boolean
  readonly onPick: (index: number, side: Side) => void
}): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <h3 class="font-mono text-xs text-text-muted">{props.file.path}</h3>
      <Index each={choicesOf(props.file.parts)}>
        {(choice, index) => (
          <div class="flex flex-col gap-1 rounded-md" classList={redRing(props.nudged && props.picks[index] === undefined)}>
            <Show when={choice().above.length > 0}>
              <pre class="overflow-x-auto px-3 font-mono text-xs leading-relaxed text-text-muted">{choice().above.join("\n")}</pre>
            </Show>
            <div class="flex flex-col gap-2 sm:flex-row">
              <SideCard side="ours" lines={choice().ours} picked={props.picks[index] === "ours"} onPick={() => props.onPick(index, "ours")} />
              <SideCard side="theirs" lines={choice().theirs} picked={props.picks[index] === "theirs"} onPick={() => props.onPick(index, "theirs")} />
            </div>
          </div>
        )}
      </Index>
    </div>
  )
}

const allPicked = (picks: readonly (Side | undefined)[]): picks is readonly Side[] => picks.every((pick) => pick !== undefined)

/**
 * A conflict laid out for a person: every stretch this device and another
 * rewrote differently, side by side, one of the two to be taken for each.
 * Nothing is kept until every stretch has a side; what both changed
 * elsewhere comes together either way.
 */
export function ConflictPanel(props: { readonly conflict: Conflict; readonly onSettled: () => void }): JSX.Element {
  const app = useApp()
  const nudge = createNudge()
  const [picks, setPicks] = createSignal<Readonly<Record<string, readonly (Side | undefined)[]>>>({})
  const [settling, setSettling] = createSignal<Settling>({ type: "choosing" })
  const picksOf = (file: FileConflict): readonly (Side | undefined)[] => picks()[file.path] ?? choicesOf(file.parts).map(() => undefined)
  const pick = (file: FileConflict, index: number, side: Side): void => {
    nudge.settle()
    setPicks((current) => ({ ...current, [file.path]: picksOf(file).map((each, at) => (at === index ? side : each)) }))
  }
  const settle = async (): Promise<void> => {
    if (settling().type === "settling") return
    const chosen = props.conflict.files.map((file) => [file.path, picksOf(file)] as const)
    const complete = chosen.flatMap(([path, sides]) => (allPicked(sides) ? [[path, sides] as const] : []))
    if (complete.length !== chosen.length) {
      nudge.nudge()
      return
    }
    setSettling({ type: "settling" })
    const done = await settleConflict(app.services.sync, props.conflict, Object.fromEntries(complete))
    setSettling(done.ok ? { type: "choosing" } : { type: "failed", error: done.error })
    if (!done.ok) return
    toast({ title: "食い違いを解決しました", description: "選んだ内容を、ほかの端末にも送ります。" })
    props.onSettled()
  }
  return (
    <div class="flex flex-col gap-4 rounded-md border border-warning/40 bg-warning/5 px-3 py-3">
      <p class="text-sm text-text-primary">
        <Show when={props.conflict.files.length > 0} fallback="同じ箇所の書き換えはありません。ほかの端末の変更を取り込み、この端末の変更をその上に重ねます。">
          この端末とほかの端末が、同じ箇所を別々に書き換えています。箇所ごとに、残すほうを選んでください。それ以外の変更は、どちらも残ります。
        </Show>
      </p>
      <For each={props.conflict.files}>{(file) => <FileChoices file={file} picks={picksOf(file)} nudged={nudge.red()} onPick={(index, side) => pick(file, index, side)} />}</For>
      <div>
        <Button size="small" onClick={() => void settle()}>
          この内容で解決する
        </Button>
      </div>
      <Show when={settling()} keyed>
        {(state) =>
          state.type === "failed" ? (
            <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
              {describeError(state.error)}
            </p>
          ) : undefined
        }
      </Show>
    </div>
  )
}
