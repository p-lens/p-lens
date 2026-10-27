import { Index, Show, type JSX } from "solid-js"

import { netAdoptions, netVerifications, usesWeighTheirMost, type FormulaListing, type Mark, type MyMarks } from "../../../../core/formula/standing"
import { combinedTellsMore } from "../../../../core/pachislot/figures"
import type { Formula, SettingDistribution } from "../../../../core/pachislot/formula"
import { BoltIcon, HandIcon, HeartIcon, QuestionIcon, ShieldIcon } from "../../../primitives/icons"
import { formulaIdText } from "../../../wording/catalog"
import { oddsText, formulaText, payoutRateText, sharesText, UNCHECKED } from "../../../wording/pachislot/formula"
import { KindMark } from "./KindMark"
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

function Standing(props: {
  readonly listing: FormulaListing<Formula> | FormulaListing<SettingDistribution>
  readonly mine: MyMarks
  readonly favorite: boolean
  readonly verifiable: boolean
  readonly onUse: () => void
}): JSX.Element {
  const filled = (mark: Mark): boolean => isMine(mark, props.mine, props.favorite)
  const checkPaint = () => ownPaintOf(["verification", "refutation"], props.mine)
  const adoptionPaint = () => ownPaintOf(["adoption", "rejection"], props.mine)
  return (
    <footer class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <Show when={props.verifiable}>
        <Count icon={<ShieldIcon paint={checkPaint()} />} count={netVerifications(props.listing.standing)} label="検証OK−検証NG" filled={checkPaint() !== undefined} signed />
      </Show>
      <Count icon={<HandIcon paint={adoptionPaint()} />} count={netAdoptions(props.listing.standing)} label="イチオシ−非推奨" filled={adoptionPaint() !== undefined} />
      <Count icon={<HeartIcon filled={filled("favorite")} />} count={props.listing.standing.favorites} label="お気に入り" filled={filled("favorite")} />
      <Count icon={<BoltIcon filled={usesWeighTheirMost(props.listing.standing)} />} count={props.listing.standing.uses} label="利用" filled={usesWeighTheirMost(props.listing.standing)} />
      <button type="button" onClick={() => props.onUse()} class="ml-auto shrink-0 whitespace-nowrap rounded bg-amateur px-3 py-1 text-sm font-medium text-on-amateur hover:bg-amateur-hover">
        これを使う
      </button>
    </footer>
  )
}

/**
 * One pachislot formula at a glance: its 機械割 from the lowest setting level
 * to the highest, which is its name, its id under it, each level's rate and
 * odds — its 合算 where that says more than its bonuses, else each bonus's,
 * a CZ's beside an AT's — and what people have done with it.
 */
export function FormulaCard(props: {
  readonly listing: FormulaListing<Formula>
  /** Whether the book in use keeps it as a favourite. */
  readonly favorite: boolean
  /** What this member has done with it, as the book in use says. */
  readonly mine: MyMarks
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
          <p class="text-[11px] tabular-nums text-text-muted">
            ID {formulaIdText(props.listing.formula.id)}
            <Show when={props.listing.formula.unchecked}>{` ・${UNCHECKED}`}</Show>
          </p>
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
              <Show when={combinedTellsMore(figures())} fallback={<Index each={figures().bonuses}>{(bonus) => <span class="ml-1 text-text-muted">{bonus().label} {oddsText(bonus().oneIn)}</span>}</Index>}>
                <span class="ml-1 text-text-muted">合算 {oddsText(figures().combinedOneIn)}</span>
              </Show>
            </li>
          )}
        </Index>
      </ul>
      <Standing listing={props.listing} mine={props.mine} favorite={props.favorite} verifiable onUse={props.onUse} />
    </article>
  )
}

/** One 設定配分 at a glance: what it is a spread for, its shares, and what people have done with it. */
export function SettingDistributionCard(props: {
  readonly listing: FormulaListing<SettingDistribution>
  /** Whether the book in use keeps it as a favourite. */
  readonly favorite: boolean
  /** What this member has done with it, as the book in use says. */
  readonly mine: MyMarks
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
          aria-pressed={props.mine.adopted}
          class="rounded px-2 py-1 text-xs hover:bg-surface-3"
          classList={{ "text-accent font-semibold": props.mine.adopted, "text-text-muted": !props.mine.adopted }}
        >
          {props.mine.adopted ? "イチオシ中" : "イチオシにする"}
        </button>
        <Favorite on={props.favorite} label="この設定配分をお気に入りにする" onToggle={props.onToggleFavorite} />
      </header>
      <p class="text-xs tabular-nums text-text-secondary">{sharesText(props.listing.formula.shares)}</p>
      <Standing listing={props.listing} mine={props.mine} favorite={props.favorite} verifiable={false} onUse={props.onUse} />
    </article>
  )
}
