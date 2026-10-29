import { createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadFormula } from "../../../../application/pachinko/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { basisOf, type Basis, type Formula } from "../../../../core/pachinko/formula"
import type { FormulaListing } from "../../../../core/formula/standing"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { EmptyState, Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError } from "../../../wording/errors"
import { ViewHeader } from "../../shell/ViewHeader"
import { SpecReadout } from "./SpecReadout"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"
import { missingUndelivered } from "../../catalog/undelivered"

/** Which way a check just given went. */
type Verdict = "verified" | "refuted"

/**
 * What stands in the page's place once a check is given: thanks for it, and
 * the way on — to play with the formula just found right, or back to the
 * machine's formulas from one found wrong.
 */
function CheckThanks(props: { readonly verdict: Verdict; readonly onUse: () => void; readonly onFormulas: () => void; readonly onBack: () => void }): JSX.Element {
  return (
    <section class="m-4 flex flex-col items-center gap-4 rounded-lg border border-border px-5 py-8 text-center">
      <span class="flex size-12 items-center justify-center [&_svg]:size-12" classList={{ "text-semipro-ink": props.verdict === "verified", "text-nerdpro-ink": props.verdict === "refuted" }}>
        <Show when={props.verdict === "verified"} fallback={<ShieldOffIcon />}>
          <ShieldIcon />
        </Show>
      </span>
      <Show
        when={props.verdict === "verified"}
        fallback={
          <>
            <h2 class="text-base font-bold text-text-primary">検証NGという貴重なご意見をいただき、誠にありがとうございます。</h2>
            <p class="text-sm text-text-secondary">合っていない、という報告は、算出条件を正しく保つためのいちばん大切な手がかりです。いただいた検証NGは、この算出条件の順位に反映されます。</p>
            <Button onClick={() => props.onFormulas()}>算出条件一覧へ</Button>
          </>
        }
      >
        <h2 class="text-base font-bold text-text-primary">検証にご協力いただき、ありがとうございました。</h2>
        <p class="text-sm text-text-secondary">いただいた検証OKは、この算出条件の順位に反映されます。</p>
        <Button variant="amateur" onClick={() => props.onUse()}>この機種を使う</Button>
      </Show>
      <button type="button" class="text-xs text-text-muted hover:text-text-primary hover:underline" onClick={() => props.onBack()}>
        期待値基礎値に戻る
      </button>
    </section>
  )
}

/**
 * A formula's 期待値基礎値: the spec values and conditions its simulation was
 * run from, and the normalised combo the engine made of them. The deepest
 * level, and the only place a formula is verified.
 */
export function BasisView(props: { readonly place: Place; readonly machineId: string; readonly formulaId: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const actions = useActions()
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [thanked, setThanked] = createSignal<Verdict | undefined>(undefined)
  const [detail] = createResource(
    () => ({ machineId: props.machineId, formulaId: props.formulaId, revision: app.revision() }),
    (source) => loadFormula(app.services.catalog, source.machineId, source.formulaId),
  )
  const simulated = (): { readonly listing: FormulaListing<Formula>; readonly basis: Basis } | undefined => {
    const found = detail()
    const listing = found?.ok === true ? found.value.listing : undefined
    const basis = listing === undefined ? undefined : basisOf(listing.formula)
    return listing === undefined || basis === undefined ? undefined : { listing, basis }
  }
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "basis", found.value.machine, found.value.listing.formula) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="期待値基礎値" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={missingUndelivered(detail(), app.delivery.state())}>
          {() => (
            <Show when={simulated()} keyed fallback={<EmptyState title="期待値基礎値はありません">手入力の算出条件には、期待値基礎値がありません。</EmptyState>}>
              {(found) => (
                <Show
                  when={thanked()}
                  keyed
                  fallback={
                    <div class="flex flex-col gap-5 p-4">
                      <SpecReadout basis={found.basis} bonuses={found.listing.formula.bonuses} spinsPerHour={found.listing.formula.figures.spinsPerHour} />
                      <details class="text-sm text-text-secondary">
                        <summary class="cursor-pointer text-text-muted">エンジンが解いた状態遷移（スキーマ v{found.basis.engineSchemaVersion}）</summary>
                        <pre class="mt-2 overflow-x-auto rounded-md bg-surface-0 p-3 font-mono text-xs leading-relaxed">{JSON.stringify(found.basis.normalized, null, 2)}</pre>
                      </details>
                      <Show when={failure()} keyed>
                        {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
                      </Show>
                      <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
                        <p class="text-sm text-text-secondary">期待値基礎値と計算根拠を自分で確かめたときだけ押してください。合っていれば検証OK、合っていなければ検証NG。それぞれ1回だけ押せて、取り消せません。考えが変わったら、もう一方を押すと打ち消し合います。</p>
                        <div class="flex flex-wrap items-center gap-2">
                          <Show when={!actions.mine(found.listing.formula.id).verified} fallback={<span class="text-sm font-medium text-semipro-ink">検証OK済み</span>}>
                            <Button variant="semipro" onClick={() => actions.check(found.listing, "verification", setFailure, () => setThanked("verified"))}>
                              検証OK
                            </Button>
                          </Show>
                          <Show when={!actions.mine(found.listing.formula.id).refuted} fallback={<span class="text-sm font-medium text-nerdpro-ink">検証NG済み</span>}>
                            <Button variant="nerdpro" onClick={() => actions.check(found.listing, "refutation", setFailure, () => setThanked("refuted"))}>
                              検証NG
                            </Button>
                          </Show>
                        </div>
                      </section>
                    </div>
                  }
                >
                  {(verdict) => (
                    <CheckThanks
                      verdict={verdict}
                      onUse={() => {
                        const machine = detail()
                        if (machine?.ok === true) actions.use(found.listing.formula, bookNameOf(machine.value.machine))
                      }}
                      onFormulas={() => moves.go({ kind: "pachinko-machine", machineId: props.machineId })}
                      onBack={() => setThanked(undefined)}
                    />
                  )}
                </Show>
              )}
            </Show>
          )}
        </Loaded>
      </div>
    </MainContent>
  )
}
