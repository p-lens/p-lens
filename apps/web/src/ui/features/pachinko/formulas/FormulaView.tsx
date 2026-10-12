import type { BonusShape } from "@p-lens/contracts/pachinko"
import { createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { reliefDriveOf } from "../../../../application/pachinko/hyena-hunt"
import { loadFormula } from "../../../../application/pachinko/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { bonusShapes } from "../../../../core/pachinko/bonuses"
import { borderOf } from "../../../../core/pachinko/theoretical-value"
import { basisOf, type Formula, type Basis, type Sampling } from "../../../../core/pachinko/formula"
import { useApp } from "../../../context"
import { Button, SemiproLink } from "../../../primitives/button"
import { HandIcon, HandOffIcon, HeartIcon, ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { formulaIdText } from "../../../wording/catalog"
import { formatCount } from "../../../wording/numbers"
import { describeError } from "../../../wording/errors"
import { borderText, kindName, oneInText, payoutText } from "../../../wording/pachinko/formula"
import { useStartBallValue, useStartForm } from "../../live/start-form"
import { ViewHeader } from "../../shell/ViewHeader"
import { BonusTable } from "./BonusTable"
import { HyenaHuntTable } from "./HyenaHuntTable"
import { remadeIn } from "./remaking"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"

function Row(props: { readonly label: string; readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="flex justify-between gap-4 border-t border-border py-2 text-sm first:border-t-0">
      <dt class="text-text-muted">{props.label}</dt>
      <dd class="text-right tabular-nums text-text-primary">{props.children}</dd>
    </div>
  )
}

/**
 * One 算出条件: every figure it holds, where it came from, and what people
 * have done with it. Adopting it as one's own is done here, a level below
 * where most people stop.
 */
/** A formula's basis and its 遊タイム, when it was made from a basis of a machine that has one. */
const hyenaHuntable = (formula: Formula): { readonly basis: Basis; readonly reliefDrive: number } | undefined => {
  const basis = basisOf(formula)
  const reliefDrive = basis === undefined ? undefined : reliefDriveOf(basis)
  return basis === undefined || reliefDrive === undefined ? undefined : { basis, reliefDrive }
}

/** How a sampled formula was sampled; none for any other. */
const samplingOf = (formula: Formula): Sampling | undefined => (formula.kind === "sampled" ? formula.sampling : undefined)

/** The bonuses a formula's basis's jackpots pay, told by their rounds; none for one typed in. */
const shapesOf = (formula: Formula): readonly BonusShape[] => ((basis) => (basis === undefined ? [] : bonusShapes(basis.spec)))(basisOf(formula))

export function FormulaView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const start = useStartForm()
  const actions = useActions()
  const ballValue = useStartBallValue()
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
                <dl class="rounded-lg border border-border px-4 py-2">
                  <Row label="種類">{kindName(formula().kind)}</Row>
                  <Row label="1Rトータル確率">{oneInText(formula().figures.roundChanceOneIn)}</Row>
                  <Row label="1R平均出玉">{payoutText(formula().figures.payoutPerRound)}</Row>
                  <Show when={formula().figures.totalChanceOneIn} keyed>
                    {(total) => <Row label="トータル確率">{oneInText(total)}</Row>}
                  </Show>
                  <Show when={formula().figures.spinsPerHour} keyed>
                    {(speed) => <Row label="1時間の回転数">{speed}回転</Row>}
                  </Show>
                  <Show when={ballValue()} keyed>
                    {(value) => <Row label={`ボーダー（${value}円/玉）`}>{borderText(borderOf(formula().figures, value))}</Row>}
                  </Show>
                  <Show when={samplingOf(formula())} keyed>
                    {(sampling) => (
                      <>
                        <Row label="試行">{formatCount(sampling.cycles)}回（±{sampling.roundChanceMargin.toFixed(2)}、95%）</Row>
                        <Row label="シード">{sampling.seed}</Row>
                      </>
                    )}
                  </Show>
                  <Row label="ID">{formulaIdText(formula().id)}</Row>
                </dl>
                <Show when={formula().bonuses.length > 0}>
                  <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
                    <h3 class="text-sm font-semibold text-text-primary">ボーナス</h3>
                    <BonusTable bonuses={formula().bonuses} shapes={shapesOf(formula())} />
                  </section>
                </Show>
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
                  <Button variant="amateur" onClick={() => actions.use(formula(), bookNameOf(found.machine))}>
                    これを使う
                  </Button>
                </div>
                <Show when={hyenaHuntable(formula())} keyed>
                  {(hyenaHunt) => <HyenaHuntTable basis={hyenaHunt.basis} reliefDrive={hyenaHunt.reliefDrive} />}
                </Show>
                <div class="flex flex-wrap gap-2">
                  <Button variant={actions.mine(listing().formula.id).adopted ? "primary" : "secondary"} aria-pressed={actions.mine(listing().formula.id).adopted} onClick={() => actions.toggle(listing(), "adoption", setFailure)}>
                    {actions.mine(listing().formula.id).adopted ? "イチオシ中" : "イチオシにする"}
                  </Button>
                  <Button variant={actions.mine(listing().formula.id).rejected ? "primary" : "secondary"} aria-pressed={actions.mine(listing().formula.id).rejected} onClick={() => actions.toggle(listing(), "rejection", setFailure)}>
                    {actions.mine(listing().formula.id).rejected ? "非推奨中" : "非推奨にする"}
                  </Button>
                </div>
                <p class="text-xs text-text-muted">イチオシは1機種につき1つ。人にすすめるならこれ、という算出条件に付けてください。すすめられないものは非推奨に。どちらも共有され、順位に効きます。</p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button
                    variant="semipro"
                    onClick={() => {
                      start.updatePachinko({ machine: { type: "catalog", machineId: found.machine.id, name: bookNameOf(found.machine) }, remakeFrom: formula().id })
                      moves.go({ kind: "pachinko-formula-new", tab: remadeIn(formula()) })
                    }}
                  >
                    作り直す
                  </Button>
                  <Show
                    when={basisOf(formula()) !== undefined}
                    fallback={<p class="text-sm text-text-muted">手入力の算出条件です。計算根拠と期待値基礎値はありません。</p>}
                  >
                    <SemiproLink class="text-sm" onClick={() => moves.go({ kind: "pachinko-formula-grounds", machineId: found.machine.id, formulaId: formula().id })}>
                      計算根拠を見る ›
                    </SemiproLink>
                  </Show>
                </div>
              </div>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
