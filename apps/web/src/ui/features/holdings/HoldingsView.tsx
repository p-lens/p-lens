import { createEffect, createResource, createSignal, For, on, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { loadHoldings, loadLastMoved } from "../../../application/holdings"
import { loadRecordingContext } from "../../../application/record-tally"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate } from "../../../core/calendar/calendar"
import { savingsAccount } from "../../../core/journal/accounts"
import type { Parlor } from "../../../core/parlor/parlor"
import type { ParlorHolding, TokenHolding } from "../../../core/report/holdings"
import { holdsNothing, inShowingOrder, namedLike } from "../../../core/report/parlor-order"
import { rateKey, ratesInOrder, readRateKey } from "../../../core/report/narrowing"
import type { IsoDate } from "../../../core/calendar/calendar"
import { untilTerm } from "../../../hledger/query/terms"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { filterButtonClass, TickFilter, type Offered } from "../../primitives/filter"
import { ChevronDownIcon, SearchIcon } from "../../primitives/icons"
import { EmptyState, Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { Unfolding } from "../../primitives/unfolding"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formatDay, slashDay } from "../../wording/dates"
import { formatRate, formatTokens, formatYen } from "../../wording/numbers"
import { createOffered } from "../parlor-offers/offered"
import { ViewHeader } from "../shell/ViewHeader"
import { BalanceAdjustmentForm, PrizeExchangeForm, OpeningBalanceForm } from "./SavingsForms"
import { seal } from "../../../mummer"
import { parlorNameText } from "../../wording/parlor"
import { rateText } from "../../wording/commodities"
import { Withheld } from "../mummer/Withheld"

const UNITS = { ball: "玉", medal: "枚" } as const

/** What is open under a pool's row: nothing, the form that records a prize exchange, or the one that puts the count right. */
type Opened = "none" | "prize-exchange" | "adjustment"

const ROW_BUTTON = "shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-secondary hover:border-text-secondary hover:text-text-primary"

/** One pool's savings on a line: how many, at what rate, worth what. */
function TokenFigures(props: { readonly token: TokenHolding }): JSX.Element {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <span class="w-12 shrink-0 text-xs text-text-muted">{props.token.tier}</span>
      <span class="tabular-nums text-text-primary">{formatTokens(seal.savings(props.token.quantity), props.token.kind)}</span>
      <span class="flex-1 text-sm text-text-muted">{props.token.rate === undefined ? "交換率なし" : `@ ${formatRate(props.token.rate.rate)}`}</span>
      <span class="tabular-nums text-text-secondary">{formatYen(seal.savings(props.token.value))}</span>
    </div>
  )
}

/**
 * One pool's savings, pressed to open its passbook beside them, marked
 * while it is open, and, where the book knows whose they are, the ways to
 * record a prize exchange and to put the count right, each opened under
 * the row. The figures keep a line of their own and the two small
 * buttons the end of the next, so neither is squeezed on a phone.
 */
function TokenRow(props: { readonly bookId: BookId; readonly place: Place; readonly parlorName: string; readonly parlor: Parlor | undefined; readonly token: TokenHolding }): JSX.Element {
  const moves = useMoves()
  const [opened, setOpened] = createSignal<Opened>("none")
  const pool = () => ({ kind: props.token.kind, tier: props.token.tier })
  const account = (): string => savingsAccount(props.token.kind, props.parlorName, props.token.tier)
  const shown = (): boolean => props.place.kind === "passbook" && props.place.account === account()
  return (
    <li class="flex flex-col gap-2 py-1.5">
      <button
        type="button"
        aria-label={`${parlorNameText(seal.parlor(props.parlorName))} ${props.token.tier}の通帳`}
        aria-current={shown() ? "true" : undefined}
        class="-mx-2 rounded px-2 py-1 text-left hover:bg-surface-3"
        classList={{ "bg-surface-3": shown() }}
        onClick={() => moves.go({ kind: "passbook", bookId: props.bookId, account: account() })}
      >
        <TokenFigures token={props.token} />
      </button>
      <Show when={props.parlor !== undefined && opened() === "none"}>
        <Withheld kind="savings" silent>
          <div class="flex justify-end gap-2">
            <button type="button" class={ROW_BUTTON} onClick={() => setOpened("prize-exchange")}>
              交換払出
            </button>
            <button type="button" class={ROW_BUTTON} onClick={() => setOpened("adjustment")}>
              残高調整
            </button>
          </div>
        </Withheld>
      </Show>
      <Show when={opened() === "prize-exchange" ? props.parlor : undefined} keyed>
        {(parlor) => <PrizeExchangeForm bookId={props.bookId} parlor={parlor} pool={pool()} unit={UNITS[props.token.kind]} onDone={() => setOpened("none")} />}
      </Show>
      <Show when={opened() === "adjustment" ? props.parlor : undefined} keyed>
        {(parlor) => <BalanceAdjustmentForm bookId={props.bookId} parlor={parlor} pool={pool()} unit={UNITS[props.token.kind]} held={props.token.quantity} onDone={() => setOpened("none")} />}
      </Show>
    </li>
  )
}

