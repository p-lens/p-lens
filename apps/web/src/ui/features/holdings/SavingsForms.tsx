import { createMemo, createResource, createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import { adjustBalance, changeExchangeRate, exchangeRateOn, recordForfeiture, recordPrizeExchange, registerOpeningBalance } from "../../../application/savings"
import type { BookId } from "../../../core/book/book"
import { parseIsoDate } from "../../../core/calendar/calendar"
import { compare, decimal, isNegative, multiply, subtract, toPlainString, type Decimal } from "../../../core/decimal/decimal"
import { identityKey, type Parlor, type SavingsPool } from "../../../core/parlor/parlor"
import { rentalPriceOfTier } from "../../../core/parlor/terms"
import { exchangedOddPrizes } from "../../../core/savings/prize-exchange"
import type { ParlorList } from "../../../core/parlor/shared"
import { exchangeOfStated, exchangeRateOf, poolOf, statedExchangeOfRate, type PlayTerms } from "../../../core/parlor/terms"
import type { PlayGameKind } from "../../../core/play/play"
import { tidyTyped } from "../../../core/text/tidy"
import type { Submission } from "../../../parlors/port/submission-store"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Combobox, holdsTypedOnly } from "../../primitives/combobox"
import { createNudge } from "../../primitives/nudge"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { ToggleGroup, ToggleGroupItem } from "../../primitives/toggle-group"
import { describeError } from "../../wording/errors"
import { amountText, formatRate, formatYen, signedAmountText } from "../../wording/numbers"
import { chosenParlorText, locateFailedText, parlorChoiceText, parlorNameText, typedParlorRefused } from "../../wording/parlor"
import { offersByKey, parlorOffers } from "../parlor-offers/parlor-offers"
import { seal } from "../../../mummer"
import { Withheld } from "../mummer/Withheld"

/** Where a form's saving is: being typed, being written, or failed. */
type Saving = { readonly type: "typing" } | { readonly type: "saving" } | { readonly type: "failed"; readonly error: ApplicationError }

const COUNT = /^\d+$/

/** A whole count as typed, commas allowed; undefined where it is none. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : undefined
}

const whole = (count: number): Decimal => decimal(BigInt(count), 0)

/** The largest step special prizes come in at any parlor: odd prizes beyond it suggest the book's rate is off. */
const LARGEST_PRIZE_STEP = decimal(1000n, 0)

/** The rates a corner usually has, for each game, what the form opens with: the tokens ¥1,000 rents, and the tokens ¥100 is exchanged for. */
const USUAL: Readonly<Record<PlayGameKind, { readonly rental: string; readonly exchange: string; readonly unit: string }>> = {
  pachinko: { rental: "250", exchange: "28", unit: "玉" },
  pachislot: { rental: "46", exchange: "5.2", unit: "枚" },
}

/** The terms a corner's rates make, as far as a pool needs them: its rate names the pool, its exchange values the savings. A replay is none of a balance's business. */
const termsOf = (rental: number, exchange: PlayTerms["exchange"]): PlayTerms => ({ rental: { yen: 1000, tokens: rental }, exchange, replay: { paidOut: 1, deducted: 1 } })

function Failure(props: { readonly saving: Saving }): JSX.Element {
  return (
    <Show when={((current) => (current.type === "failed" ? current.error : undefined))(props.saving)} keyed>
      {(error) => (
        <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
          {describeError(error)}
        </p>
      )}
    </Show>
  )
}

/**
 * Registering the savings a person already had at a parlor when they began
 * keeping the book: the parlor, chosen as a play's is and never typed, the
 * corner by its rates, how many tokens, and the day they stood at that.
 * In a wide window it takes two thirds of the width, so its fields are not
 * stretched across the screen; a phone gives it the whole width.
 */
