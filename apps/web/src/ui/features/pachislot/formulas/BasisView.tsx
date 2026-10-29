import { createResource, createSignal, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { ApplicationError } from "../../../../application/errors"
import { loadFormula } from "../../../../application/pachislot/formulas"
import { bookNameOf } from "../../../../core/catalog/catalog"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { ShieldIcon, ShieldOffIcon } from "../../../primitives/icons"
import { Loaded } from "../../../primitives/states"
import { useMoves } from "../../../navigation/moves"
import type { Place } from "../../../navigation/place"
import { describeError } from "../../../wording/errors"
import { ViewHeader } from "../../shell/ViewHeader"
import { trailTo } from "./trail"
import { useActions } from "./use-actions"
import { type EntityKindName, manualFormOf, worldFormOf } from "./world-form"
import { missingUndelivered } from "../../catalog/undelivered"

const KIND_NAMES: Readonly<Record<EntityKindName, string>> = {
  bonus: "ボーナス",
  part: "内訳",
  role: "小役",
  replay: "リプレイ",
  at: "AT",
  cz: "CZ",
  mode: "モード",
  watch: "見る場面",
  cue: "示唆",
  side: "別枠ボーナス",
}

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
        解析値に戻る
      </button>
    </section>
  )
}

/**
 * A pachislot formula's 解析値 as it was entered: its setting levels and bet,
 * each entity with its chance under each level and its payout, and the
 * 機械割 when it was measured. Verifying it — checking these against the
 * analysis sheet — is done here, the deepest level.
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
  const trail = () => {
    const found = detail()
    return found?.ok === true ? trailTo(moves, "basis", found.value.machine, found.value.listing.formula) : undefined
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="解析値" trail={trail()} />}>
      <div class="max-w-5xl">
        <Loaded outcome={missingUndelivered(detail(), app.delivery.state())}>
          {(found) => {
            const formula = () => found.listing.formula
            const world = () => worldFormOf(formula().basis.spec)
            const rates = () => manualFormOf(formula().basis.spec, formula().basis.conditions).rates
            const labelOf = (key: string): string => world().rows.find((row) => row.key === key)?.label ?? key
            return (
              <Show
                when={thanked()}
                keyed
                fallback={
                  <div class="flex flex-col gap-4 p-4">
                    <p class="text-sm text-text-secondary">
                      設定 {world().settingLevels.join("・")}／1G {world().bet}枚
                    </p>
                    <div class="overflow-x-auto rounded-lg border border-border">
                      <table class="w-full whitespace-nowrap text-sm tabular-nums">
                        <thead class="text-xs text-text-muted">
                          <tr>
                            <th class="px-3 py-2 text-left font-normal">名前</th>
                            <th class="px-3 py-2 text-left font-normal">種類</th>
                            <th class="px-3 py-2 text-right font-normal">枚数</th>
                            <Index each={world().settingLevels}>{(level) => <th class="px-3 py-2 text-right font-normal">設定{level()}</th>}</Index>
                          </tr>
                        </thead>
                        <tbody>
                          <Index each={world().rows}>
                            {(row) => (
                              <tr class="border-t border-border">
                                <td class="px-3 py-2 text-text-primary">{row().label}</td>
                                <td class="px-3 py-2 text-text-secondary">
                                  {row().kind === "cz" && row().trigger === "cz-then-bonus" ? "CZ→ボーナス（AT抽選）" : row().kind === "cz" && (row().trigger === "bonus" || row().payout !== "") ? "ボーナス（AT抽選）" : KIND_NAMES[row().kind]}
                                  <Show when={row().kind === "part" || row().kind === "cue"}>（{labelOf(row().of)}）</Show>
                                  <Show when={row().kind === "watch"}>
                                    （{labelOf(row().of)}・1回{row().trials === "" ? "1" : row().trials}回）
                                  </Show>
                                </td>
                                <td class="px-3 py-2 text-right text-text-primary">{row().payout === "" ? "--" : `${row().payout}枚`}</td>
                                <Index each={world().settingLevels}>
                                  {(level) => <td class="px-3 py-2 text-right text-text-primary">{row().chances[String(level())] ?? "--"}</td>}
                                </Index>
                              </tr>
                            )}
                          </Index>
                          <Index each={world().rows.filter((row) => row.law.shape === "rate")}>
                            {(row) => (
                              <tr class="border-t border-border">
                                <td class="px-3 py-2 text-text-primary">{row().label} 純増</td>
                                <td />
                                <td class="px-3 py-2 text-right text-text-primary">{row().law.net}枚/G</td>
                                <td class="px-3 py-2 text-text-secondary" colSpan={world().settingLevels.length}>
                                  {["獲得は機械割から", ...row().law.otherNets.map((other) => `獲得の${other.share}%は${other.net}枚/G`)].join("、")}
                                </td>
                              </tr>
                            )}
                          </Index>
                          <Show when={Object.keys(rates()).length > 0}>
                            <tr class="border-t border-border">
                              <td class="px-3 py-2 text-text-primary">機械割（入力値）</td>
                              <td />
                              <td />
                              <Index each={world().settingLevels}>
                                {(level) => <td class="px-3 py-2 text-right text-text-primary">{rates()[String(level())] ?? "--"}%</td>}
                              </Index>
                            </tr>
                          </Show>
                        </tbody>
                      </table>
                    </div>
                    <Show when={failure()} keyed>
                      {(error) => <p role="alert" class="text-sm text-negative">{describeError(error)}</p>}
                    </Show>
                    <Show
                      when={formula().kind !== "manual"}
                      fallback={<p class="text-sm text-text-muted">手入力の算出条件は、機械割をそのまま使うため検証できません。</p>}
                    >
                      <div class="flex flex-col gap-2">
                        <span class="text-xs text-text-muted">解析値を出典と照らし合わせて確かめたら、合っていれば検証OK、合っていなければ検証NGを押してください。それぞれ1回だけ押せて、取り消せません。考えが変わったら、もう一方を押すと打ち消し合います。</span>
                        <div class="flex flex-wrap items-center gap-2">
                          <Show when={!actions.mine(formula().id).verified} fallback={<span class="text-sm font-medium text-semipro-ink">検証OK済み</span>}>
                            <Button variant="semipro" onClick={() => actions.check(formula(), "verification", setFailure, () => setThanked("verified"))}>
                              検証OK
                            </Button>
                          </Show>
                          <Show when={!actions.mine(formula().id).refuted} fallback={<span class="text-sm font-medium text-nerdpro-ink">検証NG済み</span>}>
                            <Button variant="nerdpro" onClick={() => actions.check(formula(), "refutation", setFailure, () => setThanked("refuted"))}>
                              検証NG
                            </Button>
                          </Show>
                        </div>
                      </div>
                    </Show>
                  </div>
                }
              >
                {(verdict) => (
                  <CheckThanks
                    verdict={verdict}
                    onUse={() => actions.useFormula(formula(), bookNameOf(found.machine))}
                    onFormulas={() => moves.go({ kind: "pachislot-machine", machineId: props.machineId })}
                    onBack={() => setThanked(undefined)}
                  />
                )}
              </Show>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
