import type { AnalysisDto, SpecDto, SettingLevelFiguresDto } from "@p-lens/contracts/pachislot"
import { createResource, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../../application/errors"
import { loadFormula, groundsOf } from "../../../../application/pachislot/formulas"
import type { Formula } from "../../../../core/pachislot/formula"
import { reasonsGrounds } from "../../../../core/pachislot/grounds/facts"
import { Ok } from "../../../../core/result/result"
import type { MachineSummary } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { SemiproLink } from "../../../primitives/button"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { oddsText, payoutRateText } from "../../../wording/pachislot/formula"
import { ViewHeader } from "../../shell/ViewHeader"
import { ReasonedGrounds } from "./ReasonedGrounds"
import { trailTo } from "./trail"

const labelOf = (spec: SpecDto, id: string | undefined): string => (id === undefined ? "ハズレ・それ以外" : spec.components.label?.[id] || id)

const medalsPerGameText = (medals: number): string => `${medals >= 0 ? "+" : ""}${medals.toFixed(4)}枚`

/** One setting level's 機械割 traced to the outcomes it comes from, each one's chance and its share of a game's theoretical medals. */
function Derivation(props: { readonly figures: SettingLevelFiguresDto; readonly spec: SpecDto; readonly bet: number; readonly reasoned: boolean }): JSX.Element {
  return (
    <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
      <h3 class="flex items-baseline justify-between gap-3">
        <span class="font-semibold text-text-primary">設定{props.figures.settingLevel}</span>
        <span class="text-sm tabular-nums text-text-secondary">
          機械割 <span class="font-semibold text-text-primary">{payoutRateText(props.figures.payoutRate)}</span>
          <span class="ml-2 text-text-muted">1Gあたり {medalsPerGameText(props.figures.netPerGame)}</span>
        </span>
      </h3>
      <Show
        when={props.figures.derivation.length > 0}
        fallback={
          <p class="text-sm text-text-muted">
            {props.figures.at === undefined || !props.reasoned ? "機械割は入力された値です。" : "機械割はATの平均獲得枚数と純増から導いた値です（下の計算根拠）。"}1G {props.bet}枚で、1Gあたりの期待差枚は {props.bet}×(機械割−1) です。
          </p>
        }
      >
        <table class="w-full text-sm tabular-nums">
          <thead class="text-xs text-text-muted">
            <tr>
              <th class="py-1 text-left font-normal">出目</th>
              <th class="py-1 text-right font-normal">確率</th>
              <th class="py-1 text-right font-normal">1Gあたりの寄与</th>
            </tr>
          </thead>
          <tbody>
            <Index each={props.figures.derivation}>
              {(each) => (
                <tr class="border-t border-border">
                  <td class="py-1 text-text-secondary">{labelOf(props.spec, each().id)}</td>
                  <td class="py-1 text-right text-text-primary">{oddsText(1 / each().chance)}</td>
                  <td class="py-1 text-right text-text-primary">{medalsPerGameText(each().medalsPerGame)}</td>
                </tr>
              )}
            </Index>
          </tbody>
        </table>
        <p class="text-xs text-text-muted">寄与を足すと1Gあたりの期待差枚、それを {props.bet}枚で割って1を足すと機械割です。</p>
      </Show>
    </section>
  )
}

interface Grounds {
  readonly machine: MachineSummary
  readonly formula: Formula
  readonly analysis: AnalysisDto
}

/**
 * A pachislot formula's 計算根拠: its stored normalised spec solved again,
 * each setting level's 機械割 traced to the outcomes it comes from.
 */
export function GroundsView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [grounds] = createResource(
    () => ({ machineId: props.machineId, formulaId: props.formulaId, revision: app.revision() }),
    async (source): Promise<Outcome<Grounds>> => {
      const found = await loadFormula(app.services.catalog, source.machineId, source.formulaId)
      if (!found.ok) return found
      const formula = found.value.listing.formula
      const analysis = await groundsOf(app.services.pachislot, formula.basis)
      return analysis.ok ? Ok({ machine: found.value.machine, formula, analysis: analysis.value }) : analysis
    },
  )
  const trail = () => {
    const found = grounds()
    return found?.ok === true ? trailTo(moves, "grounds", found.value.machine, found.value.formula) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="計算根拠" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={grounds()}>
          {(found) => (
            <div class="flex flex-col gap-4 p-4">
              <p class="text-sm text-text-muted">保存された解析値を、計算エンジンでもう一度解いた結果です。</p>
              <Index each={found.analysis.settingLevels}>
                {(figures) => <Derivation figures={figures()} spec={found.formula.basis.spec} bet={found.formula.basis.normalized.bet} reasoned={reasonsGrounds(found.formula.basis)} />}
              </Index>
              <SemiproLink class="self-start text-sm" onClick={() => moves.go({ kind: "pachislot-formula-basis", machineId: found.machine.id, formulaId: found.formula.id })}>
                解析値を見る ›
              </SemiproLink>
              <Show when={reasonsGrounds(found.formula.basis)}>
                <ReasonedGrounds basis={found.formula.basis} analysis={found.analysis} figures={found.formula.figures} margins={found.formula.kind === "sampled" ? found.formula.sampling.margins : undefined} />
              </Show>
            </div>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
