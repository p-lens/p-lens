import { For, Show, type JSX } from "solid-js"

import type { Decimal } from "../../../core/decimal/decimal"
import { formatSignedYen, formatTheoreticalYen, formatYen, toneOf, UNSEEN_ACTUAL, UNSEEN_THEORETICAL } from "../../wording/numbers"
import { seal } from "../../../mummer"
import { InfoNote } from "../../primitives/popover"

const TONES = { positive: "text-positive", negative: "text-negative", neutral: "text-text-primary" } as const

const UNSEEN = { actual: UNSEEN_ACTUAL, theoretical: UNSEEN_THEORETICAL, sum: UNSEEN_ACTUAL } as const

const FORMATS = { actual: formatSignedYen, theoretical: formatTheoreticalYen, sum: formatYen } as const

/**
 * One headline figure. What tallies made is marked and coloured by which
 * way it went; what they were worth by their formulas is marked and not
 * coloured, being a reckoning and no gain or loss; a sum of money that
 * went in or came out is neither, having no way to go. A figure there is none of keeps its
 * shape, dimmed, with nothing in it. How it was come to is said by a small i
 * at its name's top right, kept off the card until pressed. Tight enough on a
 * phone for two to stand side by side.
 */
export function Figure(props: {
  readonly label: string
  readonly value: Decimal | undefined
  readonly kind: "actual" | "theoretical" | "sum"
  /** Lines saying how the figure was come to, behind the i beside its name. */
  readonly captions?: readonly string[]
  /** Words that stand in the figure's place where there is none to show, which nought would not say. */
  readonly instead?: string | undefined
}): JSX.Element {
  const tone = (): string => (props.value === undefined ? "text-text-muted" : props.kind === "actual" ? TONES[toneOf(seal.tally(props.value))] : TONES.neutral)
  const text = (): string => (props.value === undefined ? UNSEEN[props.kind] : FORMATS[props.kind](seal.tally(props.value)))
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2 @roomy:gap-1 @roomy:px-4 @roomy:py-3">
      <dt class="flex items-start gap-0.5 text-xs font-bold uppercase tracking-wide text-text-muted">
        <span class="min-w-0">{props.label}</span>
        <Show when={(props.captions ?? []).length > 0}>
          <InfoNote label={`${props.label}について`}>
            <For each={props.captions}>{(caption) => <p>{caption}</p>}</For>
          </InfoNote>
        </Show>
      </dt>
      <Show when={props.instead} keyed fallback={<dd class={`text-xl font-bold tabular-nums @roomy:text-2xl ${tone()}`}>{text()}</dd>}>
        {(words) => <dd class="flex h-7 items-center text-sm text-text-muted @roomy:h-8">{words}</dd>}
      </Show>
    </div>
  )
}
