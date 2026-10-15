import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"

import { huntTable } from "../../../../application/pachislot/hunt"
import type { Basis } from "../../../../core/pachislot/formula"
import { huntSeatsOf, resetMatters } from "../../../../core/pachislot/path"
import { DEFAULT_PRIOR } from "../../../../core/pachislot/prior"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { Select } from "../../../primitives/select"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { formatCount, theoreticalFigureText } from "../../../wording/numbers"
import { aboutText, priorName, shareText } from "../../../wording/pachislot/formula"
import { readTerms } from "../../live/start-terms"
import { useStartForm } from "../../live/start-form"

/**
 * 天井狙い at an AT machine down a table, by the games since the last AT
 * sat down at: what playing on to the next AT's end comes to, the games it
 * takes and how often a ceiling wins it — after a setting change or not,
 * and just after so many CZs missed where a スルー天井 makes them count.
 * Weighed under the stock spread a play starts with, on the slot terms the
 * start screen holds.
 */
export function HuntTable(props: { readonly basis: Basis }): JSX.Element {
  const app = useApp()
  const start = useStartForm()
  const [afterReset, setAfterReset] = createSignal(false)
  const [misses, setMisses] = createSignal(0)
  const limit = (): number | undefined => props.basis.normalized.atRules?.misses
  const terms = createMemo(() => ((read) => (read.ok ? read.value : undefined))(readTerms(start.form().terms.slot, "slot")))
  const seats = createMemo(() => huntSeatsOf(props.basis.normalized, afterReset(), misses()))
  const [rows] = createResource(
    () => ((found) => (found === undefined ? undefined : { terms: found, seats: seats() }))(terms()),
    (asked) => huntTable(app.services.pachislot, props.basis, asked.terms, asked.seats),
  )
  return (
    <section class="flex flex-col gap-3" aria-label="天井狙い">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">天井狙い（AT終了まで）</h2>
      <div class="flex flex-wrap items-end gap-3">
        <Show when={resetMatters(props.basis.normalized)}>
          <ToggleGroup value={afterReset() ? "reset" : "kept"} onChange={(value: string | null) => value !== null && setAfterReset(value === "reset")} aria-label="設定変更">
            <ToggleGroupItem value="kept">設定変更なし</ToggleGroupItem>
            <ToggleGroupItem value="reset">設定変更後</ToggleGroupItem>
          </ToggleGroup>
        </Show>
        <Show when={limit()} keyed>
          {(most) => (
            <div class="w-36">
              <Select
                label="CZスルー"
                placeholder="0回"
                options={Array.from({ length: most + 1 }, (_, count) => ({ value: String(count), label: `${String(count)}回` }))}
                value={String(misses())}
                onChange={(value) => setMisses(Number(value))}
              />
            </div>
          )}
        </Show>
      </div>
      <Show when={terms()} fallback={<p class="text-xs text-text-muted">スロット開始で貸枚と交換を入れると、天井狙いの表が出ます。</p>}>
        <Loaded outcome={rows()}>
          {(found) => (
            <table class="w-full max-w-xl text-sm tabular-nums">
              <thead>
                <tr class="text-left text-xs text-text-muted">
                  <th class="py-1 font-normal">打ち始め</th>
                  <th class="py-1 text-right font-normal">期待値</th>
                  <th class="py-1 text-right font-normal">ATまで</th>
                  <th class="py-1 text-right font-normal">天井で当選</th>
                </tr>
              </thead>
              <tbody>
                <For each={found}>
                  {(row) => (
                    <tr class="border-t border-border">
                      <td class="py-1.5">AT間 {formatCount(row.seat.sinceAt)}G</td>
                      <td class="py-1.5 text-right font-semibold">{theoreticalFigureText(row.hunt.yen)}</td>
                      <td class="py-1.5 text-right">{aboutText(row.hunt.games, "G")}</td>
                      <td class="py-1.5 text-right">{shareText(row.hunt.byCeiling)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          )}
        </Loaded>
      </Show>
      <p class="text-xs text-text-muted">設定配分「{priorName(DEFAULT_PRIOR)}」のもとで、通常時は現金で打ち、次のATが終わるまでの平均です。{misses() > 0 ? "CZスルーは、CZに失敗した直後として出しています。" : ""}</p>
    </section>
  )
}
