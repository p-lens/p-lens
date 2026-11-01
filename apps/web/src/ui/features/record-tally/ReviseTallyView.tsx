import { createMemo, createResource, createSignal, Match, Show, Switch, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { writtenKeepingTerms } from "../../../application/inference-terms"
import { loadRecordedTally, moveTokenTally, reviseTokenTally, reviseYenTally, type Revising } from "../../../application/revise-tally"
import type { BookId } from "../../../core/book/book"
import type { Outcome } from "../../../application/errors"
import { identityKey, sameIdentity, type Parlor } from "../../../core/parlor/parlor"
import type { RecordedTally } from "../../../core/report/recorded-tally"
import { asideOfTally } from "../../../core/tally/aside"
import type { PlayId } from "../../../core/play/play"
import type { TallyAside, TallyHead, TokenTally } from "../../../core/tally/tally"
import { useApp } from "../../context"
import { seal } from "../../../mummer"
import { Combobox } from "../../primitives/combobox"
import { parlorChoiceText } from "../../wording/parlor"
import { EmptyState, Loaded } from "../../primitives/states"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { ViewHeader } from "../shell/ViewHeader"
import { Withheld } from "../mummer/Withheld"
import { ClockFields } from "./ClockFields"
import { tokenTallyFormOf, playedAsRecordedAt, REVISING } from "./form"
import { TokenTallyEditor } from "./TokenTallyEditor"
import { yenTallyFormOf } from "./yen-tally-form"
import { createOffered } from "../parlor-offers/offered"
import { offersByKey, parlorOffers } from "../parlor-offers/parlor-offers"
import { ParlorListNote } from "../parlor-offers/ParlorListNote"
import { YenTallyEditor } from "./AddTallyView"

/**
 * Setting a recorded tally right, in the form it was recorded with: in
 * tokens at its parlor, counted as its entry counts them, or by its totals
 * in yen. A tally recorded at the wrong parlor is moved to the right one
 * here, its savings going with it; at what rate it was played is not the
 * form's to change. When its play began and finished is asked above the form, as its
 * entry says it, and may be said of a tally that said neither. Saved, its
 * entry is written anew where it stands.
 */
/**
 * A recorded tally in tokens set right, its parlor among what may be: a
 * tally recorded at the wrong parlor, seen too late to change while it was
 * played, is moved to the right one here, and its savings with it.
 */
function TokenTallyRevision(props: {
  readonly bookId: BookId
  readonly playId: PlayId
  readonly context: Revising["context"]
  readonly recorded: Extract<RecordedTally, { readonly type: "token" }>
  readonly offered: ReturnType<typeof createOffered>
  readonly aside: () => TallyAside
  readonly onRevised: () => void
}): JSX.Element {
  const app = useApp()
  const recordedAt = props.recorded.tally.parlor
  const [parlorKey, setParlorKey] = createSignal(identityKey(recordedAt.identity))
  const offers = createMemo(() => parlorOffers(props.context.parlors, props.offered.list(), props.offered.submissions(), undefined))
  const offerOf = createMemo(() => offersByKey(offers()))
  const parlor = (): Parlor => offerOf().get(parlorKey())?.parlor ?? recordedAt
  const at = createMemo(() => playedAsRecordedAt(props.recorded.tally, parlor(), props.context.prices))
  const submit = (tally: TokenTally): Promise<Outcome<unknown>> => {
    const rate = at().exchangeRateOn(tally.date)
    return rate === undefined || sameIdentity(tally.parlor.identity, recordedAt.identity)
      ? reviseTokenTally(app.services.session, props.bookId, tally)
      : moveTokenTally(app.services.session, props.bookId, tally, rate)
  }
  return (
    <>
      <div class="flex max-w-md flex-col gap-1.5 px-4 pt-4">
        <Combobox
          label="店舗"
          placeholder="店舗を選ぶ"
          options={offers().map((offer) => ({ value: identityKey(offer.parlor.identity), label: parlorChoiceText(seal.parlor(offer.parlor.name)), note: offer.note }))}
          value={parlorKey()}
          onChange={(key) => setParlorKey(key ?? identityKey(recordedAt.identity))}
          matches={(key, typed) => offerOf().get(key)?.matches(typed) ?? false}
        />
        <p class="text-xs text-text-muted">店舗を直すと、この収支の貯玉も直した店舗へ移ります。</p>
      </div>
      <TokenTallyEditor context={props.context} at={at()} initial={tokenTallyFormOf(props.recorded.tally)} playId={props.playId} aside={props.aside} words={REVISING} submit={submit} onRecorded={props.onRevised} />
    </>
  )
}

export function ReviseTallyView(props: { readonly place: Place; readonly bookId: BookId; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const offered = createOffered()
  const [revising] = createResource(
    () => ({ bookId: props.bookId, playId: props.playId }),
    (source) => loadRecordedTally(app.services.session, source.bookId, app.services.member, source.playId),
  )
  const revised = (): void => {
    app.wrote()
    toast({ title: "収支を修正しました" })
    moves.go({ kind: "tally", bookId: props.bookId, playId: props.playId })
  }
  return (
    <MainContent header={<ViewHeader place={props.place} title="収支の修正" />}>
      <Withheld kind="tally">
        <div class="max-w-5xl">
          <ParlorListNote failure={offered.failure()} age={offered.age()} />
          <Loaded outcome={revising()}>
            {(found) => {
              const tally: TallyHead = found.recorded.tally
              const [clock, setClock] = createSignal(tally.clock)
              const aside = (): TallyAside => ({ ...asideOfTally(tally), clock: clock() })
              return (
                <Show when={found.context.canWrite} fallback={<EmptyState title="この帳簿は閲覧のみです">修正するには、帳簿の所有者から編集者の権限を受け取ってください。</EmptyState>}>
                  <ClockFields clock={clock()} onChange={setClock} />
                  <Switch>
                    <Match when={found.recorded.type === "token" && found.recorded} keyed>
                      {(recorded) => (
                        <TokenTallyRevision bookId={props.bookId} playId={props.playId} context={found.context} recorded={recorded} offered={offered} aside={aside} onRevised={revised} />
                      )}
                    </Match>
                    <Match when={found.recorded.type === "yen" && found.recorded} keyed>
                      {(recorded) => (
                        <YenTallyEditor
                          context={found.context}
                          list={offered.list()}
                          submissions={offered.submissions()}
                          bookId={props.bookId}
                          initial={yenTallyFormOf(recorded.tally, found.context.inferenceTerms)}
                          playIdOn={() => props.playId}
                          aside={aside()}
                          words={REVISING}
                          submit={(tally, used) => writtenKeepingTerms(app.services.session, props.bookId, reviseYenTally(app.services.session, props.bookId, tally), used)}
                          onRecorded={revised}
                        />
                      )}
                    </Match>
                  </Switch>
                </Show>
              )
            }}
          </Loaded>
        </div>
      </Withheld>
    </MainContent>
  )
}
