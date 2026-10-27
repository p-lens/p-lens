import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { groundsOf, loadFormula } from "../../../../application/pachinko/formulas"
import type { Figures } from "../../../../core/pachinko/figures"
import { basisOf, type Formula, type Basis } from "../../../../core/pachinko/formula"
import { borderOf } from "../../../../core/pachinko/theoretical-value"
import { labelsOf } from "../../../../core/pachinko/world"
import type { SampledFigure } from "../../../../core/pachinko/grounds/facts"
import { useApp } from "../../../context"
import { NerdproLink } from "../../../primitives/button"
import { createNudge } from "../../../primitives/nudge"
import { EmptyState, Loaded } from "../../../primitives/states"
import { TextField } from "../../../primitives/text-field"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { useStartBallValue } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { AnalysisFigures } from "./AnalysisFigures"
import { ReasonedGrounds } from "./ReasonedGrounds"
import { SimulationPanel } from "./SimulationPanel"
import { trailTo } from "./trail"

const positive = (text: string): number | undefined => {
  const value = Number(text.trim())
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : undefined
}

/** A figure typed, or the one its placeholder shows where nothing is; none where what is typed is not a number above zero. */
const typedOr = (text: string, shown: number): number | undefined => (text.trim() === "" ? shown : positive(text))

/** The ball value the simulation plays at where neither the exchange typed nor the start form gives one: 4 yen. */
const USUAL_BALL_VALUE = 4

/** The basis' combo solved again, the spread of play around the theoretical value, then the grounds reasoned out; the way to the basis is always the screen's last line. */
function Grounds(props: { readonly basis: Basis; readonly figures: Figures; readonly sampled: SampledFigure | undefined; readonly onBasis: () => void }): JSX.Element {
  const app = useApp()
  const ballValue = useStartBallValue()
  const [rate, setRate] = createSignal("")
  const [value, setValue] = createSignal("")
  const [grounds] = createResource(() => props.basis, (basis) => groundsOf(app.services.pachinko, basis))
  const labels = (): ReadonlyMap<string, string> => labelsOf(props.basis.spec)
  const unready = createNudge()
  const shownExchange = (): number => ballValue() ?? USUAL_BALL_VALUE
  const exchange = (): number | undefined => typedOr(value(), shownExchange())
  const cashBorder = (): number | undefined => ((exchanged) => (exchanged === undefined ? undefined : Number(borderOf(props.figures, exchanged).toFixed(1))))(exchange())
  const play = createMemo((): PlayDto | undefined => {
    const exchanged = exchange()
    const border = cashBorder()
    const spins = border === undefined ? positive(rate()) : typedOr(rate(), border)
    return spins === undefined || exchanged === undefined ? undefined : { spinPerformance: spins, ballValue: exchanged }
  })
  return (
    <Loaded outcome={grounds()}>
      {(analysis) => (
        <div class="flex flex-col gap-6 p-4">
          <AnalysisFigures analysis={analysis} labels={labels()} />
          <section class="flex flex-col gap-3">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">収支の分布（シミュレーション）</h2>
            <div class="grid max-w-xl grid-cols-2 gap-3">
              <TextField
                label="回転率"
                value={rate()}
                onChange={setRate}
                inputMode="decimal"
                suffix="回転/千円"
                placeholder={((border) => (border === undefined ? "" : border.toFixed(1)))(cashBorder())}
                invalid={unready.red() && play() === undefined && rate().trim() !== ""}
                onFocus={unready.settle}
              />
              <TextField
                label="交換率"
                value={value()}
                onChange={setValue}
                inputMode="decimal"
                suffix="円/玉"
                placeholder={String(Number(shownExchange().toFixed(6)))}
                invalid={unready.red() && exchange() === undefined}
                onFocus={unready.settle}
              />
            </div>
            <SimulationPanel normalized={props.basis.normalized} conditions={props.basis.conditions} play={play()} exactRounds={analysis.averageRounds} onUnready={unready.nudge} />
          </section>
          <ReasonedGrounds basis={props.basis} analysis={analysis} figures={props.figures} sampled={props.sampled} />
          <NerdproLink class="self-start text-sm" onClick={() => props.onBasis()}>
            期待値基礎値を見る ›
          </NerdproLink>
        </div>
      )}
    </Loaded>
  )
}

/**
 * A formula's 計算根拠: its stored normalised spec solved again — never its
 * spec renormalised — with each state's contribution, and how far a session
 * can land from the theoretical value. Only a simulated formula has one.
 */
export function GroundsView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [detail] = createResource(
    () => ({ machineId: props.machineId, formulaId: props.formulaId }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  const formula = (): Formula | undefined => {
    const found = detail()
    return found?.ok === true ? found.value.listing.formula : undefined
  }
  /** The basis a formula was made from and the figures it stores, which its grounds are checked against; none for one typed in. */
  const grounded = (): { readonly basis: Basis; readonly figures: Figures } | undefined => {
    const found = formula()
    const basis = found === undefined ? undefined : basisOf(found)
    return found === undefined || basis === undefined ? undefined : { basis, figures: found.figures }
  }
  /** A sampled formula's stored estimate, which its grounds check against the exact figure. */
  const sampled = (): SampledFigure | undefined => {
    const found = formula()
    return found?.kind === "sampled" ? { oneIn: found.figures.roundChanceOneIn, margin: found.sampling.roundChanceMargin } : undefined
  }
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "grounds", found.value.machine, found.value.listing.formula) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="計算根拠" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={detail()}>
          {() => (
            <Show when={grounded()} keyed fallback={<EmptyState title="計算根拠はありません">手入力の算出条件は、数字そのものが算出条件です。</EmptyState>}>
              {(found) => (
                <Grounds basis={found.basis} figures={found.figures} sampled={sampled()} onBasis={() => moves.go({ kind: "pachinko-formula-basis", machineId: props.machineId, formulaId: props.formulaId })} />
              )}
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
