import { For, type JSX } from "solid-js"

import { toPlainString, type Decimal } from "../../../core/decimal/decimal"
import type { PlayGameKind } from "../../../core/play/play"
import type { TallyFigures } from "../../../core/report/tally-figures"
import type { NetCounts } from "../../../core/tally/tally"
import { seal } from "../../../mummer"
import { formatTokens, formatYen, theoreticalFractionText } from "../../wording/numbers"
import { countText, lastedText, perThousandText, TALLY_FIGURES_HEADING } from "../../wording/tally-figures"

type Line = readonly [label: string, value: string]

const PER_SPIN_PLACES = 2

const perSpinText = (value: Decimal | undefined): string => theoreticalFractionText(seal.tally(value === undefined ? undefined : Number(toPlainString(value))), PER_SPIN_PLACES)

const pachinkoCounts = (counts: NetCounts | undefined): Extract<NetCounts, { readonly type: "pachinko" }> | undefined => (counts?.type === "pachinko" ? counts : undefined)

/** What a pachislot play's log counted besides its games, under the name of what it counted: its ATs, its bonuses, or neither where it had no formula. */
const pachislotWins = (counts: NetCounts | undefined): Line => {
  switch (counts?.type) {
    case "at-machine":
      return ["AT回数", countText(counts.ats, "回")]
    case "bonus-machine":
      return ["ボーナス回数", countText(counts.bonuses, "回")]
    case "games":
    case "pachinko":
    case undefined:
      return ["AT・ボーナス回数", countText(undefined, "回")]
  }
}

const gamesOf = (counts: NetCounts | undefined): number | undefined => (counts === undefined || counts.type === "pachinko" ? undefined : counts.games)

const pachinkoLines = (figures: TallyFigures): readonly Line[] => [
  ["現金投資", formatYen(seal.tally(figures.cash))],
  ["貯玉投資", formatTokens(seal.tally(figures.savingsDrawn), "ball")],
  ["大当り回数", countText(pachinkoCounts(figures.netCounts)?.jackpots, "回")],
  ["通常回転数", countText(pachinkoCounts(figures.netCounts)?.regularSpins, "回転")],
  ["回転率", perThousandText(figures.spinPerformance)],
  ["実質ボーダー", perThousandText(figures.realBorder)],
  ["期待値（1回転）", perSpinText(figures.theoreticalPerSpin)],
  ["プレイ時間", lastedText(figures.playSeconds)],
]

const pachislotLines = (figures: TallyFigures): readonly Line[] => [
  ["現金投資", formatYen(seal.tally(figures.cash))],
  ["貯メダル投資", formatTokens(seal.tally(figures.savingsDrawn), "medal")],
  ["ゲーム数", countText(gamesOf(figures.netCounts), "G")],
  pachislotWins(figures.netCounts),
  ["期待値（1G）", perSpinText(figures.theoreticalPerSpin)],
  ["プレイ時間", lastedText(figures.playSeconds)],
]

/**
 * A tally's own figures in a card, a line to each and a rule between, as
 * a trial balance lists them: what the person's own playing came to as
 * the book keeps it, never what the cabinet's counter showed. A pachinko
 * tally's cash and balls, jackpots and regular spins, spin performance,
 * border and what a spin was worth; a pachislot tally's cash and medals,
 * games, what they won and what a game was worth; and how long either
 * lasted. Dashes stand where the tally does not say.
 */
export function TallyFiguresCard(props: { readonly gameKind: PlayGameKind | undefined; readonly figures: TallyFigures }): JSX.Element {
  const lines = (): readonly Line[] => (props.gameKind === "pachislot" ? pachislotLines(props.figures) : pachinkoLines(props.figures))
  return (
    <section aria-label={TALLY_FIGURES_HEADING} class="flex flex-col gap-2">
      <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">{TALLY_FIGURES_HEADING}</h3>
      <dl class="rounded-md bg-surface-1 px-3">
        <For each={lines()}>
          {([label, value]) => (
            <div class="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
              <dt class="text-sm text-text-secondary">{label}</dt>
              <dd class="text-sm font-semibold tabular-nums text-text-primary">{value}</dd>
            </div>
          )}
        </For>
      </dl>
    </section>
  )
}
