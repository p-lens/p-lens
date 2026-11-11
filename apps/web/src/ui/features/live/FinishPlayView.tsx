import { createMemo, createResource, createSignal, Show, untrack, type Accessor, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { chooseBook, finishPlay, finishPlayInYen, loadFinishing, loadSentFinishing, netCountsAtFinish, recordSentPlay, recordSentPlayInYen, theoreticalValueAtFinish, type Finishing } from "../../../application/live-play"
import type { BookId, ListedBook } from "../../../core/book/book"
import { keptSpinPerformance } from "../../../core/tally/aside"
import type { TallyAside, TokenTally, YenTally } from "../../../core/tally/tally"
import type { ParlorList } from "../../../core/parlor/shared"
import type { Outcome } from "../../../application/errors"
import type { RecordingContext } from "../../../application/record-tally"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import type { PlayId } from "../../../core/play/play"
import type { PlaySender } from "../../../crossing"
import * as Pachinko from "../../../core/pachinko"
import type { PlayDraft } from "../../../core/live-play/draft"
import { parsePlayLog } from "../../../core/play-log/checkpoint"
import { finishCounterOf, finishedBy, lastWrittenAt, PLAYED_ON_FOR, type Finish, type FinishCounter } from "../../../core/play-log/finish"
import { liveSummary } from "../../../core/play-log/live"
import { carriedInOf } from "../../../core/play-log/carried-in"
import { inPlayOrder } from "../../../core/play-log/performance"
import { Ok } from "../../../core/result/result"
import { useApp } from "../../context"
import { Select } from "../../primitives/select"
import { Loaded } from "../../primitives/states"
import { TextField } from "../../primitives/text-field"
import { TimeField, type TimeOfDay } from "../../primitives/time-field"
import { toast } from "../../primitives/toast"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import { createOffered } from "../parlor-offers/offered"
import { bookTitle } from "../../wording/book"
import { ViewHeader } from "../shell/ViewHeader"
import { RECORDING, RECORDING_AGAIN, SEE_IN_BOOK, type PlayedSoFar, type SubmitWords } from "./finish-tally-reading"
import { finishTokenTallyFormOf, playedOnTerms, type PlayedOnTerms } from "./finish-token-tally-form"
import { finishYenTallyFormOf } from "./finish-yen-tally-form"
import { likelyHeldOf } from "../../../core/pachislot/hand"
import { FinishTokenTallyEditor } from "./FinishTokenTallyEditor"
import { FinishYenTallyEditor } from "./FinishYenTallyEditor"
import type { WorthAt } from "./followed-worth"
import { counterStands, finishFormOf, readFinishForm, timeOf, type FinishForm } from "./finish-form"
import { createParlorChoice } from "./parlor-choice"
import { ContinueBar } from "./ContinueBar"
import { createElsewhereHold, type PlayHold } from "./play-hold"
import { ParlorChoiceField } from "./ParlorChoiceField"
import { leftAt, leftBy, tokensKeptAfter, type TokensLeft } from "./tokens-in-hand"

/** A log that does not read leaves the form to the draft alone. What was handed between players is the log's running total at its last. A pachislot play's medals in hand are those counted at its last line, or else what its formula says they likely are by then, to be counted and typed over. */
const playedOf = (draft: PlayDraft): PlayedSoFar => {
  const parsed = parsePlayLog(draft.log)
  if (!parsed.ok) return { outlay: undefined, replay: undefined, carriedIn: undefined, handed: undefined, held: undefined, heldLikely: false, spinPerformance: undefined }
  const ordered = inPlayOrder(parsed.value)
  const summary = liveSummary(ordered)
  const replay = ordered.findLast((checkpoint) => checkpoint.replay !== undefined)?.replay
  const carriedIn = carriedInOf(ordered)
  const handed = ordered.findLast((checkpoint) => checkpoint.handed !== undefined)?.handed
  const terms = draft.venue.terms
  const held = draft.gameKind === "pachislot" ? (draft.pachislot === undefined ? ordered.at(-1)?.held : likelyHeldOf(ordered, draft.pachislot.formula, terms)) : Pachinko.heldAsToldOf(ordered)
  const spinPerformance = draft.gameKind === "pachislot" || terms === undefined ? undefined : Pachinko.measuredSpinPerformance(ordered, terms)
  const heldLikely = draft.gameKind === "pachislot" && held !== undefined && ordered.at(-1)?.held === undefined
  return { outlay: summary.outlay, replay, carriedIn, handed, held, heldLikely, spinPerformance }
}

/** A play as its recording opens, with all its form is filled in from, and who sent it where someone did. */
type Opened = { readonly played: PlayedSoFar; readonly sender: PlaySender | undefined } & Finishing

const COUNTER_LABELS: Readonly<Record<PlayDraft["gameKind"], string>> = { pachinko: "終了時回転数", pachislot: "終了時ゲーム数" }

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
  const form = finishFormOf(draft.recorded?.finish.at ?? finishedBy(now, lastWrittenAt(draft.log), PLAYED_ON_FOR), read)
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
    if (chosen.ok) app.played()
  }
  return (
    <Show when={props.draft.recorded === undefined && props.books.length > 1}>
      <div class="px-4 pt-4 @roomy:max-w-xs">
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
  readonly worthAt: Accessor<WorthAt>
  readonly recordInTokens: (tally: TokenTally) => Promise<Outcome<unknown>>
  readonly recordInYen: (tally: YenTally, held: number | undefined) => Promise<Outcome<unknown>>
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
            heldLikely={props.played.heldLikely}
            gameKind={props.draft.gameKind}
            terms={terms}
            parlor={parlor}
            playId={props.draft.id}
            usedTags={props.context.userTags}
            aside={props.aside}
            words={props.words}
            worthAt={props.worthAt}
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
            heldLikely={props.played.heldLikely}
            playId={props.draft.id}
            aside={props.aside}
            words={props.words}
            worthAt={props.worthAt}
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
 * of once the book has it. A play another of the owner's devices holds is
 * recorded there: here it has, in place of the form, the way to continue
 * it on this device. A play someone sent to one of the owner's books is
 * recorded into that book, as it last came, naming who sent it; nothing of
 * it is kept here, and what was left in hand is the sender's.
 */
export function FinishPlayView(props: { readonly place: Place; readonly playId: PlayId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const offered = createOffered()
  const held = createElsewhereHold(() => props.playId)
  /** The play someone sent, as it came when the form opened: what it comes as afterwards never rebuilds the form under the person. */
  const arrived = (): { readonly draft: PlayDraft; readonly hold: Extract<PlayHold, { readonly type: "arrived" }> } | undefined =>
    ((found) => (found?.hold.type === "arrived" ? { draft: found.draft, hold: found.hold } : undefined))(held())
  /** The play as the form opened on it, read again only as where it is held changes — continued here from another device: what the book or the day's plays become otherwise — a change arriving from another device — never rebuilds the form under the person, nor works it out again. */
  const holding = createMemo((): PlayHold["type"] => held()?.hold.type ?? "held")
  const [loaded] = createResource(
    () => ({ playId: props.playId, holding: holding() }),
    async (source): Promise<Outcome<Opened>> => {
      const sent = source.holding === "arrived" ? untrack(arrived) : undefined
      const finishing =
        sent === undefined ? await loadFinishing(app.services.session, app.services.drafts, source.playId, app.services.member) : await loadSentFinishing(app.services.session, sent.draft, sent.hold.bookId, app.services.member)
      if (!finishing.ok) return finishing
      return Ok({ ...finishing.value, played: playedOf(finishing.value.draft), sender: sent?.hold.sender })
    },
  )
  /** The play another device holds, where this device keeps none of its own to record. */
  const elsewhere = (): Extract<PlayHold, { readonly type: "followed" }> | undefined =>
    ((found, copy) => (found?.ok === false && copy?.hold.type === "followed" ? copy.hold : undefined))(loaded(), held())
  return (
    <MainContent header={<ViewHeader place={props.place} title="収支を記帳" />}>
      <div class="max-w-5xl">
        <Show when={elsewhere()}>
          {(hold) => (
            <div class="p-4">
              <ContinueBar shownAt={hold().shownAt} unreached={hold().unreached} onContinue={() => hold().onContinue()} />
            </div>
          )}
        </Show>
        <Show when={elsewhere() === undefined}>
          <Loaded outcome={loaded()}>
            {(found) => {
              const { draft, bookId, books, context, played, sender } = found
              const read = finishCounterOf(draft.log, draft.gameKind)
              const [finish, setFinish] = createSignal(finishedAs(draft, app.services.now(), read))
              const [start, setStart] = createSignal<TimeOfDay>(timeOf(draft.startedAt))
              const aside = (): TallyAside => ({
                clock: { started: start(), finished: finish().time },
                spinPerformance: played.spinPerformance === undefined ? undefined : keptSpinPerformance(played.spinPerformance),
                sender,
                netCounts: netCountsAtFinish(draft, readFinishForm(finish(), draft.startedAt)),
              })
              const words = draft.recorded === undefined ? RECORDING : RECORDING_AGAIN
              const finished = (): Finish => readFinishForm(finish(), draft.startedAt)
              /** What the play comes to finished as the form above now says, for the tokens in hand the form below says. */
              const worthAt = (): WorthAt => ((at) => (held) => theoreticalValueAtFinish(app.services.pachislot, draft, at, held))(readFinishForm(finish(), draft.startedAt))
              /** Keeps what the play left in hand for the day's next at its place. */
              const keepInHand = (left: TokensLeft | undefined): void => {
                if (left === undefined || sender !== undefined) return
                app.services.preferences.setTokensInHand(tokensKeptAfter(app.services.preferences.tokensInHand(), app.services.businessDay(), { id: draft.id, recordedBefore: draft.recorded !== undefined }, left))
              }
              const recorded = (playId: PlayId): void => {
                app.wrote()
                moves.replace({ kind: "live" })
                toast({ title: words.done, stays: "offer", action: { label: SEE_IN_BOOK, onPress: () => moves.go({ kind: "tally", bookId, playId }) } })
              }
              return (
                <>
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
                      recordInTokens={(record) => (sender === undefined ? finishPlay(app.services.session, app.services.drafts, draft, bookId, record, finished(), app.services.now()) : recordSentPlay(app.services.session, draft, bookId, record, finished()))}
                      recordInYen={(play, inHand) =>
                        sender === undefined ? finishPlayInYen(app.services.session, app.services.drafts, draft, bookId, play, finished(), app.services.now(), inHand) : recordSentPlayInYen(app.services.session, draft, bookId, play, finished(), inHand)
                      }
                      worthAt={worthAt}
                      onRecordedInTokens={(record) => {
                        keepInHand(leftBy(record))
                        recorded(record.id)
                      }}
                      onRecordedInYen={(play, held) => {
                        if (held !== undefined && play.settlement?.type !== "off-book-exchanged") keepInHand(leftAt(draft.venue, draft.gameKind, play.date, held))
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
                      heldLikely={played.heldLikely}
                      playId={draft.id}
                      aside={aside}
                      words={words}
                      worthAt={worthAt}
                      submit={(record) => (sender === undefined ? finishPlay(app.services.session, app.services.drafts, draft, bookId, record, finished(), app.services.now()) : recordSentPlay(app.services.session, draft, bookId, record, finished()))}
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
        </Show>
      </div>
    </MainContent>
  )
}