export function OpeningBalanceForm(props: {
  readonly bookId: BookId
  readonly context: RecordingContext
  readonly list: ParlorList
  readonly submissions: readonly Submission[]
  readonly onDone: () => void
}): JSX.Element {
  const app = useApp()
  const [here] = createResource(() => app.services.locate())
  const offers = createMemo(() => {
    const found = here()
    return parlorOffers(props.context.parlors, props.list, props.submissions, found?.ok === true ? found.value : undefined)
  })
  const offerOf = createMemo(() => offersByKey(offers()))
  const [parlorKey, setParlorKey] = createSignal("")
  const [typed, setTyped] = createSignal("")
  const [game, setGame] = createSignal<PlayGameKind>("pachinko")
  const [rental, setRental] = createSignal(USUAL.pachinko.rental)
  const [exchange, setExchange] = createSignal(USUAL.pachinko.exchange)
  const [tokens, setTokens] = createSignal("")
  const [date, setDate] = createSignal<string>(app.services.businessDay())
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const chosen = (): Parlor | undefined => offerOf().get(parlorKey())?.parlor
  const typedOnly = (): boolean => holdsTypedOnly(typed(), chosenParlorText(chosen()?.name))
  const positive = (text: string): number | undefined => {
    const count = countOf(text)
    return count !== undefined && count > 0 ? count : undefined
  }
  const day = () => parseIsoDate(date())
  const exchanged = (): PlayTerms["exchange"] | undefined => exchangeOfStated(game(), tidyTyped(exchange()).replaceAll(",", ""))
  const missing = (field: "parlor" | "rental" | "exchange" | "tokens" | "date"): boolean => {
    if (!nudge.red()) return false
    if (field === "parlor") return chosen() === undefined
    if (field === "date") return !day().ok
    if (field === "exchange") return exchanged() === undefined
    return field === "tokens" ? countOf(tokens()) === undefined : positive(rental()) === undefined
  }
  const play = (kind: PlayGameKind): void => {
    setGame(kind)
    setRental(USUAL[kind].rental)
    setExchange(USUAL[kind].exchange)
  }
  const save = async (): Promise<void> => {
    settleTyping()
    const parlor = chosen()
    const [rented, stated, held, on] = [positive(rental()), exchanged(), countOf(tokens()), day()]
    if (saving().type === "saving") return
    if (parlor === undefined || typedOnly() || rented === undefined || stated === undefined || held === undefined || !on.ok) {
      nudge.nudge()
      return
    }
    const terms = termsOf(rented, stated)
    setSaving({ type: "saving" })
    const registered = await registerOpeningBalance(
      app.services.session,
      props.bookId,
      { identity: parlor.identity, parlorName: parlor.name, pool: poolOf(game(), terms), rate: exchangeRateOf(terms), date: on.value },
      whole(held),
    )
    if (!registered.ok) {
      setSaving({ type: "failed", error: registered.error })
      return
    }
    toast({ title: "開始残高を登録しました", description: `${parlorNameText(seal.parlor(parlor.name))} ${amountText(seal.savings(held))}${USUAL[game()].unit}` })
    app.wrote()
    props.onDone()
  }
  return (
    <Withheld kind="savings">
      <form autocomplete="off"
        class="flex flex-col gap-3 rounded-lg bg-surface-1 p-3 lg:w-2/3"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <h2 class="text-sm font-bold text-text-primary">開始残高の登録</h2>
        <p class="text-xs text-text-muted">帳簿をつけ始める前から持っていた貯玉・貯メダルです。収支には入りません。</p>
        <div class="flex flex-col gap-1.5">
          <Combobox
            label="店舗"
            placeholder="店舗を選ぶ"
            options={offers().map((offer) => ({ value: identityKey(offer.parlor.identity), label: parlorChoiceText(seal.parlor(offer.parlor.name)), note: offer.note, foundFirst: offer.unplaced !== undefined }))}
            value={parlorKey() === "" ? undefined : parlorKey()}
            onChange={(key) => setParlorKey(key ?? "")}
            matches={(key, text) => offerOf().get(key)?.matches(text) ?? false}
            invalid={typedOnly() || missing("parlor")}
            onFocus={nudge.settle}
            onTyped={setTyped}
          />
          <Show when={((found) => (found?.ok === false ? found.error : undefined))(here())} keyed>
            {(error) => <p class="text-xs text-text-muted">{locateFailedText(error)}</p>}
          </Show>
          <Show when={typedOnly()}>
            <p role="alert" class="text-xs text-negative">
              {typedParlorRefused("registering")}
            </p>
          </Show>
        </div>
        <ToggleGroup
          value={game()}
          onChange={(value: string | null) => {
            if ((value === "pachinko" || value === "pachislot") && value !== game()) play(value)
          }}
          aria-label="種別"
        >
          <ToggleGroupItem value="pachinko">貯玉</ToggleGroupItem>
          <ToggleGroupItem value="pachislot">貯メダル</ToggleGroupItem>
        </ToggleGroup>
        <div class="grid grid-cols-4 items-end gap-1.5">
          <TextField label="貸(千円)" value={rental()} onChange={setRental} inputMode="numeric" suffix={USUAL[game()].unit} invalid={missing("rental")} onFocus={nudge.settle} compact />
          <TextField label="交換(100円)" value={exchange()} onChange={setExchange} inputMode="decimal" suffix={USUAL[game()].unit} invalid={missing("exchange")} onFocus={nudge.settle} compact />
          <div class="col-span-2">
            <TextField label="残高" value={tokens()} onChange={setTokens} inputMode="numeric" suffix={USUAL[game()].unit} invalid={missing("tokens")} onFocus={nudge.settle} compact />
          </div>
        </div>
        <div class="w-48">
          <TextField label="日付" type="date" value={date()} onChange={setDate} invalid={missing("date")} onFocus={nudge.settle} />
        </div>
        <Failure saving={saving()} />
        <div class="flex gap-2">
          <Button type="submit">{saving().type === "saving" ? "登録中…" : "登録する"}</Button>
          <Button variant="ghost" onClick={() => props.onDone()}>
            やめる
          </Button>
        </div>
      </form>
    </Withheld>
  )
}

