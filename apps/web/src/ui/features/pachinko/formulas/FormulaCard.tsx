import { Show, type JSX } from "solid-js"

import { borderOf } from "../../../../core/pachinko/theoretical-value"
import { netAdoptions, netVerifications, usesWeighTheirMost, type FormulaListing, type Mark, type MyMarks, type Selection } from "../../../../core/formula/standing"
import type { Formula } from "../../../../core/pachinko/formula"
import { BoltIcon, HandIcon, HeartIcon, QuestionIcon, ShieldIcon } from "../../../primitives/icons"
import { formulaIdText } from "../../../wording/catalog"
import { borderText, markedFormulaText, oneInText } from "../../../wording/pachinko/formula"
import { KindMark } from "./KindMark"
import { SelectionReason } from "./SelectionReason"
import { isMine, OWN_LINES, ownPaintOf } from "./vote-fill"

/** A count of what people did, or of marks set against each other, which may fall below nothing; checks set against each other are shown in the colour of whichever is ahead, and a filled count — the person's own mark among it, or uses that weigh their most — is drawn in the text's own colour, its icon painted in the mark's where it has one. */
function Count(props: { readonly icon: JSX.Element; readonly count: number; readonly label: string; readonly filled: boolean; readonly signed?: boolean }): JSX.Element {
  return (
    <span
      class="flex items-center gap-1 tabular-nums [&_svg]:size-4"
      classList={{
        [OWN_LINES]: props.filled,
        "text-positive": !props.filled && props.signed === true && props.count > 0,
        "text-negative": !props.filled && props.signed === true && props.count < 0,
        "text-text-muted": !props.filled && (props.signed !== true || props.count === 0),
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
  /** What this member has done with it, as the book in use says. */
  readonly mine: MyMarks
  readonly ballValue: number | undefined
  readonly reason?: Selection<Formula>["by"]
  readonly stronger?: FormulaListing<Formula> | undefined
  readonly onStronger?: () => void
  readonly onHelp: () => void
  readonly onToggleFavorite: () => void
  readonly onUse?: () => void
  /**
   * What is put beside 「これを使う」, where a screen has something more to
   * do with the formula: on a phone above it, at the right of the figures,
   * and wider at its left.
   */
  readonly besideFigures?: JSX.Element
}): JSX.Element {
  const figures = (): FormulaListing<Formula>["formula"]["figures"] => props.listing.formula.figures
  const filled = (mark: Mark): boolean => isMine(mark, props.mine, props.favorite)
  const checkPaint = () => ownPaintOf(["verification", "refutation"], props.mine)
  const adoptionPaint = () => ownPaintOf(["adoption", "rejection"], props.mine)
  return (
    <article class="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-border px-4 py-3 sm:grid-cols-[1fr_auto_auto]" classList={{ "border-accent bg-accent/5": props.reason !== undefined }}>
      <header class="col-span-full flex items-center gap-2">
        <Show when={props.reason} keyed>
          {(reason) => <SelectionReason by={reason} class="size-5" />}
        </Show>
        <KindMark kind={props.listing.formula.kind} />
        <div class="min-w-0 flex-1">
          <h3 class="truncate font-semibold tabular-nums text-text-primary">{markedFormulaText(props.listing.formula.figures)}</h3>
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
      <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm sm:col-span-full">
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
      <Show when={props.besideFigures}>
        <div class="justify-self-end self-end sm:col-start-2 sm:row-start-3 sm:self-center">{props.besideFigures}</div>
      </Show>
      <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <Count icon={<ShieldIcon paint={checkPaint()} />} count={netVerifications(props.listing.standing)} label="検証OK−検証NG" filled={checkPaint() !== undefined} signed />
        <Count icon={<HandIcon paint={adoptionPaint()} />} count={netAdoptions(props.listing.standing)} label="イチオシ−非推奨" filled={adoptionPaint() !== undefined} />
        <Count icon={<HeartIcon filled={filled("favorite")} />} count={props.listing.standing.favorites} label="お気に入り" filled={filled("favorite")} />
        <Count icon={<BoltIcon filled={usesWeighTheirMost(props.listing.standing)} />} count={props.listing.standing.uses} label="利用" filled={usesWeighTheirMost(props.listing.standing)} />
      </footer>
      <Show when={props.onUse} keyed>
        {(use) => (
          <button type="button" onClick={() => use()} class="justify-self-end whitespace-nowrap rounded bg-amateur px-3 py-1 text-sm font-medium text-on-amateur hover:bg-amateur-hover">
            これを使う
          </button>
        )}
      </Show>
    </article>
  )
}
