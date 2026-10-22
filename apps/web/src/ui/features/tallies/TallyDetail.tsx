import { createResource, createSignal, For, Match, Show, Switch, type JSX } from "solid-js"
import { AuxPanel } from "solid-gathering-shell"

import { loadTally } from "../../../application/tallies"
import { removeTally } from "../../../application/revise-tally"
import { modelNameOf, shownNameOf } from "../../../core/catalog/catalog"
import type { BookId } from "../../../core/book/book"
import { negate, type Decimal } from "../../../core/decimal/decimal"
import { isWrittenReversed } from "../../../core/journal/accounts"
import type { PlayTerms } from "../../../core/parlor/terms"
import type { PlayId } from "../../../core/play/play"
import type { TallySummary } from "../../../core/report/tallies"
import { decimalOfQuantity } from "../../../core/report/figures"
import type { Posting } from "../../../hledger/protocol/wire"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { ConfirmDialog } from "../../primitives/dialog"
import { CloseIcon, EditIcon, TrashIcon } from "../../primitives/icons"
import { Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay } from "../../wording/dates"
import { describeError, describePlayLogError } from "../../wording/errors"
import { formatCommodityAmount, formatTheoreticalYen } from "../../wording/numbers"
import { rateText } from "../../wording/parlor"
import { NO_MACHINE, NO_PARLOR, shownDescription, tallyTitle } from "../../wording/tallies"
import { Figure } from "./Figure"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"

const asRead = (account: string, quantity: Decimal): Decimal => (isWrittenReversed(account) ? negate(quantity) : quantity)

const GAME_KINDS = { pachinko: "パチンコ", pachislot: "スロット" } as const

/** What a tally was, under its machine's name: the model name the book keeps it under, when, where and at which cabinet, then its game and the rate its play was on, as its play's log says it in its head. Each is said even where the tally names none: no parlor in words, the rest as dashes. */
function Facts(props: { readonly tally: TallySummary; readonly parlorName: string | undefined; readonly modelName: string | undefined; readonly terms: PlayTerms | undefined }): JSX.Element {
  const facts = (): readonly (readonly [string, string])[] => [
    ["型式", props.modelName ?? "--"],
    ["日付", formatDay(props.tally.date)],
    ["店舗", props.parlorName ?? NO_PARLOR],
    ["台番号", props.tally.cabinetNumber ?? "--"],
    ["種別", props.tally.gameKind === undefined ? "--" : GAME_KINDS[props.tally.gameKind]],
    ["レート", props.tally.gameKind === undefined || props.terms === undefined ? "--" : rateText(props.tally.gameKind, props.terms)],
  ]
  return (
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <For each={facts()}>
        {([label, value]) => (
          <>
            <dt class="text-text-muted">{label}</dt>
            <dd class="break-words text-text-primary">{value}</dd>
          </>
        )}
      </For>
    </dl>
  )
}

/**
 * The entry's postings as a person reads them: each as hledger read it, but
 * for revenue, which the journal writes turned over and is shown here as
 * what was won. Only the book's own files show it as written. A virtual
 * posting is shown in parentheses, as the journal writes it. A line is
 * never cut short: where the panel is narrower than the longest, the
 * list is scrolled sideways.
 */