/**
 * Putting one pool's savings right: what the parlor says is there, and the
 * day it said so. The difference from what the book has by that day is
 * written on it; a book that already has the count is left alone.
 */
export function BalanceAdjustmentForm(props: {
  readonly bookId: BookId
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly unit: string
  readonly held: Decimal
  readonly onDone: () => void
}): JSX.Element {
  const app = useApp()
  const [actual, setActual] = createSignal(toPlainString(props.held))
  const [date, setDate] = createSignal<string>(app.services.businessDay())
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const save = async (): Promise<void> => {
    settleTyping()
    const count = countOf(actual())
    const on = parseIsoDate(date())
    if (saving().type === "saving") return
    if (count === undefined || !on.ok) {
      nudge.nudge()
      return
    }
    setSaving({ type: "saving" })
    const adjusted = await adjustBalance(app.services.session, props.bookId, props.parlor, props.pool, on.value, whole(count))
    if (!adjusted.ok) {
      setSaving({ type: "failed", error: adjusted.error })
      return
    }
    toast(
      adjusted.value.type === "unchanged"
        ? { title: "帳簿の残高と同じでした", description: "調整は書き込んでいません。" }
        : { title: "残高を調整しました", description: `${parlorNameText(seal.parlor(props.parlor.name))} ${signedAmountText(seal.savings(Number(toPlainString(adjusted.value.difference))))}${props.unit}` },
    )
    app.wrote()
    props.onDone()
  }
  return (
    <Withheld kind="savings">
      <form autocomplete="off"
        class="flex flex-col gap-2 rounded-md border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div class="grid grid-cols-2 items-end gap-1.5">
          <TextField label="実際の残高" value={actual()} onChange={setActual} inputMode="numeric" suffix={props.unit} invalid={nudge.red() && countOf(actual()) === undefined} onFocus={nudge.settle} compact />
          <TextField label="日付" type="date" value={date()} onChange={setDate} invalid={nudge.red() && !parseIsoDate(date()).ok} onFocus={nudge.settle} compact />
        </div>
        <Failure saving={saving()} />
        <div class="flex gap-2">
          <Button type="submit" size="small">
            {saving().type === "saving" ? "調整中…" : "調整する"}
          </Button>
          <Button variant="ghost" size="small" onClick={() => props.onDone()}>
            やめる
          </Button>
        </div>
      </form>
    </Withheld>
  )
}

