import type { PlayDto } from "@p-lens/contracts/pachinko"
import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { groundsOf, loadFormula } from "../../../../application/pachinko/formulas"
import { basisOf, type Formula, type Basis } from "../../../../core/pachinko/formula"
import { labelsOf } from "../../../../core/pachinko/world"
import type { SampledFigure } from "../../../../core/pachinko/grounds/facts"
import { useApp } from "../../../context"
import { SemiproLink } from "../../../primitives/button"
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

/** The basis' combo solved again, and the spread of play around the theoretical value. */
function Grounds(props: { readonly basis: Basis; readonly sampled: SampledFigure | undefined; readonly onBasis: () => void }): JSX.Element {
  const app = useApp()
  const ballValue = useStartBallValue()
  const [rate, setRate] = createSignal("")
  const [value, setValue] = createSignal("")
  const [grounds] = createResource(() => props.basis, (basis) => groundsOf(app.services.pachinko, basis))
  const labels = (): ReadonlyMap<string, string> => labelsOf(props.basis.spec)
  const unready = createNudge()
  const exchange = (): number | undefined => positive(value()) ?? ballValue()
  const play = createMemo((): PlayDto | undefined => {
    const spins = positive(rate())
    const exchanged = exchange()
    return spins === undefined || exchanged === undefined ? undefined : { spinPerformance: spins, ballValue: exchanged }
  })
  return (
    <Loaded outcome={grounds()}>
      {(analysis) => (
        <div class="flex flex-col gap-6 p-4">
          <ReasonedGrounds basis={props.basis} analysis={analysis} sampled={props.sampled} />
          <AnalysisFigures analysis={analysis} labels={labels()} />
          <section class="flex flex-col gap-3">
            <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">収支の分布（シミュレーション）</h2>
            <div class="grid max-w-xl grid-cols-2 gap-3">
              <TextField label="回転率" value={rate()} onChange={setRate} inputMode="decimal" suffix="回転/千円" invalid={unready.red() && positive(rate()) === undefined} onFocus={unready.settle} />
              <TextField
                label="交換率"
                value={value()}
                onChange={setValue}
                inputMode="decimal"
                suffix="円/玉"
                placeholder={ballValue() === undefined ? "4" : String(ballValue())}
                invalid={unready.red() && exchange() === undefined}
                onFocus={unready.settle}
              />
            </div>
            <SimulationPanel normalized={props.basis.normalized} conditions={props.basis.conditions} play={play()} exactRounds={analysis.averageRounds} onUnready={unready.nudge} />
          </section>
          <SemiproLink class="self-start text-sm" onClick={() => props.onBasis()}>
            期待値基礎値を見る ›
          </SemiproLink>
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
  const basis = (): Basis | undefined => {
    const found = formula()
    return found === undefined ? undefined : basisOf(found)
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
            <Show when={basis()} keyed fallback={<EmptyState title="計算根拠はありません">手入力の算出条件は、数字そのものが算出条件です。</EmptyState>}>
              {(found) => (
                <Grounds basis={found} sampled={sampled()} onBasis={() => moves.go({ kind: "pachinko-formula-basis", machineId: props.machineId, formulaId: props.formulaId })} />
              )}
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
