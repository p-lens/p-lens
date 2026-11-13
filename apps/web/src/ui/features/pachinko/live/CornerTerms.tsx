import { createResource, createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { changeVenue } from "../../../../application/live-play"
import { parlorOf, type PlayDraft, type PlayVenue } from "../../../../core/live-play/draft"
import { poolOf } from "../../../../core/parlor/terms"
import type { ParlorIdentity } from "../../../../core/parlor/parlor"
import { useApp } from "../../../context"
import { useMoves } from "../../../navigation/moves"
import { Button } from "../../../primitives/button"
import { CloseIcon, EditIcon } from "../../../primitives/icons"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping } from "../../../primitives/text-field"
import { describeError } from "../../../wording/errors"
import { chosenParlorOf, choiceOfIdentity, useStartForm, type ParlorChoice } from "../../live/start-form"
import type { ParlorSetting } from "../../live/parlor-setting"
import { createOffered } from "../../parlor-offers/offered"
import { holdsTypedOnly } from "../../../primitives/combobox"
import { readTerms, termsFormOf, type TermsField } from "../../live/start-terms"
import { Terms } from "../start/Terms"
import { ParlorField } from "../start/Start"
import { cabinetText } from "../../../wording/cabinet"
import { chosenParlorText, venueText } from "../../../wording/parlor"
import { seal } from "../../../../mummer"
import type { PlayHold } from "../../live/play-hold"

const CHANGE_VENUE = "店舗・レートを変更する"

const CHANGE_CABINET = "台番号・機種を変更する"

/** How a word with a pencil beside it is drawn, the two as one button no taller than the word. */
const PENCILLED = "group flex h-5 items-center gap-1 rounded-[3px] text-xs font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-3.5"

/** The same word where nothing of it can be changed, a play another device holds: as high, and with no pencil. */
const UNPENCILLED = "flex h-5 items-center text-xs font-bold text-text-primary"

/** Whether a choice in the start form names the parlor a play is at. */
const choosesAt = (choice: ParlorChoice, at: ParlorIdentity): boolean => {
  const named = choiceOfIdentity(at)
  return named.type === "listed" ? choice.type === "listed" && choice.id === named.id : named.type === "submitted" && choice.type === "submitted" && choice.submission === named.submission
}

/**
 * Where a play is, set out to be said anew as a play's start says it: its
 * parlor chosen from the list, nearest first where the device says where it
 * is, and its corner's terms under it, a listed parlor chosen putting in
 * what players reported of its corners. It works on the day's parlor
 * setting itself, which the card was opened on with the play's own, so that
 * what is applied is the day's for the next play too; put away under its
 * cross, the setting goes back to `before`. A parlor the list cannot be
 * read for is kept as the play has it while it is left chosen.
 */