/**
 * Recording savings exchanged for prizes at one pool, 交換払出: the day,
 * how many tokens were paid out over the counter (払出数), and what the
 * special prizes handed back are worth (特殊景品額). The line under the
 * fields says where the rest goes: the tokens short of a special prize are
 * written as odd prizes at the rental price, in whole yen, and what that
 * leaves against the tokens' worth at the exchange rate as the translation
 * adjustment. Where the
 * special prizes are worth more than the tokens were at the book's rate
 * for the day, a line says so and by how much, as soon as both are typed:
 * a digit mistyped, or a rate that is not the parlor's. Where the odd
 * prizes come to more than ¥1,000, another line says the rate may be off.
 * Either is said and not refused — the person may record it as it is.
 */
export function PrizeExchangeForm(props: {
  readonly bookId: BookId
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly unit: string
  readonly onDone: () => void
}): JSX.Element {
  const app = useApp()
  const [tokens, setTokens] = createSignal("")
  const [prizes, setPrizes] = createSignal("")
  const [date, setDate] = createSignal<string>(app.services.businessDay())
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const exchanged = (): number | undefined => {
    const count = countOf(tokens())
    return count !== undefined && count > 0 ? count : undefined
  }
  /** The book's rate for the pool on the day typed: read again when the day changes, and never because a count was typed. */
  const [rate] = createResource(
    () => ((on) => (on.ok ? ([on.value, app.revision()] as const) : undefined))(parseIsoDate(date())),
    ([on]) => exchangeRateOn(app.services.session, props.bookId, props.parlor, props.pool, on),
  )
  /** What the special prizes are worth beyond what the tokens were, where they took more tokens than were paid out: the odd prizes would be written below nothing. */
  const beyond = (): { readonly rate: Decimal; readonly worth: Decimal; readonly by: Decimal; readonly odd: Decimal } | undefined => {
    const [count, special, found] = [exchanged(), countOf(prizes()), rate()]
    if (count === undefined || special === undefined || found?.ok !== true || found.value === undefined) return undefined
    const odd = exchangedOddPrizes(whole(count), found.value, whole(special), rentalPriceOfTier(props.pool.tier))
    const worth = multiply(whole(count), found.value)
    return isNegative(odd) ? { rate: found.value, worth, by: subtract(whole(special), worth), odd } : undefined
  }
  /** Whether the odd prizes come to more than ¥1,000, the largest step special prizes come in: the book's rate is then likely off the parlor's. Not where there are no special prizes, the tokens going for odd and general prizes alone, as they may. */
  const oddOverStep = (): boolean => {
    const [count, special, found] = [exchanged(), countOf(prizes()), rate()]
    if (count === undefined || special === undefined || special === 0 || found?.ok !== true || found.value === undefined) return false
    return compare(exchangedOddPrizes(whole(count), found.value, whole(special), rentalPriceOfTier(props.pool.tier)), LARGEST_PRIZE_STEP) > 0
  }
  const save = async (): Promise<void> => {
    settleTyping()
    const [count, special, on] = [exchanged(), countOf(prizes()), parseIsoDate(date())]
    if (saving().type === "saving") return
    if (count === undefined || special === undefined || !on.ok) {
      nudge.nudge()
      return
    }
    setSaving({ type: "saving" })
    const recorded = await recordPrizeExchange(app.services.session, props.bookId, { parlor: props.parlor, pool: props.pool, date: on.value, tokens: whole(count), specialPrizes: whole(special) })
    if (!recorded.ok) {
      setSaving({ type: "failed", error: recorded.error })
      return
    }
    toast({ title: "交換払出を記録しました", description: `${parlorNameText(seal.parlor(props.parlor.name))} ${amountText(seal.savings(count))}${props.unit} → 特殊景品 ${formatYen(seal.savings(whole(special)))}` })
    app.wrote()
    props.onDone()
  }
  return (
    <Withheld kind="savings">
      <form autocomplete="off"
        class="flex flex-col gap-2 rounded-md border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div class="w-40">
          <TextField label="日付" type="date" value={date()} onChange={setDate} invalid={nudge.red() && !parseIsoDate(date()).ok} onFocus={nudge.settle} compact />
        </div>
        <div class="grid grid-cols-2 items-end gap-1.5">
          <TextField label="払出数" value={tokens()} onChange={setTokens} inputMode="numeric" suffix={props.unit} invalid={nudge.red() && exchanged() === undefined} onFocus={nudge.settle} compact />
          <TextField label="特殊景品額" value={prizes()} onChange={setPrizes} inputMode="numeric" suffix="円" invalid={nudge.red() && countOf(prizes()) === undefined} onFocus={nudge.settle} compact />
        </div>
        <p class="text-xs text-text-muted">特殊景品に届かなかった分は貸出レートで端玉景品に、交換率との差額は換算調整勘定に記帳します。</p>
        <Show when={beyond()}>
          {(over) => (
            <p role="status" class="text-xs text-warning">
              特殊景品額が、払出数の評価額 {formatYen(seal.savings(over().worth))}（交換率 {formatRate(over().rate)}）を {formatYen(seal.savings(over().by))} 上回っています。端玉景品は {formatYen(seal.savings(over().odd))} で記帳されます。入力や帳簿の交換率に間違いがないか確かめてください。このまま記録することもできます。
            </p>
          )}
        </Show>
        <Show when={oddOverStep()}>
          <p role="status" class="flex flex-col text-xs text-warning">
            <span>1000円超の端玉景品が出ています。</span>
            <span>レートがズレている可能性があります。</span>
            <span>通帳から交換率を変更できます。</span>
            <span>このままでも記録はできます。</span>
          </p>
        </Show>
        <Failure saving={saving()} />
        <div class="flex gap-2">
          <Button type="submit" size="small">
            {saving().type === "saving" ? "記録中…" : "記録する"}
          </Button>
          <Button variant="ghost" size="small" onClick={() => props.onDone()}>
            やめる
          </Button>
        </div>
      </form>
    </Withheld>
  )
}

