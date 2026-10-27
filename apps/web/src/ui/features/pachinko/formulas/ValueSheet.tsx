import { createMemo, createSignal, type JSX } from "solid-js"

import type { Figures } from "../../../../core/pachinko/figures"
import { sheetBordersOf, sheetValueOf, type SheetBorders, type SheetCorner, type SheetValue } from "../../../../core/pachinko/theoretical-value"
import { statedExchangeOf, tokensRentedFor } from "../../../../core/parlor/terms"
import { tidyTyped } from "../../../../core/text/tidy"
import { seal } from "../../../../mummer"
import { Button } from "../../../primitives/button"
import { PanelDialog } from "../../../primitives/dialog"
import { TextField } from "../../../primitives/text-field"
import { signedAmountText, theoreticalFigureText, theoreticalFractionText } from "../../../wording/numbers"
import { useStartPachinkoTerms } from "../../live/start-form"

/** The balls ¥1,000 rents and ¥100 takes where the start form says nothing: a 4-yen corner exchanging at 28. */
const USUAL_CORNER = { rentedPerThousand: "250", exchangedPerHundred: "28" } as const

/** The play the sheet starts at: 1,000 regular spins, 65% of them with the player's own balls, 200 spins an hour where the formula says none. */
const USUAL_PLAY = { regularSpins: "1000", ownShare: "65", spinsPerHour: "200" } as const

const numberOf = (text: string): number | undefined => (tidyTyped(text) === "" ? undefined : ((value) => (Number.isFinite(value) ? value : undefined))(Number(tidyTyped(text))))

const positiveOf = (text: string): number | undefined => ((value) => (value !== undefined && value > 0 ? value : undefined))(numberOf(text))

/** A share typed in percent, as a fraction from 0 to 1; none outside it. */
const shareOf = (text: string): number | undefined => ((value) => (value !== undefined && value >= 0 && value <= 100 ? value / 100 : undefined))(numberOf(text))

/** A corner as typed, once all of it reads. */
const cornerOf = (rented: string, exchanged: string, ownShare: string): SheetCorner | undefined => {
  const rentedPerThousand = positiveOf(rented)
  const exchangedPerHundred = positiveOf(exchanged)
  const share = shareOf(ownShare)
  return rentedPerThousand === undefined || exchangedPerHundred === undefined || share === undefined ? undefined : { rentedPerThousand, exchangedPerHundred, ownShare: share }
}

/** The spin performance shown where none is typed, and played at: the cash border at the corner as it stands, to the place it is shown to. */
const shownPerformanceOf = (borders: SheetBorders | undefined): number | undefined => (borders === undefined ? undefined : Number(borders.cash.toFixed(1)))

const borderFigure = (border: number | undefined): string => (border === undefined ? "--" : border.toFixed(1))

const ballsText = (balls: number | undefined): string => (balls === undefined ? "--玉" : `${signedAmountText(seal.formula(balls))}玉`)

function Line(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="flex justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
      <dt class="text-xs text-text-muted">{props.label}</dt>
      <dd class="text-right tabular-nums text-text-primary">{props.children}</dd>
    </div>
  )
}

/**
 * 期待値算出: a formula's theoretical value at a corner and a play the
 * person types in, as a button that lays the sheet over the screen, open
 * as the address says, with the formula's use at its foot. The
 * corner starts as the start form's terms where they read, the play at
 * 1,000 spins, 65% of them with own balls, and at the cash border as
 * the corner stands while no spin performance is typed; and every
 * figure is worked out as soon as what it needs reads; until then it
 * keeps its shape in dashes.
 */
