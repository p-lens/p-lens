import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../../application/errors"
import { reviseCheckpoints } from "../../../../application/live-play"
import type { PlayDraft } from "../../../../core/live-play/draft"
import { seatOf, withSeatRevised, type RevisionRefusal, type Seat } from "../../../../core/pachinko/revision"
import { carriedInOf, withCarriedIn } from "../../../../core/play-log/carried-in"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { tidyTyped } from "../../../../core/text/tidy"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { DetailButton } from "../../../primitives/detail-button"
import { createNudge } from "../../../primitives/nudge"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { describeError } from "../../../wording/errors"
import { describeRevisionRefusal } from "../../../wording/pachinko/play"
import { carriedInShown, readCarriedIn } from "../../live/tokens-in-hand"

/** The seat's counter as typed, each still text. */
type SeatForm = Readonly<Record<keyof Seat, string>>

/** Where setting the seat right is: being typed, being kept, refused, or failed to be kept. */
type Sending =
  | { readonly type: "typing" }
  | { readonly type: "keeping" }
  | { readonly type: "unrevisable"; readonly refusal: RevisionRefusal }
  | { readonly type: "failed"; readonly error: ApplicationError }

const COUNT = /^\d+$/

/** A count as typed, none typed being none; undefined where it is no count. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return plain === "" ? 0 : COUNT.test(plain) ? Number(plain) : undefined
}

const readSeat = (form: SeatForm): Seat | undefined => {
  const [spins, total, jackpots] = [countOf(form.spins), countOf(form.total), countOf(form.jackpots)]
  return spins === undefined || total === undefined || jackpots === undefined ? undefined : { spins, total, jackpots }
}

/**
 * Where the data counter as it was found at the seat is set right: the
 * day's spins, the spins since its last jackpot and the day's jackpots,
 * as they were typed when the play began, and — behind the small detail
 * button — the balls the play was begun with in hand. Saving makes every
 * reading before the first jackpot again, since they count on from here.
 */
export function SeatComposer(props: { readonly draft: PlayDraft; readonly ordered: readonly Checkpoint[]; readonly onDone: () => void }): JSX.Element {
  const app = useApp()
  const found = seatOf(props.ordered)
  const [form, setForm] = createSignal<SeatForm>({ spins: String(found.spins), total: String(found.total), jackpots: String(found.jackpots) })
  const [carriedIn, setCarriedIn] = createSignal(carriedInShown(undefined, carriedInOf(props.ordered)))
  const [sending, setSending] = createSignal<Sending>({ type: "typing" })
  const nudge = createNudge()
  const carriedUnread = (): boolean => readCarriedIn(carriedIn()).type === "unread"
  const change = (changed: Partial<SeatForm>): void => {
    setForm((current) => ({ ...current, ...changed }))
    setSending({ type: "typing" })
  }
  const wrong = (field: keyof Seat): boolean => nudge.red() && countOf(form()[field]) === undefined
  const save = async (): Promise<void> => {
    settleTyping()
    const seat = readSeat(form())
    const carried = readCarriedIn(carriedIn())
    if (sending().type === "keeping") return
    if (seat === undefined || carried.type === "unread") {
      nudge.nudge()
      return
    }
    const made = withSeatRevised(withCarriedIn(props.ordered, carried.type === "count" ? carried.count : undefined), seat)
    if (!made.ok) {
      setSending({ type: "unrevisable", refusal: made.error })
      return
    }
    setSending({ type: "keeping" })
    const kept = await reviseCheckpoints(app.services.drafts, props.draft, made.value)
    if (!kept.ok) {
      setSending({ type: "failed", error: kept.error })
      return
    }
    app.wrote()
    props.onDone()
  }
  return (
    <form autocomplete="off"
      class="flex flex-col gap-2 border-t border-border bg-surface-2 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <p class="text-xs font-bold text-warning">開始時データを修正中</p>
      <div class="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-1.5">
        <TextField label="総回転数" value={form().total} onChange={(total) => change({ total })} inputMode="numeric" invalid={wrong("total")} onFocus={nudge.settle} compact />
        <TextField label="ゲーム数" value={form().spins} onChange={(spins) => change({ spins })} inputMode="numeric" invalid={wrong("spins")} onFocus={nudge.settle} compact />
        <TextField label="大当り数" value={form().jackpots} onChange={(jackpots) => change({ jackpots })} inputMode="numeric" invalid={wrong("jackpots")} onFocus={nudge.settle} compact />
        <DetailButton label="詳細" says={carriedIn() === "" ? "詳細（開始時の持ち玉）" : `詳細（開始時の持ち玉 ${carriedIn()}玉）`} marked={carriedIn() !== ""} invalid={nudge.red() && carriedUnread()} placement="top-end" onOpen={nudge.settle}>
          <div class="min-w-0 flex-1">
            <TextField
              label="開始時の持ち玉"
              value={carriedIn()}
              onChange={(typed) => {
                setCarriedIn(typed)
                setSending({ type: "typing" })
              }}
              inputMode="numeric"
              suffix="玉"
              invalid={nudge.red() && carriedUnread()}
              onFocus={nudge.settle}
              compact
            />
          </div>
        </DetailButton>
      </div>
      <Show when={((current) => (current.type === "unrevisable" ? current.refusal : undefined))(sending())} keyed>
        {(refused) => (
          <p role="alert" class="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-text-primary">
            {describeRevisionRefusal(refused)}
          </p>
        )}
      </Show>
      <Show when={((current) => (current.type === "failed" ? current.error : undefined))(sending())} keyed>
        {(error) => (
          <div role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {describeError(error)}
          </div>
        )}
      </Show>
      <div class="flex justify-end gap-2">
        <Button type="submit" class="h-10 px-4">
          保存
        </Button>
        <Button variant="ghost" class="h-10 px-2" onClick={() => props.onDone()}>
          やめる
        </Button>
      </div>
    </form>
  )
}
