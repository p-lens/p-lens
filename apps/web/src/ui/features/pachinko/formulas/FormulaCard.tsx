import { Show, type JSX } from "solid-js"

import { borderOf } from "../../../../core/pachinko/theoretical-value"
import type { FormulaListing, Selection } from "../../../../core/formula/standing"
import type { Formula } from "../../../../core/pachinko/formula"
import { HandIcon, HandOffIcon, HeartIcon, QuestionIcon, ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { formulaIdText } from "../../../wording/catalog"
import { borderText, formulaText, oneInText } from "../../../wording/pachinko/formula"
import { KindMark } from "./KindMark"
import { SelectionReason } from "./SelectionReason"

/** A count of what people did; a check either way is shown in its colour once there is one. */
function Count(props: { readonly icon: JSX.Element; readonly count: number; readonly label: string; readonly tone?: "positive" | "negative" }): JSX.Element {
  return (
    <span
      class="flex items-center gap-1 tabular-nums [&_svg]:size-4"
      classList={{
        "text-positive": props.tone === "positive" && props.count > 0,
        "text-negative": props.tone === "negative" && props.count > 0,
        "text-text-muted": props.tone === undefined || props.count === 0,
      }}
      aria-label={`${props.label} ${props.count}`}
      title={props.label}
    >
      {props.icon}
      {props.count}
    </span>
  )
}

/**
 * One formula at a glance: its key figures, which are its name — enough for most people — its id
 * under them, which tells it from another of the same figures and can be passed on, and
 * what people have done with it. Why it is the one chosen, if it is, shows as
 * an icon that arrives with it; a stronger formula elsewhere, as a pulse.
 */
export function FormulaCard(props: {
  readonly listing: FormulaListing<Formula>
  /** Whether the book in use keeps it as a favourite. */
  readonly favorite: boolean
  readonly ballValue: number | undefined
  readonly reason?: Selection<Formula>["by"]
  readonly stronger?: FormulaListing<Formula> | undefined
  readonly onStronger?: () => void
  readonly onHelp: () => void
  readonly onToggleFavorite: () => void
  readonly onUse?: () => void
}): JSX.Element {
  const figures = (): FormulaListing<Formula>["formula"]["figures"] => props.listing.formula.figures
  return (
    <article class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3" classList={{ "border-accent bg-accent/5": props.reason !== undefined }}>
      <header class="flex items-center gap-2">
        <Show when={props.reason} keyed>
          {(reason) => <SelectionReason by={reason} class="size-5" />}
        </Show>
        <KindMark kind={props.listing.formula.kind} />
        <div class="min-w-0 flex-1">
          <h3 class="truncate font-semibold tabular-nums text-text-primary">{formulaText(props.listing.formula.figures)}</h3>
          <p class="text-[11px] tabular-nums text-text-muted">ID {formulaIdText(props.listing.formula.id)}</p>
        </div>
        <Show when={props.stronger !== undefined && props.onStronger} keyed>
          {(open) => (
            <button
              type="button"
              onClick={() => open()}
              class="relative flex size-8 items-center justify-center rounded text-positive hover:bg-surface-3 [&_svg]:size-5"
              aria-label="もっと検証された算出条件があります"
              title="もっと検証された算出条件があります"
            >
              <span class="absolute inset-1 animate-ping rounded-full bg-positive/30" aria-hidden="true" />
              <ShieldIcon />
            </button>
          )}
        </Show>
        <button
          type="button"
          onClick={() => props.onToggleFavorite()}
          aria-pressed={props.favorite}
          aria-label="この算出条件をお気に入りにする"
          title="お気に入り（次に自動で選ばれます）"
          class="flex size-8 items-center justify-center rounded hover:bg-surface-3 [&_svg]:size-5"
          classList={{ "text-negative": props.favorite, "text-text-muted": !props.favorite }}
        >
          <HeartIcon filled={props.favorite} />
        </button>
        <button
          type="button"
          onClick={() => props.onHelp()}
          aria-label="算出条件を見る"
          title="算出条件を見る"
          class="flex size-8 items-center justify-center rounded text-semipro-ink hover:bg-surface-3 hover:text-semipro-ink-hover [&_svg]:size-5"
        >
          <QuestionIcon />
        </button>
      </header>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Show when={figures().totalChanceOneIn} keyed>
          {(total) => (
            <div>
              <dt class="text-xs text-text-muted">トータル確率</dt>
              <dd class="tabular-nums text-text-primary">{oneInText(total)}</dd>
            </div>
          )}
        </Show>
        <Show when={props.ballValue} keyed>
          {(value) => (
            <div>
              <dt class="text-xs text-text-muted">ボーダー</dt>
              <dd class="tabular-nums text-text-primary">{borderText(borderOf(figures(), value))}</dd>
            </div>
          )}
        </Show>
      </dl>
      <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <Count icon={<ShieldIcon />} count={props.listing.standing.verifications} label="検証OK" tone="positive" />
        <Show when={props.listing.standing.refutations > 0}>
          <Count icon={<ShieldOffIcon />} count={props.listing.standing.refutations} label="検証NG" tone="negative" />
        </Show>
        <Count icon={<HandIcon />} count={props.listing.standing.adoptions} label="イチオシ" />
        <Show when={props.listing.standing.rejections > 0}>
          <Count icon={<HandOffIcon />} count={props.listing.standing.rejections} label="非推奨" />
        </Show>
        <Count icon={<HeartIcon filled={false} />} count={props.listing.standing.favorites} label="お気に入り" />
        <span class="whitespace-nowrap text-text-muted tabular-nums">利用 {props.listing.standing.uses}回</span>
        <Show when={props.onUse} keyed>
          {(use) => (
            <button type="button" onClick={() => use()} class="ml-auto shrink-0 whitespace-nowrap rounded bg-amateur px-3 py-1 text-sm font-medium text-on-amateur hover:bg-amateur-hover">
              これを使う
            </button>
          )}
        </Show>
      </footer>
    </article>
  )
}