export function ValueSheet(props: {
  readonly figures: Figures
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClosed: () => void
  readonly onUse: () => void
}): JSX.Element {
  const startTerms = useStartPachinkoTerms()
  const terms = startTerms()
  const [rented, setRented] = createSignal(terms === undefined ? USUAL_CORNER.rentedPerThousand : String(tokensRentedFor(terms, 1000)))
  const [exchanged, setExchanged] = createSignal(terms === undefined ? USUAL_CORNER.exchangedPerHundred : statedExchangeOf("pachinko", terms.exchange))
  const [ownShare, setOwnShare] = createSignal<string>(USUAL_PLAY.ownShare)
  const [regularSpins, setRegularSpins] = createSignal<string>(USUAL_PLAY.regularSpins)
  const [spinPerformance, setSpinPerformance] = createSignal("")
  const [spinsPerHour, setSpinsPerHour] = createSignal(props.figures.spinsPerHour === undefined ? USUAL_PLAY.spinsPerHour : String(props.figures.spinsPerHour))
  const corner = createMemo(() => cornerOf(rented(), exchanged(), ownShare()))
  const borders = createMemo((): SheetBorders | undefined => ((found) => (found === undefined ? undefined : sheetBordersOf(props.figures, found)))(corner()))
  const value = createMemo((): SheetValue | undefined => {
    const found = corner()
    const performance = tidyTyped(spinPerformance()) === "" ? shownPerformanceOf(borders()) : positiveOf(spinPerformance())
    const spins = positiveOf(regularSpins())
    return found === undefined || performance === undefined || spins === undefined
      ? undefined
      : sheetValueOf(props.figures, found, { spinPerformance: performance, regularSpins: spins, spinsPerHour: positiveOf(spinsPerHour()) })
  })
  return (
    <>
      <Button variant="semipro" onClick={props.onOpen}>
        期待値算出
      </Button>
      <PanelDialog open={props.open} title="期待値算出" onClosed={props.onClosed}>
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
          <TextField label="貸玉(千円)" value={rented()} onChange={setRented} inputMode="numeric" suffix="玉" invalid={positiveOf(rented()) === undefined} compact />
          <TextField label="交換(100円)" value={exchanged()} onChange={setExchanged} inputMode="decimal" suffix="玉" invalid={positiveOf(exchanged()) === undefined} compact />
          <TextField label="持ち玉比率" value={ownShare()} onChange={setOwnShare} inputMode="decimal" suffix="%" invalid={shareOf(ownShare()) === undefined} compact />
          <TextField label="通常回転" value={regularSpins()} onChange={setRegularSpins} inputMode="numeric" suffix="回転" invalid={positiveOf(regularSpins()) === undefined} compact />
          <TextField
            label="回転率"
            value={spinPerformance()}
            onChange={setSpinPerformance}
            inputMode="decimal"
            suffix="回転/千円"
            placeholder={((shown) => (shown === undefined ? "" : shown.toFixed(1)))(shownPerformanceOf(borders()))}
            invalid={tidyTyped(spinPerformance()) !== "" && positiveOf(spinPerformance()) === undefined}
            compact
            focusedOnShow
          />
          <TextField label="1時間の回転数" value={spinsPerHour()} onChange={setSpinsPerHour} inputMode="numeric" suffix="回転" compact />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-semibold text-text-primary">期待値</h3>
            <dl>
              <Line label="期待値">{theoreticalFigureText(seal.formula(value()?.theoreticalValue))}</Line>
              <Line label="期待値（1回転）">{theoreticalFractionText(seal.formula(value()?.yenPerSpin), 2)}</Line>
              <Line label="差玉">{ballsText(value()?.ballsGained)}</Line>
              <Line label="期待値（時給）">{theoreticalFigureText(seal.formula(value()?.yenPerHour))}</Line>
            </dl>
          </section>
          <section class="flex flex-col gap-1">
            <h3 class="text-xs font-semibold text-text-primary">ボーダー（回転/千円）</h3>
            <dl>
              <Line label="現金ボーダー">{borderFigure(borders()?.cash)}</Line>
              <Line label="持ち玉比率ボーダー">{borderFigure(borders()?.mixed)}</Line>
              <Line label="持ち玉ボーダー">{borderFigure(borders()?.own)}</Line>
            </dl>
          </section>
        </div>
        <p class="text-xs text-text-muted">持ち玉比率は、持ち玉で打つ回転の割合です。差玉は、出玉から打った玉を引いた数です。</p>
        <div class="flex justify-end">
          <Button variant="amateur" onClick={props.onUse}>
            これを使う
          </Button>
        </div>
      </PanelDialog>
    </>
  )
}
