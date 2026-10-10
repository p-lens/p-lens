import { For, type JSX } from "solid-js"

import { formatCount, yenFigureText } from "../../../wording/numbers"

/** One bar of a result histogram: results from one amount to the next, and how many. */
export interface Bucket {
  readonly fromYen: number
  readonly toYen: number
  readonly count: number
}

/** How sampled results fall, losses red and wins green, each bar named by its range. */
export function Histogram(props: { readonly buckets: readonly Bucket[] }): JSX.Element {
  const tallest = (): number => Math.max(1, ...props.buckets.map((bucket) => bucket.count))
  return (
    <div class="flex h-32 items-end gap-px" role="img" aria-label="収支の分布">
      <For each={props.buckets}>
        {(bucket) => (
          <div
            class="flex-1"
            classList={{ "bg-positive/70": bucket.fromYen >= 0, "bg-negative/70": bucket.fromYen < 0 }}
            style={{ height: `${(bucket.count / tallest()) * 100}%` }}
            title={`${yenFigureText(bucket.fromYen)} 〜 ${yenFigureText(bucket.toYen)}: ${formatCount(bucket.count)}回`}
          />
        )}
      </For>
    </div>
  )
}