function Postings(props: { readonly postings: readonly Posting[] }): JSX.Element {
  return (
    <div class="overflow-x-auto pb-1">
      <ul class="flex min-w-max flex-col gap-1 whitespace-nowrap font-mono text-xs">
        <For each={props.postings}>
          {(posting) => (
            <li class="flex justify-between gap-6">
              <span class="text-text-secondary">{posting.preal === "RealPosting" ? posting.paccount : `(${posting.paccount})`}</span>
              <span class="shrink-0 tabular-nums text-text-primary">
                {posting.pamount.map((amount) => formatCommodityAmount(asRead(posting.paccount, decimalOfQuantity(amount.aquantity)), amount.acommodity)).join(", ")}
              </span>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}

/**
 * One tally beside the list it was chosen from, under its machine's name:
 * when, where and at which cabinet its play was played, what it came to,
 * its play's readings as they were taken where the play was followed live,
 * its entry, and the ways to set it right or take it out of the book — the
 * second only after being asked again.
 */
export function TallyDetail(props: { readonly place: Place; readonly bookId: BookId; readonly playId: PlayId; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [tally] = createResource(
    () => ({ bookId: props.bookId, playId: props.playId, revision: app.revision() }),
    (source) => loadTally(app.services.session, source.bookId, source.playId),
  )
  /** Whether the person asked to remove the tally, until they say yes or no. */
  const [removing, setRemoving] = createSignal(false)
  const remove = async (): Promise<void> => {
    setRemoving(false)
    const gone = await removeTally(app.services.session, props.bookId, props.playId)
    if (!gone.ok) {
      toast({ title: "収支を削除できませんでした", description: describeError(gone.error), tone: "error" })
      return
    }
    toast({ title: "収支を削除しました" })
    moves.up(props.place, props.query)
    app.wrote()
  }
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">収支の詳細</h2>
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary"
            onClick={() => moves.up(props.place, props.query)}
          >
            <CloseIcon label="閉じる" />
          </button>
        </div>
      }
      resizeLabel="詳細パネルの幅を変える"
    >
      <Loaded outcome={tally()}>
        {(found) => (
          <div class="flex flex-col gap-4 p-4">
            <p class="break-words text-lg font-semibold text-text-primary">{found.names.machineName === undefined ? NO_MACHINE : shownNameOf(app.machineNames(), found.names.machineName)}</p>
            <Facts
              tally={found.summary}
              parlorName={found.names.parlorName}
              modelName={found.names.machineName === undefined ? undefined : modelNameOf(app.machineNames(), found.names.machineName)}
              terms={found.terms}
            />
            <dl class="grid grid-cols-2 gap-2">
              <Figure label="実収支" value={found.actual} kind="actual" caption="稼働日の交換率で評価" />
              <Figure
                label={found.summary.theoreticalValue === undefined && found.summary.inferredValue !== undefined ? "推定期待値" : "期待値"}
                value={found.summary.theoreticalValue === undefined && found.summary.inferredValue === undefined ? undefined : found.theoretical}
                kind="theoretical"
                {...(found.summary.theoreticalValue === undefined && found.summary.inferredValue !== undefined ? { caption: "稼働時間と収支から推定" } : {})}
              />
            </dl>
            <Show when={found.log.type !== "none"}>
              <section class="flex flex-col gap-2">
                <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">計測履歴</h3>
                <Switch>
                  <Match when={found.log.type === "read" && found.log.checkpoints} keyed>
                    {(log) => (
                      <Show when={found.summary.gameKind === "pachislot"} fallback={<PachinkoViews.Timeline checkpoints={log} terms={found.terms} revising={undefined} onRevise={undefined} onMerge={undefined} />}>
                        <PachislotViews.Timeline checkpoints={log} bonuses={undefined} revising={undefined} onRevise={undefined} onMerge={undefined} />
                      </Show>
                    )}
                  </Match>
                  <Match when={found.log.type === "unreadable" && found.log.error} keyed>
                    {(error) => (
                      <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
                        {error.type === "unreadable-terms" ? "稼働ログの先頭行のレートが壊れていて読めません。" : describePlayLogError(error)}
                      </p>
                    )}
                  </Match>
                </Switch>
              </section>
            </Show>
            <section class="flex flex-col gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">仕訳</h3>
              <Postings postings={found.transaction.tpostings} />
            </section>
            <Show when={found.summary.theoreticalValue === undefined && found.summary.inferredValue === undefined}>
              <p class="text-xs text-text-muted">この収支には期待値が記録されていません（{formatTheoreticalYen(found.theoretical)}として集計）。</p>
            </Show>
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="small" class="gap-1.5" onClick={() => moves.go({ kind: "tally-revise", bookId: props.bookId, playId: props.playId })}>
                <EditIcon label="" />
                修正
              </Button>
              <Button variant="outline" size="small" class="gap-1.5" onClick={() => setRemoving(true)}>
                <TrashIcon />
                削除
              </Button>
            </div>
            <ConfirmDialog open={removing()} title="この収支を削除しますか？" confirm="削除する" decline="やめる" onConfirmed={() => void remove()} onDeclined={() => setRemoving(false)}>
              <p>{shownDescription(found.summary.description) || tallyTitle(found.summary, app.machineNames())}</p>
              <p>仕訳が帳簿から外れ、収支・期待値・貯玉の残高がその分だけ変わります。</p>
            </ConfirmDialog>
          </div>
        )}
      </Loaded>
    </AuxPanel>
  )
}
