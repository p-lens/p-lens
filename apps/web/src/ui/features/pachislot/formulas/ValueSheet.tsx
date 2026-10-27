import { createMemo, createSignal, For, type JSX } from "solid-js"

import type { Formula } from "../../../../core/pachislot/formula"
import type { Prior } from "../../../../core/pachislot/prior"
import { priorPayoutRateOf, sheetValueOf, type SheetCorner, type SheetPlay, type SheetValue } from "../../../../core/pachislot/theoretical-value"
import { statedExchangeOf, tokensRentedFor } from "../../../../core/parlor/terms"
import { tidyTyped } from "../../../../core/text/tidy"
import { seal } from "../../../../mummer"
import { Button } from "../../../primitives/button"
import { PanelDialog } from "../../../primitives/dialog"
import { TextField } from "../../../primitives/text-field"
import { theoreticalFigureText } from "../../../wording/numbers"
import { payoutRateText, priorName, signedMedalsText, UNSEEN } from "../../../wording/pachislot/formula"
import { useStartPachislotTerms } from "../../live/start-form"

/** The medals ¥1,000 rents and ¥100 takes where the start form says nothing: the usual 46 rented and 5.2 exchanged, as wherever the app opens on a corner. */
const USUAL_CORNER = { rentedPerThousand: "46", exchangedPerHundred: "5.2" } as const

/** The play the sheet starts at: 3,000 games, 65% of them with the player's own medals, 750 games an hour. */
const USUAL_PLAY = { games: "3000", ownShare: "65", gamesPerHour: "750" } as const

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

/** One line of the sheet's table: a setting level, or the prior's spread of them, at its 機械割; none while the prior is not yet known or shares out nothing. */
interface Line {
  readonly label: string
  readonly payoutRate: number | undefined
}

const medalsText = (medals: number | undefined): string => (medals === undefined ? UNSEEN.medals : signedMedalsText(seal.formula(medals)))

/**
 * 期待値算出 at a pachislot formula: what a play typed in comes to at each
 * setting level, and at the prior a play of it would be weighed by, as a
 * button that lays the sheet over the screen, open as the address says,
 * with the formula's use at its foot. The corner starts as the start
 * form's terms where they read, the play at 3,000 games, 65% of them with
 * own medals, 750 an hour; a figure keeps its shape in dashes until what
 * it needs reads.
 */
export function ValueSheet(props: {
  readonly formula: Formula
  readonly prior: Prior | undefined
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClosed: () => void
  readonly onUse: () => void
}): JSX.Element {
  const startTerms = useStartPachislotTerms()
  const terms = startTerms()
  const [rented, setRented] = createSignal(terms === undefined ? USUAL_CORNER.rentedPerThousand : String(tokensRentedFor(terms, 1000)))
  const [exchanged, setExchanged] = createSignal(terms === undefined ? USUAL_CORNER.exchangedPerHundred : statedExchangeOf("pachislot", terms.exchange))
  const [ownShare, setOwnShare] = createSignal<string>(USUAL_PLAY.ownShare)
  const [games, setGames] = createSignal<string>(USUAL_PLAY.games)
  const [gamesPerHour, setGamesPerHour] = createSignal<string>(USUAL_PLAY.gamesPerHour)
  const corner = createMemo(() => cornerOf(rented(), exchanged(), ownShare()))
  const play = createMemo((): SheetPlay | undefined => ((count) => (count === undefined ? undefined : { bet: props.formula.basis.normalized.bet, games: count, gamesPerHour: positiveOf(gamesPerHour()) }))(positiveOf(games())))
  const priorRate = createMemo(() => (props.prior === undefined ? undefined : priorPayoutRateOf(props.formula.figures, props.prior)))
  const lines = createMemo((): readonly Line[] => [
    ...props.formula.figures.map((figures) => ({ label: String(figures.settingLevel), payoutRate: figures.payoutRate })),
    { label: "配分", payoutRate: priorRate() },
  ])
  const valueAt = (payoutRate: number | undefined): SheetValue | undefined => {
    const found = corner()
    const typed = play()
    return payoutRate === undefined || found === undefined || typed === undefined ? undefined : sheetValueOf(payoutRate, found, typed)
  }
  return (
    <>
      <Button variant="semipro" onClick={props.onOpen}>
        期待値算出
      </Button>
      <PanelDialog open={props.open} title="期待値算出" onClosed={props.onClosed}>
        <div class="grid grid-cols-2 gap-x-3 gap-y-2">
          <TextField label="貸メダル(千円)" value={rented()} onChange={setRented} inputMode="numeric" suffix="枚" invalid={positiveOf(rented()) === undefined} compact />
          <TextField label="交換(100円)" value={exchanged()} onChange={setExchanged} inputMode="decimal" suffix="枚" invalid={positiveOf(exchanged()) === undefined} compact />
          <TextField label="持ちメダル比率" value={ownShare()} onChange={setOwnShare} inputMode="decimal" suffix="%" invalid={shareOf(ownShare()) === undefined} compact />
          <TextField label="ゲーム数" value={games()} onChange={setGames} inputMode="numeric" suffix="G" invalid={positiveOf(games()) === undefined} compact focusedOnShow />
          <TextField label="1時間のゲーム数" value={gamesPerHour()} onChange={setGamesPerHour} inputMode="numeric" suffix="G" compact />
        </div>
        <table class="w-full text-right text-sm tabular-nums">
          <thead>
            <tr class="text-xs text-text-muted">
              <th scope="col" class="py-1 text-left font-normal">設定</th>
              <th scope="col" class="py-1 font-normal">機械割</th>
              <th scope="col" class="py-1 font-normal">差枚</th>
              <th scope="col" class="py-1 font-normal">期待値</th>
              <th scope="col" class="py-1 font-normal">時給</th>
            </tr>
          </thead>
          <tbody>
            <For each={lines()}>
              {(line) => (
                <tr class="border-t border-border text-text-primary">
                  <th scope="row" class="py-1.5 text-left font-normal">{line.label}</th>
                  <td class="py-1.5">{line.payoutRate === undefined ? UNSEEN.payoutRate : payoutRateText(line.payoutRate)}</td>
                  <td class="py-1.5">{medalsText(valueAt(line.payoutRate)?.medalsGained)}</td>
                  <td class="py-1.5">{theoreticalFigureText(seal.formula(valueAt(line.payoutRate)?.theoreticalValue))}</td>
                  <td class="py-1.5">{theoreticalFigureText(seal.formula(valueAt(line.payoutRate)?.yenPerHour))}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <p class="text-xs text-text-muted">配分は「{props.prior === undefined ? "--" : priorName(props.prior)}」で重み付けした値です。</p>
        <p class="text-xs text-text-muted">持ちメダル比率は、持ちメダルで打つゲームの割合です。差枚は、出たメダルから打ったメダルを引いた数です。</p>
        <div class="flex justify-end">
          <Button variant="amateur" onClick={props.onUse}>
            これを使う
          </Button>
        </div>
      </PanelDialog>
    </>
  )
}
