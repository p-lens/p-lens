import { createResource, Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { writtenKeepingTerms, type TermsUsed } from "../../../application/inference-terms"
import { loadRecordingContext, recordYenTally, type RecordingContext } from "../../../application/record-tally"
import type { BookId } from "../../../core/book/book"
import type { ParlorList } from "../../../core/parlor/shared"
import type { IsoDate } from "../../../core/calendar/calendar"
import { NOTHING_ASIDE } from "../../../core/tally/aside"
import type { TallyAside, YenTally } from "../../../core/tally/tally"
import type { PlayId } from "../../../core/play/play"
import { useApp } from "../../context"
import { EmptyState, Loaded } from "../../primitives/states"
import { enterLeavesField } from "../../primitives/enter-leaves"
import { useMoves } from "../../navigation/moves"
import type { Place } from "../../navigation/place"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { ViewHeader } from "../shell/ViewHeader"
import { Withheld } from "../mummer/Withheld"
import { RECORDING, type SubmitWords } from "./form"
import { createOffered } from "../parlor-offers/offered"
import { createYenTallyEditing } from "./yen-tally-editing"
import { DayAndHours, EntryAndSubmit, GameKindField, MachineField, ParlorField, ResultAndWeighing, SidesFields } from "./YenTallyFields"
import { emptyYenTallyForm, type YenTallyForm } from "./yen-tally-form"

/**
 * The form a tally is typed into a book by hand with, by its totals, added
 * or set right: what it starts filled with, and what recording means, are
 * the caller's.
 */
export function YenTallyEditor(props: {
  readonly context: RecordingContext
  /** The parlor list and this device's submissions: with the book's own parlors, all a tally may be said to be at. */
  readonly list: ParlorList
  readonly submissions: readonly KeptSubmission[]
  /** The book the tally is typed into, which the survey brings the person back to. */
  readonly bookId: BookId
  readonly initial: YenTallyForm
  /** The id of the tally, given the day its play is said to have been played. */
  readonly playIdOn: (date: IsoDate) => PlayId
  /** What is written beside the tally, as its entry says where it is set right; nothing for a tally added. */
  readonly aside: TallyAside
  readonly words: SubmitWords
  /** Record the tally, with the terms of its game as the form says them, for the book to keep. */
  readonly submit: (tally: YenTally, used: TermsUsed | undefined) => Promise<Outcome<unknown>>
  readonly onRecorded: (tally: YenTally) => void
}): JSX.Element {
  const editing = createYenTallyEditing({
    context: props.context,
    list: props.list,
    submissions: props.submissions,
    initial: props.initial,
    playIdOn: props.playIdOn,
    aside: () => props.aside,
    refused: "adding",
    leftFrom: (game) => ({ type: "entry", game, bookId: props.bookId }),
    submit: props.submit,
    onRecorded: props.onRecorded,
  })
  return (
    <form autocomplete="off" class="flex flex-col gap-5 p-4" noValidate onSubmit={(event) => void editing.submit(event)} onKeyDown={enterLeavesField}>
      <div class="flex flex-col gap-5">
        <DayAndHours editing={editing} />
        <ParlorField editing={editing} />
      </div>
      <GameKindField editing={editing} />
      <MachineField editing={editing} />
      <SidesFields editing={editing} />
      <ResultAndWeighing editing={editing} />
      <EntryAndSubmit editing={editing} words={props.words} />
    </form>
  )
}

/**
 * Adding a tally to a book by hand, by its totals: what it made, what it was
 * expected to be worth, and how much of that it earned.
 */
export function AddTallyView(props: { readonly place: Place; readonly bookId: BookId }): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const fresh = app.services.newPlayId()
  const [context] = createResource(
    () => ({ bookId: props.bookId, revision: app.revision() }),
    (source) => loadRecordingContext(app.services.session, source.bookId, app.services.member),
  )
  const offered = createOffered()
  return (
    <MainContent header={<ViewHeader place={props.place} title="収支を追加" />}>
      <Withheld kind="tally">
        <div class="max-w-5xl">
          <Loaded outcome={context()}>
            {(found) => (
              <Show when={found.canWrite} fallback={<EmptyState title="この帳簿は閲覧のみです">記録するには、帳簿の所有者から編集者の権限を受け取ってください。</EmptyState>}>
                <YenTallyEditor
                  context={found}
                  list={offered.list()}
                  submissions={offered.submissions()}
                  bookId={props.bookId}
                  initial={emptyYenTallyForm(app.services.businessDay(), found.inferenceTerms)}
                  playIdOn={(date) => app.services.playIdOn(fresh, date)}
                  aside={NOTHING_ASIDE}
                  words={RECORDING}
                  submit={(tally, used) => writtenKeepingTerms(app.services.session, props.bookId, recordYenTally(app.services.session, props.bookId, tally), used)}
                  onRecorded={(tally) => {
                    app.wrote()
                    moves.go({ kind: "tally", bookId: props.bookId, playId: tally.id })
                  }}
                />
              </Show>
            )}
          </Loaded>
        </div>
      </Withheld>
    </MainContent>
  )
}