function VenueChange(props: { readonly draft: PlayDraft; readonly before: ParlorSetting; readonly onDone: () => void }): JSX.Element {
  const app = useApp()
  const start = useStartForm()
  const offered = createOffered()
  const [here] = createResource(() => app.services.locate())
  const [failure, setFailure] = createSignal<ApplicationError | undefined>(undefined)
  const [parlorTyped, setParlorTyped] = createSignal("")
  const nudge = createNudge()
  const playedAt = parlorOf(props.draft)
  const chosen = (): { readonly identity: ParlorIdentity; readonly name: string } | undefined =>
    chosenParlorOf(start.form().parlor, offered.list(), offered.submissions()) ?? (playedAt !== undefined && choosesAt(start.form().parlor, playedAt.identity) ? playedAt : undefined)
  const typedOnly = (): boolean => holdsTypedOnly(parlorTyped(), chosenParlorText(chosen()?.name))
  const problems = (): readonly TermsField[] => {
    const read = readTerms(start.form().terms.pachinko, "pachinko")
    return read.ok ? [] : read.error
  }
  const putAway = (): void => {
    start.update({ parlor: props.before.parlor, terms: props.before.terms })
    props.onDone()
  }
  const apply = async (): Promise<void> => {
    settleTyping()
    const read = readTerms(start.form().terms.pachinko, "pachinko")
    if (!read.ok) {
      nudge.nudge()
      return
    }
    if (typedOnly()) return
    const at = chosen()
    const venue: PlayVenue = at === undefined ? { type: "none", terms: read.value } : { type: "parlor", parlor: { identity: at.identity, name: at.name, pools: [poolOf("pachinko", read.value)] }, terms: read.value }
    const changed = await changeVenue(app.services.drafts, props.draft, venue)
    if (!changed.ok) {
      setFailure(changed.error)
      return
    }
    props.onDone()
    app.played()
  }
  return (
    <div class="grid animate-[spread_260ms_ease-out]">
      <div class="min-h-0 overflow-hidden">
        <div class="flex flex-col gap-2 rounded-md border border-border p-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-bold text-text-primary">店舗・レートを変更</p>
            <button type="button" onClick={putAway} class="flex size-6 items-center justify-center rounded-[3px] text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring [&_svg]:size-4">
              <CloseIcon label="店舗・レートの変更をやめる" />
            </button>
          </div>
          <ParlorField
            list={offered.list()}
            submissions={offered.submissions()}
            here={here()}
            choice={start.form().parlor}
            surveyUrl={app.services.surveyUrl}
            typedOnly={typedOnly()}
            onTyped={setParlorTyped}
            onChoose={start.chooseParlor}
          />
          <Terms
            form={start.form().terms.pachinko}
            invalid={nudge.red() ? problems() : []}
            onFocus={nudge.settle}
            onChange={(form) => start.update({ terms: { ...start.form().terms, pachinko: form } })}
            asking={undefined}
            corners={start.corners("pachinko").map((tier) => ({ label: tier, onPress: () => start.chooseCorner("pachinko", tier) }))}
          />
          <Show when={failure()} keyed>
            {(error) => (
              <p role="alert" class="text-xs text-negative">
                {describeError(error)}
              </p>
            )}
          </Show>
          <div class="flex justify-end">
            <Button size="small" onClick={() => void apply()}>
              この店舗・レートで計算し直す
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The corner a play is on and its parlor after it (`venueText`), above
 * everything counted from it, in a line no taller than its words, the
 * parlor cut short where the line is too narrow, with a pencil beside it
 * and nothing of its terms: the day's earlier parlor was left chosen as the
 * play began, the terms typed were another corner's, or the person has
 * moved, and nothing below reads right until they are set right. Pressed,
 * the parlor and the terms are set out to be said anew as they are when a
 * play starts (`VenueChange`), in a card that spreads open downwards;
 * applied, the play is counted anew there, and it is the day's for the
 * next play too. A play with no terms says so where its corner would be,
 * and is given some the same way. Across from the corner is the cabinet's
 * number, with its own pencil: it leads to where the cabinet and the
 * machine the play is on are said anew. Between the two the line is
 * empty, and holds what it is given to. A play another device holds has
 * the corner and the cabinet with no pencils.
 */
export function CornerTerms(props: { readonly draft: PlayDraft; readonly hold: PlayHold; readonly between: JSX.Element }): JSX.Element {
  const moves = useMoves()
  const start = useStartForm()
  /** Whether the line stands, or the card is open on the day's parlor setting, `before` being what it was. */
  const [look, setLook] = createSignal<{ readonly type: "standing" } | { readonly type: "changing"; readonly before: ParlorSetting }>({ type: "standing" })
  const open = (): void => {
    const before: ParlorSetting = { parlor: start.form().parlor, terms: start.form().terms }
    const at = parlorOf(props.draft)
    const terms = props.draft.venue.terms
    start.update({ parlor: at === undefined ? { type: "none" } : choiceOfIdentity(at.identity), terms: { ...before.terms, pachinko: terms === undefined ? before.terms.pachinko : termsFormOf(terms, "pachinko") } })
    setLook({ type: "changing", before })
  }
  const changing = (): ParlorSetting | undefined => ((state) => (state.type === "changing" && props.hold.type === "held" ? state.before : undefined))(look())
  const corner = (): string => venueText("pachinko", props.draft.venue.terms, parlorOf(props.draft))
  const cabinet = (): string => cabinetText(props.draft.cabinetNumber === undefined ? undefined : seal.cabinet(props.draft.cabinetNumber))
  return (
    <Show
      when={changing()}
      keyed
      fallback={
        <div class="flex items-center justify-between gap-2">
          <Show when={props.hold.type === "held"} fallback={<span class={`${UNPENCILLED} min-w-0`}><span class="truncate">{corner()}</span></span>}>
            <button type="button" onClick={open} class={`${PENCILLED} min-w-0`}>
              <span class="truncate">{corner()}</span>
              <span class="shrink-0 text-text-secondary group-hover:text-text-primary">
                <EditIcon label={CHANGE_VENUE} />
              </span>
            </button>
          </Show>
          <div class="flex shrink-0">{props.between}</div>
          <Show when={props.hold.type === "held"} fallback={<span class={`${UNPENCILLED} shrink-0`}>{cabinet()}</span>}>
            <button type="button" onClick={() => moves.go({ kind: "live-cabinet", playId: props.draft.id })} class={`${PENCILLED} shrink-0`}>
              {cabinet()}
              <span class="text-text-secondary group-hover:text-text-primary">
                <EditIcon label={CHANGE_CABINET} />
              </span>
            </button>
          </Show>
        </div>
      }
    >
      {(before) => <VenueChange draft={props.draft} before={before} onDone={() => setLook({ type: "standing" })} />}
    </Show>
  )
}