/**
 * Recording savings a parlor took back from one pool, 失効: the day,
 * and how many tokens went — all the pool holds, until the person says
 * fewer, a membership withdrawn or savings lapsed taking the lot. The
 * line under the fields says what it is to the book: a loss in the
 * results of its day, and no tally's.
 */
export function ForfeitureForm(props: {
  readonly bookId: BookId
  readonly parlor: Parlor
  readonly pool: SavingsPool
  readonly unit: string
  readonly held: Decimal
  readonly onDone: () => void
}): JSX.Element {
  const app = useApp()
  const [tokens, setTokens] = createSignal(toPlainString(props.held))
  const [date, setDate] = createSignal<string>(app.services.businessDay())
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const forfeited = (): number | undefined => {
    const count = countOf(tokens())
    return count !== undefined && count > 0 ? count : undefined
  }
  const save = async (): Promise<void> => {
    settleTyping()
    const [count, on] = [forfeited(), parseIsoDate(date())]
    if (saving().type === "saving") return
    if (count === undefined || !on.ok) {
      nudge.nudge()
      return
    }
    setSaving({ type: "saving" })
    const recorded = await recordForfeiture(app.services.session, props.bookId, { parlor: props.parlor, pool: props.pool, date: on.value, tokens: whole(count) })
    if (!recorded.ok) {
      setSaving({ type: "failed", error: recorded.error })
      return
    }
    toast({ title: "失効を記録しました", description: `${parlorNameText(seal.parlor(props.parlor.name))} ${amountText(seal.savings(count))}${props.unit}` })
    app.wrote()
    props.onDone()
  }
  return (
    <Withheld kind="savings">
      <form autocomplete="off"
        class="flex flex-col gap-2 rounded-md border border-border p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div class="grid grid-cols-2 items-end gap-1.5">
          <TextField label="失効した数" value={tokens()} onChange={setTokens} inputMode="numeric" suffix={props.unit} invalid={nudge.red() && forfeited() === undefined} onFocus={nudge.settle} compact />
          <TextField label="日付" type="date" value={date()} onChange={setDate} invalid={nudge.red() && !parseIsoDate(date()).ok} onFocus={nudge.settle} compact />
        </div>
        <p class="text-xs text-text-muted">期限切れや会員資格の取り消しで、店に戻った貯玉・貯メダルです。その日の交換率で、収支とは別のその他損益（失効損）になります。稼働にはなりません。</p>
        <Failure saving={saving()} />
        <div class="flex gap-2">
          <Button type="submit" size="small">
            {saving().type === "saving" ? "記録中…" : "記録する"}
          </Button>
          <Button variant="ghost" size="small" onClick={() => props.onDone()}>
            やめる
          </Button>
        </div>
      </form>
    </Withheld>
  )
}

