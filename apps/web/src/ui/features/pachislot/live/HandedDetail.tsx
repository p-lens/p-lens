import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"
import { HANDED_NOTE } from "../../../wording/pachislot/play"
import type { Handing } from "./reading-form"

/**
 * メダルの受渡し behind a reading's small button: medals handed in by
 * other players or handed to them since the reading before, few readings
 * having any. A breakdown of the medals in hand — a count typed is the
 * hand as the cabinet shows it, holding them — which the hand moves by
 * from the next line on where it is not counted again, and kept out of
 * every figure.
 * The sign beside the count says the way they went, and is turned by
 * pressing it.
 */
export function HandedDetail(props: {
  readonly handing: Handing
  readonly handed: string
  readonly invalid: boolean
  readonly onHanded: (change: { readonly handed: string; readonly handing: Handing }) => void
  readonly onFocus: () => void
}): JSX.Element {
  const set = (): boolean => props.handed.trim() !== ""
  const sign = (): string => (props.handing === "given" ? "−" : "＋")
  return (
    <DetailButton label="詳細" says={set() ? `詳細（メダルの受渡し ${sign()}${props.handed}枚）` : "詳細（メダルの受渡し）"} marked={set()} invalid={props.invalid} placement="top-end" onOpen={props.onFocus}>
      <button
        type="button"
        aria-label={props.handing === "received" ? "貰いメダル（押すと渡しメダルに切替）" : "渡しメダル（押すと貰いメダルに切替）"}
        onClick={() => props.onHanded({ handed: props.handed, handing: props.handing === "received" ? "given" : "received" })}
        class="flex h-10 w-7 shrink-0 items-center justify-center rounded-[3px] bg-surface-input text-base font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
      >
        {sign()}
      </button>
      <div class="min-w-0 flex-1">
        <TextField label="メダルの受渡し" value={props.handed} onChange={(handed) => props.onHanded({ handed, handing: props.handing })} inputMode="numeric" suffix="枚" placeholder="0" invalid={props.invalid} onFocus={props.onFocus} note={HANDED_NOTE} compact />
      </div>
    </DetailButton>
  )
}