/**
 * One parlor's savings: its name and what they are worth, over its pools,
 * each drawn as whoever shows the card draws a pool. Where `onOpen` is
 * given, the heading is pressed to open the parlor's passbook, and marked
 * while it is `open`. The last day its savings moved, where it is known,
 * stands faint in the card's bottom left corner, in its padding, taking
 * no line of its own.
 */
function ParlorCard(props: { readonly holding: ParlorHolding; readonly lastMoved: IsoDate | undefined; readonly onOpen?: () => void; readonly open?: boolean; readonly children: (token: TokenHolding) => JSX.Element }): JSX.Element {
  const heading = (): JSX.Element => (
    <>
      <h2 class="font-semibold text-text-primary">{parlorNameText(seal.parlor(props.holding.parlorName))}</h2>
      <span class="text-lg font-bold tabular-nums text-text-primary">{formatYen(seal.savings(props.holding.value))}</span>
    </>
  )
  return (
    <article class="relative rounded-lg bg-surface-1 px-4 py-3">
      <header class="border-b border-border pb-2">
        <Show when={props.onOpen} keyed fallback={<div class="flex items-baseline justify-between gap-3">{heading()}</div>}>
          {(onOpen) => (
            <button
              type="button"
              aria-label={`${parlorNameText(seal.parlor(props.holding.parlorName))}の通帳`}
              aria-current={props.open === true ? "true" : undefined}
              class="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded px-2 py-1 text-left hover:bg-surface-3"
              classList={{ "bg-surface-3": props.open === true }}
              onClick={onOpen}
            >
              {heading()}
            </button>
          )}
        </Show>
      </header>
      <ul>
        <For each={props.holding.tokens}>{(token) => props.children(token)}</For>
      </ul>
      <Show when={props.lastMoved} keyed>
        {(day) => <p class="pointer-events-none absolute bottom-[13px] left-4 text-[10px] leading-none text-text-muted opacity-70">直近 {slashDay(day)}</p>}
      </Show>
    </article>
  )
}

const BY_RATE = "レート帯"

/** What the filter of rates says where the book holds savings at none. */
const NO_RATES = "貯玉・貯メダルがないため、絞り込めません。"


/**
 * Savings at every parlor, valued at the rate in force on the day shown,
 * with the ways to set them — the savings a person already had when they
 * began the book, registered once, and a pool's count put right — and to
 * record a pool's savings exchanged for prizes.
 * Choosing a day writes `date:..` into the query, so a past valuation is an
 * address like any other. Parlors are shown by the day their savings last
 * moved, latest first — nobody orders them by hand — those holding nothing
 * folded away under them, and a name typed finds any of them. A funnel at the end of that row chooses which
 * rates' savings are shown, at whichever parlor, the total over theirs
 * alone, hledger asked of their accounts; which are chosen is the
 * address's too. Opened again, it shows at once what it last showed for
 * the same book, day and rates, while it asks hledger anew behind it.
 */
