import { createMemo, createResource, createSignal, type Accessor } from "solid-js"

import type { RecordingContext } from "../../../application/record-tally"
import type { Parlor } from "../../../core/parlor/parlor"
import type { ParlorList } from "../../../core/parlor/shared"
import type { PlayGameKind } from "../../../core/play/play"
import { useApp } from "../../context"
import { holdsTypedOnly } from "../../primitives/combobox"
import { toast } from "../../primitives/toast"
import type { Submission as KeptSubmission } from "../../../parlors/port/submission-store"
import { offersByKey, parlorOffers, type ParlorOffer } from "../parlor-offers/parlor-offers"
import { locateAddress, submitAddress } from "./submission-return"
import { chosenParlorText } from "../../wording/parlor"
import type { LocateError } from "../../../location/port/locator"
import { leaveFor } from "../../primitives/leaving"
import { SURVEY_OFFLINE } from "../../wording/parlor"

/** The parlor a play started at none may still be said to have been at as it is recorded, chosen as a play started live chooses one. */
export interface ParlorChoice {
  readonly key: Accessor<string>
  readonly choose: (key: string) => void
  /** The parlor chosen, where one is. */
  readonly chosen: Accessor<Parlor | undefined>
  readonly offers: Accessor<readonly ParlorOffer[]>
  readonly offerOf: Accessor<ReadonlyMap<string, ParlorOffer>>
  readonly setTyped: (typed: string) => void
  /** Whether the field holds a name that was typed and chose no parlor: nothing is recorded on it. */
  readonly typedOnly: () => boolean
  readonly locating: () => string | undefined
  /** Why the parlors are not offered nearest first, where the device would not or could not say where it is. */
  readonly locateFailure: () => LocateError | undefined
  readonly submitParlor: () => void
}

/**
 * The parlor a play started at none is recorded at, chosen and never typed
 * — from the parlor list, the book's own parlors and this device's
 * submissions, nearest first where the device says where it is — or none.
 */
export const createParlorChoice = (given: {
  readonly context: RecordingContext
  /** The parlor list and this device's submissions, as they are read: with the book's own parlors, all a play may be said to be at. */
  readonly list: Accessor<ParlorList>
  readonly submissions: Accessor<readonly KeptSubmission[]>
  readonly gameKind: PlayGameKind
}): ParlorChoice => {
  const app = useApp()
  const [key, choose] = createSignal("")
  const [here] = createResource(() => app.services.locate())
  const offers = createMemo(() => {
    const found = here()
    return parlorOffers(given.context.parlors, given.list(), given.submissions(), found?.ok === true ? found.value : undefined)
  })
  const offerOf = createMemo(() => offersByKey(offers()))
  const chosen = createMemo(() => offerOf().get(key())?.parlor)
  const [typed, setTyped] = createSignal("")
  /** Where to report the chosen parlor's position, where the list has it without one and there is a survey to report it at. */
  const locating = (): string | undefined => {
    const unplaced = offerOf().get(key())?.unplaced
    return unplaced === undefined || app.services.surveyUrl === undefined ? undefined : locateAddress(app.services.surveyUrl, window.location.origin, { type: "start", game: given.gameKind }, unplaced)
  }
  /** Off to survey.p-lens.jp to submit a parlor the list lacks; a build that names no survey says so instead of going nowhere. */
  const submitParlor = (): void => {
    if (app.services.surveyUrl === undefined) {
      toast({ title: "店舗の申請はまだ準備中です", description: "一覧にない店舗は、店舗を指定せずに記録できます。" })
      return
    }
    leaveFor(submitAddress(app.services.surveyUrl, window.location.origin, { type: "start", game: given.gameKind }), SURVEY_OFFLINE)
  }
  return {
    key,
    choose,
    chosen,
    offers,
    offerOf,
    setTyped,
    typedOnly: () => holdsTypedOnly(typed(), chosenParlorText(chosen()?.name)),
    locating,
    locateFailure: () => ((found) => (found?.ok === false ? found.error : undefined))(here()),
    submitParlor,
  }
}
