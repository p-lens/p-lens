import { Index, Show, type JSX } from "solid-js"

import type { FormulaListing } from "../../../../core/formula/standing"
import type { Formula, SettingDistribution } from "../../../../core/pachislot/formula"
import { HandIcon, HandOffIcon, HeartIcon, QuestionIcon, ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { formulaIdText } from "../../../wording/catalog"
import { oddsText, formulaText, payoutRateText, sharesText } from "../../../wording/pachislot/formula"
import { KindMark } from "./KindMark"

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

function Favorite(props: { readonly on: boolean; readonly label: string; readonly onToggle: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => props.onToggle()}
      aria-pressed={props.on}
      aria-label={props.label}
      title="お気に入り（次に自動で選ばれます）"
      class="flex size-8 items-center justify-center rounded hover:bg-surface-3 [&_svg]:size-5"
      classList={{ "text-negative": props.on, "text-text-muted": !props.on }}
    >
      <HeartIcon filled={props.on} />
    </button>
  )
}

function Standing(props: { readonly listing: FormulaListing<Formula> | FormulaListing<SettingDistribution>; readonly verifiable: boolean; readonly onUse: () => void }): JSX.Element {
  return (
    <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <Show when={props.verifiable}>
        <Count icon={<ShieldIcon />} count={props.listing.standing.verifications} label="検証OK" tone="positive" />
        <Show when={props.listing.standing.refutations > 0}>
          <Count icon={<ShieldOffIcon />} count={props.listing.standing.refutations} label="検証NG" tone="negative" />
        </Show>
      </Show>
      <Count icon={<HandIcon />} count={props.listing.standing.adoptions} label="イチオシ" />
      <Show when={props.listing.standing.rejections > 0}>
        <Count icon={<HandOffIcon />} count={props.listing.standing.rejections} label="非推奨" />
      </Show>
      <Count icon={<HeartIcon filled={false} />} count={props.listing.standing.favorites} label="お気に入り" />
      <span class="whitespace-nowrap text-text-muted tabular-nums">利用 {props.listing.standing.uses}回</span>
      <button type="button" onClick={() => props.onUse()} class="ml-auto shrink-0 whitespace-nowrap rounded bg-amateur px-3 py-1 text-sm font-medium text-on-amateur hover:bg-amateur-hover">
        これを使う
      </button>
    </footer>
  )
}

/**
 * One pachislot formula at a glance: its 機械割 from the lowest setting level
 * to the highest, which is its name, its id under it, each level's rate and bonus odds, and
 * what people have done with it.
 */
export function FormulaCard(props: {
  readonly listing: FormulaListing<Formula>
  /** Whether the book in use keeps it as a favourite. */
  readonly favorite: boolean
  readonly onHelp: () => void
  readonly onToggleFavorite: () => void
  readonly onUse: () => void
}): JSX.Element {
  return (
    <article class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
      <header class="flex items-center gap-2">
        <KindMark kind={props.listing.formula.kind} />
        <div class="min-w-0 flex-1">
          <h3 class="truncate font-semibold tabular-nums text-text-primary">{formulaText(props.listing.formula.figures)}</h3>
          <p class="text-[11px] tabular-nums text-text-muted">ID {formulaIdText(props.listing.formula.id)}</p>
        </div>
        <Favorite on={props.favorite} label="この算出条件をお気に入りにする" onToggle={props.onToggleFavorite} />
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
      <ul class="flex flex-col gap-y-1 whitespace-nowrap text-xs tabular-nums text-text-secondary">
        <Index each={props.listing.formula.figures}>
          {(figures) => (
            <li>
              設定{figures().settingLevel} <span class="text-text-primary">{payoutRateText(figures().payoutRate)}</span>
              <span class="ml-1 text-text-muted">合算 {oddsText(figures().combinedOneIn)}</span>
            </li>
          )}
        </Index>
      </ul>
      <Standing listing={props.listing} verifiable onUse={props.onUse} />
    </article>
  )
}

/** One 設定配分 at a glance: what it is a spread for, its shares, and what people have done with it. */
export function SettingDistributionCard(props: {
  readonly listing: FormulaListing<SettingDistribution>
  /** Whether the book in use keeps it as a favourite. */
  readonly favorite: boolean
  /** Whether this member adopts it, as the book in use says. */
  readonly adopted: boolean
  readonly onToggleFavorite: () => void
  readonly onToggleAdoption: () => void
  readonly onUse: () => void
}): JSX.Element {
  return (
    <article class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
      <header class="flex items-center gap-2">
        <h3 class="min-w-0 flex-1 truncate font-semibold text-text-primary">{props.listing.formula.label}</h3>
        <button
          type="button"
          onClick={() => props.onToggleAdoption()}
          aria-pressed={props.adopted}
          class="rounded px-2 py-1 text-xs hover:bg-surface-3"
          classList={{ "text-accent font-semibold": props.adopted, "text-text-muted": !props.adopted }}
        >
          {props.adopted ? "イチオシ中" : "イチオシにする"}
        </button>
        <Favorite on={props.favorite} label="この設定配分をお気に入りにする" onToggle={props.onToggleFavorite} />
      </header>
      <p class="text-xs tabular-nums text-text-secondary">{sharesText(props.listing.formula.shares)}</p>
      <Standing listing={props.listing} verifiable={false} onUse={props.onUse} />
    </article>
  )
}
