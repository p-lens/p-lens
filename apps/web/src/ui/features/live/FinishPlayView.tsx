import { createResource, createSignal, Show, type Accessor, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { keepOwn, takeSentAgain } from "../../../application/inbox"
import { chooseBook, finishPlay, finishPlayInYen, loadFinishing } from "../../../application/live-play"
import * as PachislotUseCases from "../../../application/pachislot/weighing"
import type * as PachislotEngine from "../../../pachislot-engine/client/client"
import type { BookId, ListedBook } from "../../../core/book/book"
import { keptSpinPerformance } from "../../../core/tally/aside"
import type { TallyAside, TokenTally, YenTally } from "../../../core/tally/tally"
import type { ParlorList } from "../../../core/parlor/shared"
import type { Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import type { PlayId } from "../../../core/play/play"
import * as Pachinko from "../../../core/pachinko"
import { senderOf, type PlayDraft } from "../../../core/live-play/draft"
import { parsePlayLog, type Checkpoint } from "../../../core/play-log/checkpoint"
import { finishCounterOf, finishedBy, lastWrittenAt, PLAYED_ON_FOR, type FinishCounter } from "../../../core/play-log/finish"
import { liveSummary } from "../../../core/play-log/live"
import { carriedInOf } from "../../../core/play-log/carried-in"
import { inPlayOrder } from "../../../core/play-log/performance"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { Select } from "../../primitives/select"
import { Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { TimeField, type TimeOfDay } from "../../primitives/time-field"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { createOffered } from "../parlor-offers/offered"
import { bookTitle } from "../../wording/book"
import { ViewHeader } from "../shell/ViewHeader"
import { RECORDING, RECORDING_AGAIN, type PlayedSoFar, type SubmitWords } from "./finish-tally-reading"
import { finishTokenTallyFormOf, playedOnTerms, type PlayedOnTerms } from "./finish-token-tally-form"
import { finishYenTallyFormOf } from "./finish-yen-tally-form"
import { FinishTokenTallyEditor } from "./FinishTokenTallyEditor"
import { FinishYenTallyEditor } from "./FinishYenTallyEditor"
import { counterStands, finishFormOf, readFinishForm, timeOf, type FinishForm } from "./finish-form"
import { OperationHistory } from "./OperationHistory"
import { createParlorChoice } from "./parlor-choice"
import { ParlorChoiceField } from "./ParlorChoiceField"
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
  if (!parsed.ok) return { outlay: undefined, replay: undefined, carriedIn: undefined, held: undefined, theoreticalValue: undefined, spinPerformance: undefined }
  const ordered = inPlayOrder(parsed.value)
  const summary = liveSummary(ordered)
  const replay = ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay
  const carriedIn = carriedInOf(ordered)
  if (draft.gameKind === "slot") return { outlay: summary.outlay, replay, carriedIn, held: ordered.at(-1)?.held, theoreticalValue: await pachislotValueOf(engine, draft, ordered), spinPerformance: undefined }
  const terms = draft.venue.terms
  const held = terms === undefined ? ordered.at(-1)?.held : Pachinko.heldAtFinishOf(ordered, terms)
  const theoretical =
    draft.pachinko === undefined || terms === undefined ? undefined : Pachinko.playTheoreticalValue(draft.pachinko.figures, terms, Pachinko.consumptionOf(ordered, terms))
  return { outlay: summary.outlay, replay, carriedIn, held, theoreticalValue: theoretical?.theoreticalValue, spinPerformance: terms === undefined ? undefined : Pachinko.measuredSpinPerformance(ordered, terms) }
}

const COUNTER_LABELS: Readonly<Record<PlayDraft["gameKind"], string>> = { pachinko: "終了時回転数", slot: "終了時ゲーム数" }

/**
 * When the play began and how it finished, above the form it is recorded
 * with: at what time it began — when it was started, unless set
 * otherwise, which is written beside the play and changes nothing of its
 * log — at what time it finished — now, unless set otherwise; the day
 * follows from when the play began — and what its counter stood at, as it
 * was last read unless the play went on past that.
 */
function StartAndFinishFields(props: {
  readonly start: TimeOfDay
  readonly onStart: (time: TimeOfDay) => void
  readonly form: FinishForm
  readonly read: FinishCounter | undefined
  readonly gameKind: PlayDraft["gameKind"]
  readonly onChange: (form: FinishForm) => void
}): JSX.Element {
  return (
    <div class="grid grid-cols-[6rem_6rem_7.5rem] gap-x-3 px-4 pt-4">
      <TimeField label="開始時刻" value={props.start} onChange={props.onStart} />
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

/** The form as a play recorded before is about to be recorded again: finished when it was said to have finished then, on the counter given then where one was. A play not yet recorded finishes now, or — left unrecorded a while — so long after its last line and no later. */
const finishedAs = (draft: PlayDraft, now: string, read: FinishCounter | undefined): FinishForm => {
  const form = finishFormOf(draft.recorded?.finish.at ?? finishedBy(now, lastWrittenAt(draft.log), draft.received === undefined ? PLAYED_ON_FOR.own : PLAYED_ON_FOR.received), read)
  return draft.recorded?.finish.counter === undefined ? form : { ...form, counter: String(draft.recorded.finish.counter) }
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
 * A play started at no parlor, as it is recorded: the parlor it may still
 * be said to have been at is chosen above the form, and the form follows
 * from it. A play with terms at a parlor chosen is recorded there as one
 * started there is, in tokens, drawing on that parlor's savings whatever
 * they hold; any other is recorded in yen, drawing on savings the book does
 * not keep.
 */
function AtNoParlor(props: {
  readonly draft: PlayDraft
  readonly played: PlayedSoFar
  readonly context: RecordingContext
  readonly list: Accessor<ParlorList>
  readonly submissions: Accessor<readonly KeptSubmission[]>
  readonly aside: () => TallyAside
  readonly words: SubmitWords
  readonly recordInTokens: (tally: TokenTally) => Promise<Outcome<unknown>>
  readonly recordInYen: (tally: YenTally) => Promise<Outcome<unknown>>
  readonly onRecordedInTokens: (tally: TokenTally) => void
  readonly onRecordedInYen: (tally: YenTally, held: number | undefined) => void
}): JSX.Element {
  const parlor = createParlorChoice({ context: props.context, list: props.list, submissions: props.submissions, gameKind: props.draft.gameKind })
  const terms = props.draft.venue.terms
  const atParlor = (): PlayedOnTerms | undefined => ((chosen) => (chosen === undefined || terms === undefined ? undefined : playedOnTerms(chosen, terms, props.draft.gameKind)))(parlor.chosen())
  return (
    <>
      <div class="px-4 pt-4">
        <ParlorChoiceField parlor={parlor} />
      </div>
      <Show
        when={atParlor()}
        keyed
        fallback={
          <FinishYenTallyEditor
            initial={finishYenTallyFormOf(props.draft, props.played)}
            gameKind={props.draft.gameKind}
            terms={terms}
            parlor={parlor}
            playId={props.draft.id}
            aside={props.aside}
            words={props.words}
            submit={props.recordInYen}
            onRecorded={props.onRecordedInYen}
          />
        }
      >
        {(at) => (
          <FinishTokenTallyEditor
            context={props.context}
            at={at}
            namesPlace={false}
            initial={finishTokenTallyFormOf(props.draft, props.played)}
            playId={props.draft.id}
            aside={props.aside}
            words={props.words}
            submit={props.recordInTokens}
            onRecorded={props.onRecordedInTokens}
          />
        )}
      </Show>
    </>
  )
}

/**
 * Recording a play that was followed live into a book, which is when a book
 * first hears of it: the book asked for where there is more than one, the
 * form filled in from the play — in tokens at its parlor, or by its totals
 * in yen when it had none — its log written beside the entry and finished at the
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
            const read = finishCounterOf(draft.log, draft.gameKind)
            const [finish, setFinish] = createSignal(finishedAs(draft, app.services.now(), read))
            const [start, setStart] = createSignal<TimeOfDay>(timeOf(draft.startedAt))
            const aside = (): TallyAside => ({
              clock: { started: start(), finished: finish().time },
              spinPerformance: played.spinPerformance === undefined ? undefined : keptSpinPerformance(played.spinPerformance),
              sender: senderOf(draft),
            })
            const words = draft.recorded === undefined ? RECORDING : RECORDING_AGAIN
            /** Keeps what the play left in hand for the day's next at its place; a play someone sent left its tokens with them. */
            const keepInHand = (left: TokensLeft | undefined): void => {
              if (draft.received !== undefined || left === undefined) return
              app.services.preferences.setTokensInHand(tokensKeptAfter(app.services.preferences.tokensInHand(), app.services.businessDay(), { id: draft.id, recordedBefore: draft.recorded !== undefined }, left))
            }
            const recorded = (playId: PlayId): void => {
              app.wrote()
              moves.go({ kind: "tally", bookId, playId })
            }
            return (
              <>
                <Show when={draft.received} keyed>
                  {(received) => <Arrived draft={draft} sender={received.sender} />}
                </Show>
                <BookField draft={draft} bookId={bookId} books={books} />
                <StartAndFinishFields start={start()} onStart={setStart} form={finish()} read={read} gameKind={draft.gameKind} onChange={setFinish} />
              <Show
                when={draft.venue.type === "parlor" ? draft.venue : undefined}
                keyed
                fallback={
                  <AtNoParlor
                    draft={draft}
                    played={played}
                    context={context}
                    list={offered.list}
                    submissions={offered.submissions}
                    aside={aside}
                    words={words}
                    recordInTokens={(record) => finishPlay(app.services.session, app.services.drafts, draft, bookId, record, readFinishForm(finish(), draft.startedAt), app.services.now())}
                    recordInYen={(play) => finishPlayInYen(app.services.session, app.services.drafts, draft, bookId, play, readFinishForm(finish(), draft.startedAt), app.services.now())}
                    onRecordedInTokens={(record) => {
                      keepInHand(leftBy(record))
                      recorded(record.id)
                    }}
                    onRecordedInYen={(play, held) => {
                      if (held !== undefined) keepInHand(leftAt(draft.venue, draft.gameKind, play.date, held))
                      recorded(play.id)
                    }}
                  />
                }
              >
                {(venue) => (
                  <FinishTokenTallyEditor
                    context={context}
                    at={playedOnTerms(venue.parlor, venue.terms, draft.gameKind)}
                    namesPlace
                    initial={finishTokenTallyFormOf(draft, played)}
                    playId={draft.id}
                    aside={aside}
                    words={words}
                    submit={(record) => finishPlay(app.services.session, app.services.drafts, draft, bookId, record, readFinishForm(finish(), draft.startedAt), app.services.now())}
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
