import { createSignal, type JSX } from "solid-js"

import { addCheckpoints } from "../../../../application/live-play"
import { jackpotCountingOf, type PachinkoDraft } from "../../../../core/live-play/draft"
import { gaugeSaid, standingBefore, takenOf } from "../../../../core/pachinko/revision"
import type { Checkpoint } from "../../../../core/play-log/checkpoint"
import { tidyTyped } from "../../../../core/text/tidy"
import { useApp } from "../../../context"
import { Button } from "../../../primitives/button"
import { DetailButton } from "../../../primitives/detail-button"
import { settleTyping, TextField } from "../../../primitives/text-field"
import { toast } from "../../../primitives/toast"
import { describeError, describeReadingRefusal } from "../../../wording/errors"

const COUNT = /^\d+$/

/** A count as typed; undefined where none is typed or it is no count. */
const countOf = (text: string): number | undefined => {
  const plain = tidyTyped(text).replaceAll(",", "")
  return COUNT.test(plain) ? Number(plain) : undefined
}

/**
 * The cabinet's own 遊 counter in the middle of a play, behind a small
 * [遊] button: followed on its own as the data counter goes, and shown so,
 * it is typed only where the cabinet shows otherwise — after a 遊タイム ran
 * out without a jackpot — and kept as a line of the play saying so and
 * nothing else. The button is marked while it is followed apart from the
 * data counter.
 */
export function GaugeCorrection(props: { readonly draft: PachinkoDraft; readonly ordered: readonly Checkpoint[]; readonly gaugeNow: number }): JSX.Element {
  const app = useApp()
  const [typed, setTyped] = createSignal("")
  const [wrong, setWrong] = createSignal(false)
  const apart = (): boolean => standingBefore(props.ordered, takenOf(props.ordered).length, jackpotCountingOf(props.draft)).counter !== props.gaugeNow
  const keep = async (): Promise<void> => {
    settleTyping()
    const gauge = countOf(typed())
    if (gauge === undefined || gauge === props.gaugeNow) {
      setWrong(gauge === undefined)
      return
    }
    const made = gaugeSaid(props.ordered, gauge, app.services.now(), jackpotCountingOf(props.draft))
    if (!made.ok) {
      toast({ title: describeReadingRefusal(made.error), tone: "error" })
      return
    }
    const kept = await addCheckpoints(app.services.drafts, props.draft, made.value)
    if (!kept.ok) {
      toast({ title: describeError(kept.error), tone: "error" })
      return
    }
    setTyped("")
    toast({ title: "遊カウンターを直しました", stays: "glance" })
    app.played()
  }
  return (
    <DetailButton says={`遊カウンター（${props.gaugeNow}回転）`} face={<span class="text-base font-bold leading-none">遊</span>} marked={apart()} invalid={wrong()} placement="bottom-end" fitted>
      <div class="w-28">
        <TextField
          label="遊カウンター"
          value={typed()}
          onChange={(text) => {
            setTyped(text)
            setWrong(false)
          }}
          inputMode="numeric"
          suffix="回転"
          placeholder={String(props.gaugeNow)}
          invalid={wrong()}
          compact
        />
      </div>
      <Button variant="secondary" class="h-10 shrink-0 px-3" onClick={() => void keep()}>
        直す
      </Button>
    </DetailButton>
  )
}
