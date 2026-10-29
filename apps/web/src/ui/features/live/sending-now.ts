import { createSignal } from "solid-js"

import { sendDraft } from "../../../application/sending"
import type { PlayDraft } from "../../../core/live-play/draft"
import type { PlayId } from "../../../core/play/play"
import type { Destination } from "../../../sync/port/destination-store"
import type { Services } from "../../../application/services"
import { toast } from "../../primitives/toast"
import { titleText } from "../../wording/book"
import { SEND_FAILED, SENT, sendFailedText } from "../../wording/sync"
import { sendingPortsOf } from "./sending-ports"

/** The plays being sent, each until its answer comes, whichever list it was pressed in: its plane stays still meanwhile in every list, and a press on it there does nothing more. */
export interface SendingNow {
  readonly busy: (playId: PlayId) => boolean
  readonly send: (draft: PlayDraft, destination: Destination) => Promise<void>
}

export const createSendingNow = (services: Services, played: () => void): SendingNow => {
  const [sending, setSending] = createSignal<ReadonlySet<PlayId>>(new Set())
  const busy = (playId: PlayId): boolean => sending().has(playId)
  const send = async (draft: PlayDraft, destination: Destination): Promise<void> => {
    if (busy(draft.id)) return
    setSending((now) => new Set([...now, draft.id]))
    const sent = await sendDraft(sendingPortsOf(services), draft, destination)
    setSending((now) => new Set([...now].filter((each) => each !== draft.id)))
    if (!sent.ok) {
      toast({ title: SEND_FAILED, description: sendFailedText(sent.error), tone: "error" })
      return
    }
    toast({ title: SENT, description: titleText(destination.title) })
    played()
  }
  return { busy, send }
}
