import type { AnalysisDto, SpecDto, SettingLevelFiguresDto } from "@p-lens/contracts/pachislot"
import { createResource, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../../application/errors"
import { loadFormula, groundsOf } from "../../../../application/pachislot/formulas"
import type { Basis, Formula } from "../../../../core/pachislot/formula"
import { reasonsGrounds } from "../../../../core/pachislot/grounds/facts"
import { Ok } from "../../../../core/result/result"
import type { MachineSummary } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { NerdproLink } from "../../../primitives/button"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import {
  chanceParts,
  contributionParts,
  expectedPerGameParts,
  gainParts,
  headerParts,
  leadParts,
  outcomeGain,
  rateFromContributionsParts,
  rateSourceOf,
  roundingNoteParts,
  totalParts,
} from "../../../wording/pachislot/grounds-sheet"
import { ViewHeader } from "../../shell/ViewHeader"
import { GroundsText } from "./GroundsText"
import { ReasonedGrounds } from "./ReasonedGrounds"
import { trailTo } from "./trail"

const labelOf = (spec: SpecDto, id: string | undefined): string => (id === undefined ? "ハズレ・それ以外" : spec.components.label?.[id] || id)

/** One setting level's 機械割 traced to the outcomes it comes from, each one's chance, its medals net of the bet and its share of a game's theoretical medals. */
function Derivation(props: { readonly figures: SettingLevelFiguresDto; readonly basis: Basis }): JSX.Element {
  const bet = () => props.basis.normalized.bet
  const events = () => props.basis.normalized.tables.find((table) => table.settingLevel === props.figures.settingLevel)?.events ?? []
  const gainOf = (id: string | undefined) => outcomeGain(id, events(), bet())
  const note = () => roundingNoteParts(props.figures.derivation.map((each) => each.medalsPerGame), props.figures.netPerGame)
  return (
    <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
      <h3 class="flex flex-wrap items-baseline justify-between gap-x-3">
        <span class="font-semibold text-text-primary">設定{props.figures.settingLevel}</span>
        <span class="text-sm tabular-nums text-text-secondary">
          <GroundsText parts={headerParts(props.figures.payoutRate, props.figures.netPerGame)} />
        </span>
      </h3>
      <Show
        when={props.figures.derivation.length > 0}
        fallback={
          <div class="flex flex-col gap-1 text-sm text-text-muted">
            <p>
              <GroundsText parts={leadParts(rateSourceOf(props.basis, props.figures))} />
            </p>
            <p class="tabular-nums">
              <GroundsText parts={expectedPerGameParts(bet(), props.figures.payoutRate, props.figures.netPerGame)} />
            </p>
          </div>
        }
      >
        <table class="w-full text-sm tabular-nums">
          <thead class="text-xs text-text-muted">
            <tr>
              <th class="py-1 text-left font-normal">出目</th>
              <th class="py-1 pl-2 text-right font-normal">確率</th>
              <th class="py-1 pl-2 text-right font-normal">差枚</th>
              <th class="py-1 pl-2 text-right font-normal">1Gあたりの寄与</th>
            </tr>
          </thead>
          <tbody>
            <Index each={props.figures.derivation}>
              {(each) => (
                <tr class="border-t border-border">
                  <td class="py-1 text-text-secondary">{labelOf(props.basis.spec, each().id)}</td>
                  <td class="py-1 pl-2 text-right text-text-primary">
                    <GroundsText parts={chanceParts(each().chance)} />
                  </td>
                  <td class="py-1 pl-2 text-right text-text-primary">
                    <GroundsText parts={gainParts(gainOf(each().id))} />
                  </td>
                  <td class="whitespace-nowrap py-1 pl-2 text-right text-text-primary">
                    <GroundsText parts={contributionParts(each().chance, gainOf(each().id), each().medalsPerGame)} />
                  </td>
                </tr>
              )}
            </Index>
          </tbody>
          <tfoot>
            <tr class="border-t border-border">
              <td class="py-1 text-text-secondary" colSpan={3}>
                合計
              </td>
              <td class="whitespace-nowrap py-1 pl-2 text-right text-text-primary">
                <GroundsText parts={totalParts(props.figures.netPerGame)} />
              </td>
            </tr>
          </tfoot>
        </table>
        <p class="text-xs tabular-nums text-text-muted">
          <GroundsText parts={rateFromContributionsParts(props.figures.netPerGame, bet(), props.figures.payoutRate)} />
        </p>
        <Show when={note().length > 0}>
          <p class="text-xs text-text-muted">
            <GroundsText parts={note()} />
          </p>
        </Show>
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
                {(figures) => <Derivation figures={figures()} basis={found.formula.basis} />}
              </Index>
              <Show when={reasonsGrounds(found.formula.basis)}>
                <ReasonedGrounds basis={found.formula.basis} analysis={found.analysis} figures={found.formula.figures} margins={found.formula.kind === "sampled" ? found.formula.sampling.margins : undefined} />
              </Show>
              <NerdproLink class="self-start text-sm" onClick={() => moves.go({ kind: "pachislot-formula-basis", machineId: found.machine.id, formulaId: found.formula.id })}>
                解析値を見る ›
              </NerdproLink>
            </div>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
