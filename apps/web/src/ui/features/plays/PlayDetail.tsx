import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { AuxPanel } from "solid-gathering-shell"

import { loadPlay } from "../../../application/plays"
import { removePlay } from "../../../application/revise-play"
import type { BookId } from "../../../core/book/book"
import { negate, type Decimal } from "../../../core/decimal/decimal"
import { isWrittenReversed } from "../../../core/journal/accounts"
import type { PlayTerms } from "../../../core/parlor/terms"
import type { PlayId } from "../../../core/play/play"
import type { PlaySummary } from "../../../core/report/plays"
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
import { describeError } from "../../wording/errors"
import { formatCommodityAmount, formatTheoreticalYen } from "../../wording/numbers"
import { rateText } from "../../wording/parlor"
import { NO_MACHINE, NO_PARLOR } from "../../wording/plays"
import { Figure } from "./Figure"
import * as PachinkoViews from "../pachinko"
import * as PachislotViews from "../pachislot"

const asRead = (account: string, quantity: Decimal): Decimal => (isWrittenReversed(account) ? negate(quantity) : quantity)

const GAME_KINDS = { pachinko: "パチンコ", slot: "スロット" } as const

/** What a play was, under its machine's name: when, where and at which cabinet, then its game and the rate it was on, as its log's head says it. Each is said even where the play names none: no parlor in words, the rest as dashes. */
function Facts(props: { readonly play: PlaySummary; readonly parlorName: string | undefined; readonly terms: PlayTerms | undefined }): JSX.Element {
  const facts = (): readonly (readonly [string, string])[] => [
    ["日付", formatDay(props.play.date)],
    ["店舗", props.parlorName ?? NO_PARLOR],
    ["台番号", props.play.cabinetNumber ?? "--"],
    ["種別", props.play.gameKind === undefined ? "--" : GAME_KINDS[props.play.gameKind]],
    ["レート", props.play.gameKind === undefined || props.terms === undefined ? "--" : rateText(props.play.gameKind, props.terms)],
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
              <span class="text-text-secondary">{posting.ptype === "RegularPosting" ? posting.paccount : `(${posting.paccount})`}</span>
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
 * One play beside the list it was chosen from, under its machine's name:
 * when, where and at which cabinet it was played, what it came
 * to, its readings as they were taken where it was followed live, its
 * entry, and the ways to set it right or take it out of the book — the
 * second only after being asked again.
 */
export function PlayDetail(props: { readonly place: Place; readonly bookId: BookId; readonly playId: PlayId; readonly query: string }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [play] = createResource(
    () => ({ bookId: props.bookId, playId: props.playId, revision: app.revision() }),
    (source) => loadPlay(app.services.session, source.bookId, source.playId),
  )
  /** Whether the person asked to remove the play, until they say yes or no. */
  const [removing, setRemoving] = createSignal(false)
  const remove = async (): Promise<void> => {
    setRemoving(false)
    const gone = await removePlay(app.services.session, props.bookId, props.playId)
    if (!gone.ok) {
      toast({ title: "稼働を削除できませんでした", description: describeError(gone.error), tone: "error" })
      return
    }
    toast({ title: "稼働を削除しました" })
    moves.up(props.place, props.query)
    app.wrote()
  }
  return (
    <AuxPanel
      header={
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <h2 class="min-w-0 flex-1 truncate font-semibold text-text-primary">稼働の詳細</h2>
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
      <Loaded outcome={play()}>
        {(found) => (
          <div class="flex flex-col gap-4 p-4">
            <p class="break-words text-lg font-semibold text-text-primary">{found.names.machineName ?? NO_MACHINE}</p>
            <Facts play={found.summary} parlorName={found.names.parlorName} terms={found.terms} />
            <dl class="grid grid-cols-2 gap-2">
              <Figure label="実収支" value={found.actual} kind="actual" caption="稼働日の交換率で評価" />
              <Figure label="期待値" value={found.summary.theoreticalValue === undefined ? undefined : found.theoretical} kind="theoretical" />
            </dl>
            <Show when={found.log} keyed>
              {(log) => (
                <section class="flex flex-col gap-2">
                  <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">計測履歴</h3>
                  <Show when={found.summary.gameKind === "slot"} fallback={<PachinkoViews.Timeline checkpoints={log} revising={undefined} onRevise={undefined} onMerge={undefined} />}>
                    <PachislotViews.Timeline checkpoints={log} bonuses={undefined} revising={undefined} onRevise={undefined} onMerge={undefined} />
                  </Show>
                </section>
              )}
            </Show>
            <section class="flex flex-col gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wide text-text-muted">仕訳</h3>
              <Postings postings={found.transaction.tpostings} />
            </section>
            <Show when={found.summary.theoreticalValue === undefined}>
              <p class="text-xs text-text-muted">この稼働には期待値が記録されていません（{formatTheoreticalYen(found.theoretical)}として集計）。</p>
            </Show>
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="small" class="gap-1.5" onClick={() => moves.go({ kind: "play-revise", bookId: props.bookId, playId: props.playId })}>
                <EditIcon label="" />
                修正
              </Button>
              <Button variant="outline" size="small" class="gap-1.5" onClick={() => setRemoving(true)}>
                <TrashIcon />
                削除
              </Button>
            </div>
            <ConfirmDialog open={removing()} title="この稼働を削除しますか？" confirm="削除する" decline="やめる" onConfirmed={() => void remove()} onDeclined={() => setRemoving(false)}>
              <p>{found.summary.description}</p>
              <p>仕訳が帳簿から外れ、収支・期待値・貯玉の残高がその分だけ変わります。</p>
            </ConfirmDialog>
          </div>
        )}
      </Loaded>
    </AuxPanel>
  )
}
