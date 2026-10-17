import { createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadFormula } from "../../../../application/pachislot/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import type { Formula, Sampling } from "../../../../core/pachislot/formula"
import { useApp } from "../../../context"
import { Button, SemiproLink } from "../../../primitives/button"
import { HandIcon, HandOffIcon, HeartIcon, ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { formulaIdText } from "../../../wording/catalog"
import { describeError } from "../../../wording/errors"
import { formatCount } from "../../../wording/numbers"
import { kindName, UNCHECKED } from "../../../wording/pachislot/formula"
import { useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { FiguresTable } from "./FiguresTable"
import { HuntTable } from "./HuntTable"
import { remadeIn } from "./remaking"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"

const samplingOf = (formula: Formula): Sampling | undefined => (formula.kind === "sampled" ? formula.sampling : undefined)

/**
 * One pachislot 算出条件: each setting level's 機械割 and bonus odds, at an
 * AT machine 天井狙い down a table, how it was made, and what people have
 * done with it. Adopting it as one's own is
 * done here, a level below where most people stop.
 */
export function FormulaView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const actions = useActions()
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [detail] = createResource(
    () => ({ machineId: props.machineId, formulaId: props.formulaId, revision: app.revision() }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "formula", found.value.machine, found.value.listing.formula) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="算出条件" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={detail()}>
          {(found) => {
            const listing = () => found.listing
            const formula = () => found.listing.formula
            return (
              <div class="flex flex-col gap-5 p-4">
                <FiguresTable figures={formula().figures} sampling={samplingOf(formula())} />
                <Show when={formula().basis.normalized.atRules !== undefined}>
                  <HuntTable basis={formula().basis} />
                </Show>
                <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div class="flex gap-2"><dt class="text-text-muted">種類</dt><dd class="text-text-primary">{kindName(formula().kind)}</dd></div>
                  <Show when={formula().unchecked}>
                    <div class="flex gap-2"><dt class="text-text-muted">共有カタログ</dt><dd class="text-text-primary">{UNCHECKED}</dd></div>
                  </Show>
                  <Show when={samplingOf(formula())} keyed>
                    {(sampling) => (
                      <>
                        <div class="flex gap-2"><dt class="text-text-muted">試行</dt><dd class="tabular-nums text-text-primary">設定ごとに {formatCount(sampling.gamesPerSettingLevel)}G（±は95%）</dd></div>
                        <div class="flex gap-2"><dt class="text-text-muted">シード</dt><dd class="tabular-nums text-text-primary">{sampling.seed}</dd></div>
                      </>
                    )}
                  </Show>
                  <div class="flex gap-2"><dt class="text-text-muted">ID</dt><dd class="tabular-nums text-text-primary">{formulaIdText(formula().id)}</dd></div>
                </dl>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                  <span class="flex items-center gap-1 [&_svg]:size-4"><ShieldIcon /> 検証OK {listing().standing.verifications}</span>
                  <span class="flex items-center gap-1 [&_svg]:size-4"><ShieldOffIcon /> 検証NG {listing().standing.refutations}</span>
                  <span class="flex items-center gap-1 [&_svg]:size-4"><HandIcon /> イチオシ {listing().standing.adoptions}</span>
                  <span class="flex items-center gap-1 [&_svg]:size-4"><HandOffIcon /> 非推奨 {listing().standing.rejections}</span>
                  <span class="flex items-center gap-1 [&_svg]:size-4"><HeartIcon filled={false} /> お気に入り {listing().standing.favorites}</span>
                  <span>利用 {listing().standing.uses}回</span>
                </div>
                <Show when={failure()} keyed>
                  {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
                </Show>
                <div>
                  <Button variant="amateur" onClick={() => actions.useFormula(formula(), bookNameOf(found.machine))}>
                    これを使う
                  </Button>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button
                    variant={actions.mine(formula().id).adopted ? "primary" : "secondary"}
                    aria-pressed={actions.mine(formula().id).adopted}
                    onClick={() => actions.toggle("formula", listing(), "adoption", setFailure)}
                  >
                    {actions.mine(formula().id).adopted ? "イチオシ中" : "イチオシにする"}
                  </Button>
                  <Button variant={actions.mine(formula().id).rejected ? "primary" : "secondary"} aria-pressed={actions.mine(formula().id).rejected} onClick={() => actions.toggle("formula", listing(), "rejection", setFailure)}>
                    {actions.mine(formula().id).rejected ? "非推奨中" : "非推奨にする"}
                  </Button>
                </div>
                <p class="text-xs text-text-muted">イチオシは1機種につき1つ。人にすすめるならこれ、という算出条件に付けてください。すすめられないものは非推奨に。どちらも共有され、順位に効きます。</p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    variant="semipro"
                    onClick={() => {
                      start.updatePachislot({ machine: { type: "catalog", machineId: found.machine.id, name: bookNameOf(found.machine) }, remakeFrom: formula().id })
                      moves.go({ kind: "pachislot-formula-new", tab: remadeIn(formula()) })
                    }}
                  >
                    作り直す
                  </Button>
                  <SemiproLink class="text-sm" onClick={() => moves.go({ kind: "pachislot-formula-grounds", machineId: found.machine.id, formulaId: formula().id })}>
                    計算根拠を見る ›
                  </SemiproLink>
                </div>
              </div>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
