import { createMemo, createResource, createSignal, For, Show, type JSX } from "solid-js"

import { huntTable } from "../../../../application/pachislot/hunt"
import type { Basis } from "../../../../core/pachislot/formula"
import { atEndingsOf, atModesOf, deepestMisses, huntSeatsOf, resetMatters } from "../../../../core/pachislot/path"
import { DEFAULT_PRIOR } from "../../../../core/pachislot/prior"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { Select } from "../../../primitives/select"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { formatCount, theoreticalFigureText } from "../../../wording/numbers"
import { aboutText, priorName, shareText } from "../../../wording/pachislot/formula"
import { triggerWordsOf } from "../../../wording/pachislot/trigger"
import { TextField } from "../../../primitives/text-field"
import { readTerms } from "../../live/start-terms"
import { useStartForm } from "../../live/start-form"
import { seatCountOf } from "../start/seat-form"

/** The toggle's value for a last AT however it ended. */
const ANY_ENDING = "any"

/** What the mode choice holds while no mode is said: no mode's id. */
const ANY_MODE = "?any"

/** What sets an ending's toggle value apart from the one for any ending. */
const ENDING_PREFIX = "ending:"

/** The ending a toggle value names; none for any ending. */
const endingOfValue = (value: string): string | undefined => (value.startsWith(ENDING_PREFIX) ? value.slice(ENDING_PREFIX.length) : undefined)

/** Games since a side bonus as typed: none where empty or not a whole number. */
const typedSince = (text: string): number | undefined => (text.trim() === "" ? undefined : seatCountOf(text))

/**
 * 天井狙い at an AT machine down a table, by the games since the last AT
 * sat down at: what playing on to the next AT's end comes to, the games it
 * takes and how often a ceiling wins it — after a setting change or not,
 * and just after so many CZs missed where a スルー天井 makes them count;
 * and, where the machine allots its modes by how an AT ended, after a last
 * AT that ended a given way, or however it ended (指定なし); and where
 * the machine has a side bonus, so many games since the last of it, or not
 * knowing how many; and where it has modes, in one known (a shortened
 * ceiling after a ceiling CZ, a 天国 told on screen), or not said. Weighed under the stock spread a play starts with, on the slot terms the
 * start screen holds.
 */
export function HuntTable(props: { readonly basis: Basis }): JSX.Element {
  const app = useApp()
  const start = useStartForm()
  const [afterReset, setAfterReset] = createSignal(false)
  const [misses, setMisses] = createSignal(0)
  const [ending, setEnding] = createSignal<string | undefined>(undefined)
  const [sinceSide, setSinceSide] = createSignal("")
  const [mode, setMode] = createSignal<string | undefined>(undefined)
  const modes = createMemo(() => atModesOf(props.basis.normalized, props.basis.spec.components.label ?? {}))
  const modeLabel = (): string | undefined => ((id) => (id === undefined ? undefined : modes().find((each) => each.id === id)?.label))(mode())
  const side = (): string | undefined => ((rules) => (rules?.sideBonus === undefined ? undefined : props.basis.spec.components.label?.[rules.sideBonus.id] || "別枠ボーナス"))(props.basis.normalized.atRules)
  const endings = createMemo(() => atEndingsOf(props.basis.normalized, props.basis.spec.components.label ?? {}))
  const endingLabel = (): string | undefined => ((id) => (id === undefined || afterReset() ? undefined : endings().find((each) => each.id === id)?.label))(ending())
  const limit = (): number | undefined =>
    ((rules) => (rules === undefined ? undefined : deepestMisses(rules)))(props.basis.normalized.atRules)
  const terms = createMemo(() => ((read) => (read.ok ? read.value : undefined))(readTerms(start.form().terms.slot, "slot")))
  const seats = createMemo(() => huntSeatsOf(props.basis.normalized, afterReset(), misses(), ending(), typedSince(sinceSide()), mode()))
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
        <Show when={endings().length > 0 && !afterReset()}>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-text-muted">前のAT</span>
            <ToggleGroup value={ending() === undefined ? ANY_ENDING : `${ENDING_PREFIX}${ending() ?? ""}`} onChange={(value: string | null) => value !== null && setEnding(endingOfValue(value))} aria-label="前のAT">
              <ToggleGroupItem value={ANY_ENDING}>指定なし</ToggleGroupItem>
              <For each={endings()}>{(each) => <ToggleGroupItem value={`${ENDING_PREFIX}${each.id}`}>{each.label}</ToggleGroupItem>}</For>
            </ToggleGroup>
          </div>
        </Show>
        <Show when={modes().length > 0}>
          <div class="w-44">
            <Select
              label="モード"
              placeholder="指定なし"
              options={[{ value: ANY_MODE, label: "指定なし" }, ...modes().map((each) => ({ value: each.id, label: each.label }))]}
              value={mode() ?? ANY_MODE}
              onChange={(value) => setMode(value === ANY_MODE ? undefined : value)}
            />
          </div>
        </Show>
        <Show when={side()}>
          {(label) => (
            <div class="w-40">
              <TextField label={`${label()}後のG数`} value={sinceSide()} onChange={setSinceSide} inputMode="numeric" suffix="G" placeholder="不明" />
            </div>
          )}
        </Show>
        <Show when={limit()} keyed>
          {(most) => (
            <div class="w-36">
              <Select
                label={`${triggerWordsOf(props.basis.normalized).name}スルー`}
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
      <p class="text-xs text-text-muted">
        設定配分「{priorName(DEFAULT_PRIOR)}」のもとで、通常時は現金で打ち、次のATが終わるまでの平均です。
        {misses() > 0 ? ((trigger) => `${trigger.name}スルーは、${trigger.missed}の直後として出しています。`)(triggerWordsOf(props.basis.normalized)) : ""}
        {((label) => (label === undefined ? "" : `前のATが${label}だった場合の値です。`))(endingLabel())}
        {((label) => (label === undefined ? "" : `モードが「${label}」と分かっている場合の値です。`))(modeLabel())}
        {((label) => (label === undefined || typedSince(sinceSide()) !== undefined ? "" : `${label}は、前回からのG数が分からないものとして平均の確率で入れています。`))(side())}
      </p>
    </section>
  )
}
