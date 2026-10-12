import { createResource, createSignal, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { keepOwn, takeSentAgain } from "../../../application/inbox"
import { chooseBook, finishPlay, finishTalliedPlay, loadFinishing } from "../../../application/live-play"
import * as PachislotUseCases from "../../../application/pachislot/weighing"
import type * as PachislotEngine from "../../../pachislot-engine/client/client"
import type { BookId, ListedBook } from "../../../core/book/book"
import type { PlayId } from "../../../core/play/play"
import * as Pachinko from "../../../core/pachinko"
import { type PlayDraft } from "../../../core/live-play/draft"
import { parsePlayLog, type Checkpoint } from "../../../core/play-log/checkpoint"
import { endCounterOf, endedBy, lastWrittenAt, PLAYED_ON_FOR, type EndCounter } from "../../../core/play-log/end"
import { liveSummary } from "../../../core/play-log/live"
import { carriedInOf } from "../../../core/play-log/carried-in"
import { inPlayOrder } from "../../../core/play-log/performance"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Select } from "../../primitives/select"
import { Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { TimeField } from "../../primitives/time-field"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { formFromDraft, playedOnTerms, RECORDING, RECORDING_AGAIN, type PlayedSoFar } from "../record-play/form"
import { RecordForm } from "../record-play/RecordForm"
import { tallyFormFromDraft, tokenCountsFromDraft } from "../record-play/tally-form"
import { createOffered, TallyEditor } from "../record-play/TallyPlayView"
import { bookTitle } from "../../wording/book"
import { ViewHeader } from "../shell/ViewHeader"
import { counterStands, endFormOf, readEndForm, type EndForm } from "./end-form"
import { OperationHistory } from "./OperationHistory"
import { leftAt, leftBy, tokensKeptAfter, type TokensLeft } from "./tokens-in-hand"

/**
 * What a pachislot play's games are worth by its formula: the setting levels
 * inferred from everything its log saw, weighed on its terms. A play that
 * cannot be weighed has none, and is recorded without it.
 */
const pachislotValueOf = async (engine: PachislotEngine.EngineClient, draft: PlayDraft, ordered: readonly Checkpoint[]): Promise<number | undefined> => {
  if (draft.pachislot === undefined) return undefined
  const outlook = await PachislotUseCases.weighPlay(engine, draft.pachislot, ordered, draft.venue.terms)
  return outlook.ok ? outlook.value.theoreticalValue : undefined
}

/** A log that does not read leaves the form to the draft alone. */
const playedOf = async (engine: PachislotEngine.EngineClient, draft: PlayDraft): Promise<PlayedSoFar> => {
  const parsed = parsePlayLog(draft.log)
  if (!parsed.ok) return { outlay: undefined, replay: undefined, carriedIn: undefined, held: undefined, theoreticalValue: undefined }
  const ordered = inPlayOrder(parsed.value)
  const summary = liveSummary(ordered)
  const replay = ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay
  const carriedIn = carriedInOf(ordered)
  if (draft.gameKind === "slot") return { outlay: summary.outlay, replay, carriedIn, held: ordered.at(-1)?.held, theoreticalValue: await pachislotValueOf(engine, draft, ordered) }
  const terms = draft.venue.terms
  const held = terms === undefined ? ordered.at(-1)?.held : Pachinko.heldAtEndOf(ordered, terms)
  const theoretical =
    draft.pachinko === undefined || terms === undefined ? undefined : Pachinko.playTheoreticalValue(draft.pachinko.figures, terms, Pachinko.consumptionOf(ordered, terms))
  return { outlay: summary.outlay, replay, carriedIn, held, theoreticalValue: theoretical?.theoreticalValue }
}

const COUNTER_LABELS: Readonly<Record<PlayDraft["gameKind"], string>> = { pachinko: "終了時回転数", slot: "終了時ゲーム数" }

/**
 * How the play ended, above the form it is recorded with: at what time —
 * now, unless set otherwise; the day follows from when the play began —
 * and what its counter stood at, as it was last
 * read unless the play went on past that.
 */
function EndFields(props: { readonly form: EndForm; readonly read: EndCounter | undefined; readonly gameKind: PlayDraft["gameKind"]; readonly onChange: (form: EndForm) => void }): JSX.Element {
  return (
    <div class="grid grid-cols-[6rem_7.5rem] gap-x-3 px-4 pt-4">
      <TimeField label="終了時刻" value={props.form.time} onChange={(time) => props.onChange({ ...props.form, time })} />
      <TextField
        label={COUNTER_LABELS[props.gameKind]}
        value={props.form.counter}
        onChange={(counter) => props.onChange({ ...props.form, counter })}
        inputMode="numeric"
        error={counterStands(props.form, props.read) ? undefined : `${props.read?.count ?? 0}以上`}
        compact
      />
    </div>
  )
}

/** The form as a play recorded before is about to be recorded again: ended when it was said to have ended then, on the counter given then where one was. A play not yet recorded ends now, or — left unrecorded a while — so long after its last line and no later. */
const endedAs = (draft: PlayDraft, now: string, read: EndCounter | undefined): EndForm => {
  const form = endFormOf(draft.recorded?.end.at ?? endedBy(now, lastWrittenAt(draft.log), draft.received === undefined ? PLAYED_ON_FOR.own : PLAYED_ON_FOR.received), read)
  return draft.recorded?.end.counter === undefined ? form : { ...form, counter: String(draft.recorded.end.counter) }
}

/**
 * The book a play will be recorded into, asked here and nowhere before:
 * the one said for it — chosen here, or the one it was sent to — or else
 * the book in use. Asked only of a person with more than one to write, and
 * fixed once the play is recorded.
 */
function BookField(props: { readonly draft: PlayDraft; readonly bookId: BookId; readonly books: readonly ListedBook[] }): JSX.Element {
  const app = useApp()
  const choose = async (bookId: BookId): Promise<void> => {
    const chosen = await chooseBook(app.services.drafts, props.draft, bookId)
    if (chosen.ok) app.wrote()
  }
  return (
    <Show when={props.draft.recorded === undefined && props.books.length > 1}>
      <div class="px-4 pt-4 sm:max-w-xs">
        <Select
          label="記帳する帳簿"
          options={props.books.map((book) => ({ value: book.id, label: bookTitle(book) }))}
          value={props.bookId}
          onChange={(id) => void choose(id as BookId)}
          placeholder="帳簿を選ぶ"
        />
      </div>
    </Show>
  )
}

/**
 * What stands above the form for a play someone sent: whose it is,
 * everything done to its log, and, where it was sent again after this
 * device had changed it, the choice between the two.
 */
function Arrived(props: { readonly draft: PlayDraft; readonly sender: string | undefined }): JSX.Element {
  const app = useApp()
  const settled = (outcome: { readonly ok: boolean }): void => {
    if (outcome.ok) app.wrote()
  }
  return (
    <>
      <div class="flex flex-col gap-3 px-4 pt-4">
        <p class="text-sm text-text-secondary">{props.sender === undefined ? "届いた稼働" : `${props.sender}さんから届いた稼働`}</p>
        <Show when={props.draft.received?.again !== undefined}>
          <div role="alert" class="flex flex-col gap-2 rounded-md border border-warning/50 bg-surface-1 p-3">
            <p class="text-sm text-text-primary">この稼働の送り直しが届いています。こちらで直した内容と、どちらを使いますか？</p>
            <div class="flex flex-wrap gap-2">
              <Button variant="outline" size="small" onClick={() => void takeSentAgain(app.services.drafts, props.draft).then(settled)}>
                送り直しに差し替える
              </Button>
              <Button variant="outline" size="small" onClick={() => void keepOwn(app.services.drafts, props.draft).then(settled)}>
                このまま使う
              </Button>
            </div>
          </div>
        </Show>
      </div>
      <OperationHistory draft={props.draft} />
    </>
  )
}

/**
 * Recording a play that was followed live into a book, which is when a book
 * first hears of it: the book asked for where there is more than one, the
 * form filled in from the play — in tokens at its parlor, or by its totals
 * in yen when it had none — its log written beside the entry and ended at the
 * moment given here, now unless the person says otherwise, the draft let go
 * of once the book has it.
 */
export function FinishPlayView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const offered = createOffered()
  const [loaded] = createResource(
    () => ({ playId: props.playId, revision: app.revision() }),
    async (source) => {
      const finishing = await loadFinishing(app.services.session, app.services.drafts, source.playId, app.services.member)
      if (!finishing.ok) return finishing
      const played = await playedOf(app.services.pachislot, finishing.value.draft)
      return Ok({ ...finishing.value, played })
    },
  )
  return (
    <MainContent header={<ViewHeader place={props.place} title="収支を記帳" />}>
      <div class="max-w-5xl">
        <Loaded outcome={loaded()}>
          {({ draft, bookId, books, context, played }) => {
            const read = endCounterOf(draft.log, draft.gameKind)
            const [end, setEnd] = createSignal(endedAs(draft, app.services.now(), read))
            const words = draft.recorded === undefined ? RECORDING : RECORDING_AGAIN
            /** Keeps what the play left in hand for the day's next at its place; a play someone sent left its tokens with them. */
            const keepInHand = (left: TokensLeft | undefined): void => {
              if (draft.received !== undefined || left === undefined) return
              app.services.preferences.setTokensInHand(tokensKeptAfter(app.services.preferences.tokensInHand(), app.services.businessDay(), { id: draft.id, recordedBefore: draft.recorded !== undefined }, left))
            }
            const recorded = (playId: PlayId): void => {
              app.wrote()
              moves.go({ kind: "play", bookId, playId })
            }
            return (
              <>
                <Show when={draft.received} keyed>
                  {(received) => <Arrived draft={draft} sender={received.sender} />}
                </Show>
                <BookField draft={draft} bookId={bookId} books={books} />
                <EndFields form={end()} read={read} gameKind={draft.gameKind} onChange={setEnd} />
              <Show
                when={draft.venue.type === "parlor" ? draft.venue : undefined}
                keyed
                fallback={
                  <TallyEditor
                    context={context}
                    list={offered.list()}
                    submissions={offered.submissions()}
                    bookId={undefined}
                    initial={tallyFormFromDraft(draft, played)}
                    playIdOn={() => draft.id}
                    words={words}
                    tokens={tokenCountsFromDraft(draft, played)}
                    submit={(play) => finishTalliedPlay(app.services.session, app.services.drafts, draft, bookId, play, readEndForm(end(), draft.startedAt), app.services.now())}
                    onRecorded={(play, held) => {
                      if (held !== undefined) keepInHand(leftAt(draft.venue, draft.gameKind, play.date, held))
                      recorded(play.id)
                    }}
                  />
                }
              >
                {(venue) => (
                  <RecordForm
                    context={context}
                    at={playedOnTerms(venue.parlor, venue.terms, draft.gameKind)}
                    initial={formFromDraft(draft, played)}
                    playId={draft.id}
                    words={words}
                    submit={(record) => finishPlay(app.services.session, app.services.drafts, draft, bookId, record, readEndForm(end(), draft.startedAt), app.services.now())}
                    onRecorded={(record) => {
                      keepInHand(leftBy(record))
                      recorded(record.id)
                    }}
                  />
                )}
              </Show>
              </>
            )
          }}
        </Loaded>
      </div>
    </MainContent>
  )
}