export function HoldingsView(props: { readonly place: Place; readonly bookId: BookId; readonly rates: readonly string[] | undefined; readonly query: string; readonly opening: boolean }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const shown = app.savingsShown
  /** What is asked of the book's savings, as what was last shown is kept under it: the book, the day, and the rates where some are chosen. */
  const keyOf = (bookId: BookId, query: string, rates?: readonly string[]): string => [bookId, query, ...(rates === undefined ? [] : ["", ...rates])].join("\n")
  const [asked] = createResource(
    () => ({ bookId: props.bookId, query: props.query, revision: app.revision() }),
    (source) => shown.holdings.asked(keyOf(source.bookId, source.query), () => loadHoldings(app.services.session, source.bookId, source.query)),
  )
  const [narrowedAsked] = createResource(
    () => (props.rates === undefined ? undefined : { bookId: props.bookId, query: props.query, rates: props.rates, revision: app.revision() }),
    (source) => shown.holdings.asked(keyOf(source.bookId, source.query, source.rates), () => loadHoldings(app.services.session, source.bookId, source.query, { by: "rate", pools: source.rates.flatMap((key) => ((pool) => (pool === undefined ? [] : [pool]))(readRateKey(key))) })),
  )
  /** The savings at every parlor: as hledger answers, or until it has, as last shown. */
  const every = () => asked() ?? shown.holdings.kept(keyOf(props.bookId, props.query))
  /** The savings at the rates chosen, hledger asked of theirs alone, or until it has, as last shown. */
  const narrowed = () => narrowedAsked() ?? (props.rates === undefined ? undefined : shown.holdings.kept(keyOf(props.bookId, props.query, props.rates)))
  /** The savings shown: at every rate, or at those chosen. */
  const holdings = () => (props.rates === undefined ? every() : narrowed())
  /** The rates the book holds savings at, at any parlor, whatever is chosen: what the funnel offers, the dearest first. */
  const offered = (): readonly Offered[] => ((found) => (found?.ok === true ? ratesInOrder(found.value.parlors.flatMap((holding) => holding.tokens).map(rateKey)).map((key) => ({ key, label: rateText(key) })) : []))(every())
  const valuedOn = (): string => {
    const found = holdings()
    return found?.ok === true ? (found.value.valuedOn ?? "") : ""
  }
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const [lastMoved] = createResource(
    () => ({ bookId: props.bookId, query: props.query, revision: app.revision() }),
    (source) => shown.lastMoved.asked(keyOf(source.bookId, source.query), () => loadLastMoved(app.services.session, source.bookId, source.query)),
  )
  /** The last day each parlor's savings moved, as last shown until it is read again: none known where it never was, or cannot be. */
  const moved = (): ReadonlyMap<string, IsoDate> => ((found) => (found?.ok === true ? found.value : new Map<string, IsoDate>()))(lastMoved() ?? shown.lastMoved.kept(keyOf(props.bookId, props.query)))
  /** What is typed to find a parlor by its name: kept on screen alone, never in the address. */
  const [typed, setTyped] = createSignal("")
  /** Whether the search's row is open under the controls: opened by the magnifying glass, and closed by it again, forgetting what was typed. */
  const [seeking, setSeeking] = createSignal(false)
  const toggleSeeking = (): void => {
    if (seeking()) setTyped("")
    setSeeking((was) => !was)
  }
  const [emptyShown, setEmptyShown] = createSignal(false)
  const searching = (): boolean => typed().trim() !== ""
  /** The parlors shown as cards: those found by the name typed, or, with nothing typed, those holding anything; latest moved first. */
  const shownOf = (parlors: readonly ParlorHolding[]): readonly ParlorHolding[] => ((ordered) => (searching() ? ordered : ordered.filter((holding) => !holdsNothing(holding))))(namedLike(inShowingOrder(parlors, moved()), typed()))
  /** The parlors holding nothing, folded away under the rest; none while a name is typed, which finds them among the rest. */
  const emptyOf = (parlors: readonly ParlorHolding[]): readonly ParlorHolding[] => (searching() ? [] : inShowingOrder(parlors, moved()).filter(holdsNothing))
  const cardOf = (holding: ParlorHolding): JSX.Element => (
    <ParlorCard holding={holding} lastMoved={moved().get(holding.parlorName)} onOpen={() => moves.go({ kind: "parlor-passbook", bookId: props.bookId, parlorName: holding.parlorName })} open={props.place.kind === "parlor-passbook" && props.place.parlorName === holding.parlorName}>{(token) => <TokenRow bookId={props.bookId} place={props.place} parlorName={holding.parlorName} parlor={holding.parlor} token={token} />}</ParlorCard>
  )
  const listedParlors = createOffered()
  const openingPlace = (): Place => ({ kind: "opening-balance-new", bookId: props.bookId })
  /** What registering savings needs of the book, once it is read and the book may be written. */
  const writable = () => {
    const found = context()
    return found?.ok === true && found.value.canWrite ? found.value : undefined
  }
  /**
   * Whether the opening balance form stands unfolded: it arrives folded and
   * unfolds the frame after, so that it is seen to open, and folds again as
   * the person is done with it, the savings going back to their place only
   * once it has — and its button coming back then, not under it.
   */
  const [unfolded, setUnfolded] = createSignal(false)
  createEffect(
    on(
      () => props.opening && writable() !== undefined,
      (shown) => {
        if (shown) requestAnimationFrame(() => requestAnimationFrame(() => setUnfolded(true)))
        else setUnfolded(false)
      },
    ),
  )
  /** Where the savings are, with the opening balance form still open over them where it is. */
  const here = (): Place => (props.opening ? openingPlace() : props.place)
  /** A day chosen to value the savings on, and the field emptied to value them as they stand now. */
  const chooseDay = (text: string): void => {
    if (text.trim() === "") return void moves.go(here())
    const day = parseIsoDate(text)
    if (day.ok) moves.go(here(), untilTerm(day.value))
  }

  return (
    <MainContent header={<ViewHeader place={props.place} title="貯玉・貯メダル" />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-4 p-4">
          <div class="flex flex-wrap items-end gap-2">
            <div class="w-[8.5rem]">
              <TextField label="評価日" type="date" value={valuedOn()} onChange={chooseDay} />
            </div>
            <Show when={writable() !== undefined && !props.opening}>
              <Withheld kind="savings" silent>
                <Button size="small" onClick={() => moves.go(openingPlace(), props.query)}>
                  開始残高を登録
                </Button>
              </Withheld>
            </Show>
            <div class="ml-auto flex gap-1.5">
              <button type="button" aria-label="店舗を検索" title="店舗を検索" aria-expanded={seeking()} class={filterButtonClass(searching())} onClick={toggleSeeking}>
                <SearchIcon />
              </button>
              <TickFilter label={BY_RATE} offered={offered()} none={NO_RATES} chosen={props.rates} onChosen={(rates) => moves.go({ kind: "book-view", bookId: props.bookId, view: "holdings", rates }, props.query)} />
            </div>
          </div>
          <Show when={seeking()}>
            <div class="grid animate-[spread_260ms_ease-out]">
              <div class="-m-1 min-h-0 overflow-hidden p-1">
                <TextField label="店舗を検索" value={typed()} onChange={setTyped} focusedOnShow />
              </div>
            </div>
          </Show>
          <Show when={props.opening ? writable() : undefined} keyed>
            {(found) => (
              <Unfolding open={unfolded()} gap="-mt-4" onFolded={() => moves.up(openingPlace(), props.query)}>
                <OpeningBalanceForm bookId={props.bookId} context={found} list={listedParlors.list()} submissions={listedParlors.submissions()} onDone={() => setUnfolded(false)} />
              </Unfolding>
            )}
          </Show>
          <Loaded outcome={holdings()}>
            {(found) => (
              <Show
                when={found.parlors.length > 0}
                fallback={
                  <Show when={props.rates?.length !== 0} fallback={<EmptyState title="レート帯が選ばれていません">右上の絞り込みで、残高を見るレート帯を選んでください。</EmptyState>}>
                    <EmptyState title="貯玉・貯メダルはありません">収支を記録するか、開始残高を登録すると、店舗ごとの残高がここに並びます。</EmptyState>
                  </Show>
                }
              >
                <p class="text-sm text-text-muted">
                  合計 <span class="font-semibold tabular-nums text-text-primary">{formatYen(seal.savings(found.total))}</span>
                  {found.valuedOn === undefined ? "" : `（${formatDay(found.valuedOn)}時点の交換率）`}
                </p>
                <Show when={shownOf(found.parlors).length > 0 || !searching()} fallback={<EmptyState title="当てはまる店舗はありません">店舗の名前の一部で探せます。</EmptyState>}>
                  <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <For each={shownOf(found.parlors)}>{cardOf}</For>
                  </div>
                </Show>
                <Show when={emptyOf(found.parlors).length > 0}>
                  <button type="button" aria-expanded={emptyShown()} class="flex items-center gap-1 self-start text-sm text-text-secondary hover:text-text-primary" onClick={() => setEmptyShown((was) => !was)}>
                    <span class="inline-flex transition-transform [&_svg]:size-4" classList={{ "rotate-180": emptyShown() }}>
                      <ChevronDownIcon />
                    </span>
                    残高0の店舗（{emptyOf(found.parlors).length}）
                  </button>
                  <Show when={emptyShown()}>
                    <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <For each={emptyOf(found.parlors)}>{cardOf}</For>
                    </div>
                  </Show>
                </Show>
              </Show>
            )}
          </Loaded>
        </div>
      </div>
    </MainContent>
  )
}