/** The game whose tokens a pool keeps: what its exchange is stated in. */
const GAME_OF: Readonly<Record<SavingsPool["kind"], PlayGameKind>> = { ball: "pachinko", medal: "pachislot" }

/**
 * Setting one pool's exchange rate from a day: the day, and the tokens
 * ¥100 is exchanged for, begun as the rate the pool has now. The savings
 * are valued at it from that day on; nothing else is written.
 */
export function RateChangeForm(props: {
  readonly bookId: BookId
  readonly parlorName: string
  readonly pool: SavingsPool
  readonly unit: string
  readonly current: Decimal | undefined
  readonly onDone: () => void
}): JSX.Element {
  const app = useApp()
  const game = (): PlayGameKind => GAME_OF[props.pool.kind]
  const [exchange, setExchange] = createSignal(props.current === undefined ? "" : statedExchangeOfRate(game(), props.current))
  const [date, setDate] = createSignal<string>(app.services.businessDay())
  const [saving, setSaving] = createSignal<Saving>({ type: "typing" })
  const nudge = createNudge()
  const stated = (): PlayTerms["exchange"] | undefined => exchangeOfStated(game(), tidyTyped(exchange()).replaceAll(",", ""))
  const save = async (): Promise<void> => {
    settleTyping()
    const [typed, on] = [stated(), parseIsoDate(date())]
    if (saving().type === "saving") return
    if (typed === undefined || !on.ok) {
      nudge.nudge()
      return
    }
    setSaving({ type: "saving" })
    const changed = await changeExchangeRate(app.services.session, props.bookId, { parlorName: props.parlorName, pool: props.pool, date: on.value, rate: exchangeRateOf({ exchange: typed }) })
    if (!changed.ok) {
      setSaving({ type: "failed", error: changed.error })
      return
    }
    toast({ title: "交換率を変更しました", description: `${parlorNameText(seal.parlor(props.parlorName))} ${props.pool.tier} 100円あたり${statedExchangeOfRate(game(), exchangeRateOf({ exchange: typed }))}${props.unit}` })
    app.wrote()
    props.onDone()
  }
  return (
    <form autocomplete="off"
      class="flex flex-col gap-2 rounded-md border border-border p-2"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div class="grid grid-cols-2 items-end gap-1.5">
        <TextField label="変更日" type="date" value={date()} onChange={setDate} invalid={nudge.red() && !parseIsoDate(date()).ok} onFocus={nudge.settle} compact />
        <TextField label="交換(100円)" value={exchange()} onChange={setExchange} inputMode="decimal" suffix={props.unit} invalid={nudge.red() && stated() === undefined} onFocus={nudge.settle} compact />
      </div>
      <p class="text-xs text-text-muted">変更日から、この交換率で貯玉・貯メダルを評価します。</p>
      <Failure saving={saving()} />
      <div class="flex gap-2">
        <Button type="submit" size="small">
          {saving().type === "saving" ? "変更中…" : "変更する"}
        </Button>
        <Button variant="ghost" size="small" onClick={() => props.onDone()}>
          やめる
        </Button>
      </div>
    </form>
  )
}
