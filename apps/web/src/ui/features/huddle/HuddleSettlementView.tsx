import { createResource, For, Index, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadTodaysPlays } from "../../../application/live-play"
import { heldSpecialPrizesOf, playsOfChosen, roomMembersOf, roomPlaysOf, roomTotalOf, type RoomMember, type RoomPlay } from "../../../core/huddle/room"
import type { StageStep } from "../../../core/savings/odd-prize-reckoning"
import { SETTLING_STEP, settlementOf, type Contribution, type Settlement } from "../../../core/huddle/settlement"
import { tidyTyped } from "../../../core/text/tidy"
import { useApp } from "../../context"
import { Button, SWITCHED_ON } from "../../primitives/button"
import { cn } from "../../primitives/cn"
import { createHourStruck } from "../../primitives/hour"
import { TextField } from "../../primitives/text-field"
import type { Place } from "../../navigation/place"
import { HUDDLE_DEPARTED, HUDDLE_SETTLE_EXACT, HUDDLE_SETTLEMENT, roomMemberText } from "../../wording/huddle"
import { formatCount, yenFigureText } from "../../wording/numbers"
import { ViewHeader } from "../shell/ViewHeader"

/** Yen as typed: digits, full-width or with commas, and nothing else; none where it is not that. */
const yenTyped = (typed: string): number | undefined => ((tidied) => (/^\d+$/.test(tidied) ? Number(tidied) : undefined))(tidyTyped(typed).replaceAll(",", ""))

/** One member as the settling up reckons them: who, what they spent, and the special prizes they took home — as typed, or else what the balls and medals in hand on the play they are on would exchange for, the odd ones left out. */
interface Reckoned {
  readonly member: RoomMember
  readonly cash: number
  readonly savings: number
  readonly estimate: number
  readonly contribution: Contribution
}

const reckonedOf = (member: RoomMember, plays: readonly RoomPlay[], typed: string | undefined, step: StageStep): Reckoned => {
  const own = playsOfChosen(plays, [member.member])
  const total = roomTotalOf(own)
  const estimate = heldSpecialPrizesOf(own, step)
  return { member, cash: total.outlay, savings: total.savings, estimate, contribution: { member: member.member, spent: total.outlay + total.savings, prizes: yenTyped(typed ?? "") ?? estimate } }
}

/** A figure of the settling up under its name. */
function Figure(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-md border border-border px-3 py-2">
      <dt class="truncate text-xs font-bold tracking-wide text-text-muted">{props.label}</dt>
      <dd class="truncate text-xl font-bold tabular-nums text-text-primary">{props.value}</dd>
    </div>
  )
}

/** What a member pays in or is paid, in words: nothing where they are at their share. */
const dueText = (due: number): string => (due > 0 ? `¥${formatCount(due)} 渡す` : due < 0 ? `¥${formatCount(-due)} もらう` : "精算なし")

/**
 * The members chosen for the total, settled up evenly: what everyone came
 * to together and each one's share; the payments that settle them, who to
 * whom and how much, as few as can be — in thousands, those who came to
 * most holding the odd yen, unless 厳密計算 is switched on to settle to
 * the yen; and each member — what they spent,
 * cash and savings drawn on, the special prizes they took home, typed in
 * here and kept on the page, or else the special prizes the balls and
 * medals in hand would exchange for, by the step last chosen at the odd
 * prizes' calculator, what they pay or are paid, and what that leaves them. Balls passed from one to
 * another come out even, since only what each took home and spent is
 * reckoned. Odd prizes are each member's own and never settled up.
 * Nothing is written anywhere: it is reckoned to be settled by
 * hand. One who left the huddle is settled up with the rest, marked 離脱,
 * until they are unticked in the total's filter — having settled up apart.
 * Every play is counted, those let go of from the room's list too.
 */
export function HuddleSettlementView(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  const hour = createHourStruck()
  const [drafts] = createResource(() => [app.revision(), hour()] as const, () => loadTodaysPlays(app.services.drafts, app.services.businessDay()))
  const plays = (): readonly RoomPlay[] => ((huddle, found) => (huddle === undefined ? [] : roomPlaysOf(huddle, found?.ok === true ? found.value : [], app.huddle.counted(), app.huddle.idle())))(app.huddle.now(), drafts())
  const members = (): readonly RoomMember[] =>
    ((huddle, chosen) => (huddle === undefined ? [] : roomMembersOf(huddle, app.huddle.counted()).filter((each) => chosen === undefined || chosen.includes(each.member))))(app.huddle.now(), app.huddle.chosen.totalled())
  const reckoned = (): readonly Reckoned[] => members().map((member) => reckonedOf(member, plays(), app.huddle.chosen.prizes().get(member.member), app.services.preferences.stageStep()))
  const exact = (): boolean => app.huddle.chosen.settling() === "exact"
  const settlement = (): Settlement | undefined => settlementOf(reckoned().map((each) => each.contribution), exact() ? 1 : SETTLING_STEP)
  const nameOf = (member: string): string => ((found) => (found === undefined ? "" : roomMemberText(found.name, found.own)))(members().find((each) => each.member === member))
  const dueOf = (member: string): number => settlement()?.members.find((each) => each.member === member)?.due ?? 0
  const resultOf = (member: string): number => settlement()?.members.find((each) => each.member === member)?.result ?? 0
  const departed = (member: string): boolean => app.huddle.counted().some((shown) => shown.post.member === member && shown.departed)
  const type = (member: string, typed: string): void => void app.huddle.chosen.setPrizes((so) => new Map(so).set(member, typed))
  return (
    <MainContent header={<ViewHeader place={props.place} title={HUDDLE_SETTLEMENT} />}>
      <div class="flex max-w-5xl flex-col gap-4 p-4">
        <Show when={members().length >= 2} fallback={<p class="text-sm text-text-muted">精算は2人以上で行えます。メンバー合算のフィルターで2人以上を選んでください。</p>}>
          <Show when={settlement()} keyed>
            {(found) => (
              <dl class="grid grid-cols-2 gap-2">
                <Figure label="合計収支" value={yenFigureText(found.result)} />
                <Figure label={`一人あたり（${members().length}人）`} value={yenFigureText(found.share)} />
              </dl>
            )}
          </Show>
          <section class="flex flex-col gap-1.5" aria-labelledby="settlement-transfers">
            <div class="flex items-center gap-2">
              <h2 id="settlement-transfers" class="mr-auto text-xs font-bold tracking-wide text-text-muted">
                受け渡し
              </h2>
              <Button variant="outline" size="small" class={cn(exact() && SWITCHED_ON)} aria-pressed={exact()} onClick={() => app.huddle.chosen.setSettling(exact() ? "rounded" : "exact")}>
                {HUDDLE_SETTLE_EXACT}
              </Button>
            </div>
            <Show when={(settlement()?.transfers.length ?? 0) > 0} fallback={<p class="text-sm text-text-muted">受け渡しはありません。</p>}>
              <ul class="flex flex-col gap-1">
                <For each={settlement()?.transfers ?? []}>
                  {(transfer) => (
                    <li class="flex items-center gap-2 rounded-md bg-surface-1 px-3 py-2 text-sm text-text-primary">
                      <span class="min-w-0 truncate">{nameOf(transfer.from)}</span>
                      <span class="shrink-0 text-text-muted">→</span>
                      <span class="min-w-0 truncate">{nameOf(transfer.to)}</span>
                      <span class="ml-auto shrink-0 font-bold tabular-nums">¥{formatCount(transfer.yen)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </section>
          <section class="flex flex-col gap-2" aria-labelledby="settlement-members">
            <h2 id="settlement-members" class="text-xs font-bold tracking-wide text-text-muted">
              メンバー
            </h2>
            <Index each={reckoned()}>
              {(each) => (
                <div class="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div class="flex items-center gap-2">
                    <span class="min-w-0 truncate text-sm font-semibold text-text-primary">{roomMemberText(each().member.name, each().member.own)}</span>
                    <Show when={departed(each().member.member)}>
                      <span class="shrink-0 rounded-full border border-border px-1.5 text-[11px] font-semibold leading-5 text-text-muted">{HUDDLE_DEPARTED}</span>
                    </Show>
                    <span class="flex-1" />
                    <span class="shrink-0 text-sm font-bold tabular-nums" classList={{ "text-negative": dueOf(each().member.member) > 0, "text-positive": dueOf(each().member.member) < 0, "text-text-muted": dueOf(each().member.member) === 0 }}>
                      {dueText(dueOf(each().member.member))}
                    </span>
                  </div>
                  <div class="grid grid-cols-2 items-end gap-2">
                    <dl class="flex flex-col gap-0.5 text-xs text-text-secondary">
                      <div class="flex justify-between gap-2">
                        <dt>現金投資</dt>
                        <dd class="tabular-nums">¥{formatCount(each().cash)}</dd>
                      </div>
                      <div class="flex justify-between gap-2">
                        <dt>貯玉再プレイ</dt>
                        <dd class="tabular-nums">≒ ¥{formatCount(each().savings)}</dd>
                      </div>
                      <div class="flex justify-between gap-2">
                        <dt>収支</dt>
                        <dd class="tabular-nums">{yenFigureText(resultOf(each().member.member))}</dd>
                      </div>
                      <div class="flex justify-between gap-2">
                        <dt>精算後</dt>
                        <dd class="tabular-nums">{yenFigureText(resultOf(each().member.member) - dueOf(each().member.member))}</dd>
                      </div>
                    </dl>
                    <TextField
                      label="特殊景品額"
                      value={app.huddle.chosen.prizes().get(each().member.member) ?? ""}
                      onChange={(typed) => type(each().member.member, typed)}
                      inputMode="numeric"
                      placeholder={`≒ ${formatCount(each().estimate)}`}
                      suffix="円"
                      invalid={((typed) => typed.trim() !== "" && yenTyped(typed) === undefined)(app.huddle.chosen.prizes().get(each().member.member) ?? "")}
                      compact
                    />
                  </div>
                </div>
              )}
            </Index>
          </section>
          <div class="flex flex-col gap-1 text-xs leading-5 text-text-muted">
            <p>特殊景品額は持ち玉・持ちメダルからの目安（端玉を除き{formatCount(app.services.preferences.stageStep())}円刻み）です。実際の額は各メンバーの欄に手入力できます。入力した額はこの端末で画面を開いている間だけ覚えていて、帳簿には書きません。</p>
            <p>受け渡しは1,000円単位で、端数は収支の多いメンバーから順に持ちます。1円単位なら「{HUDDLE_SETTLE_EXACT}」を押してください。端玉景品は各自のもので精算に入りません。貯玉再プレイは交換率での目安です。出玉を分け合っていても精算は合います。</p>
          </div>
        </Show>
      </div>
    </MainContent>
  )
}
