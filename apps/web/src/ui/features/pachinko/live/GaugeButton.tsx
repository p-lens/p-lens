import type { JSX } from "solid-js"

import { DetailButton } from "../../../primitives/detail-button"
import { TextField } from "../../../primitives/text-field"
import { formatCount } from "../../../wording/numbers"

/**
 * The cabinet's own 遊タイム counter, behind a small [遊] button beside the
 * data counter, for a machine with a 遊タイム: few cabinets show it
 * otherwise than the data counter, and only after a 遊タイム ran out
 * without a jackpot. Left empty it is the data counter. The button is
 * marked while a count is typed, or while one said before is still
 * followed — `following`, what the 遊 counter shows by it — so that it is
 * seen to be in effect; that count is what the field shows unfilled.
 */
export function GaugeButton(props: {
  readonly gauge: string
  readonly following: number | undefined
  readonly invalid: boolean
  readonly placement: "top-end" | "bottom-end"
  readonly onGauge: (gauge: string) => void
  readonly onFocus?: () => void
}): JSX.Element {
  const typed = (): boolean => props.gauge.trim() !== ""
  const says = (): string => {
    if (typed()) return `遊カウンター（${props.gauge}回転）`
    return props.following === undefined ? "遊カウンター" : `遊カウンター（${formatCount(props.following)}回転として計算中）`
  }
  return (
    <DetailButton
      says={says()}
      face={<span class="text-base font-bold leading-none">遊</span>}
      marked={typed() || props.following !== undefined}
      invalid={props.invalid}
      placement={props.placement}
      fitted
      {...(props.onFocus === undefined ? {} : { onOpen: props.onFocus })}
    >
      <div class="w-44">
        <TextField
          label="遊カウンター数（あれば）"
          value={props.gauge}
          onChange={props.onGauge}
          inputMode="numeric"
          suffix="回転"
          placeholder={props.following === undefined ? "" : String(props.following)}
          invalid={props.invalid}
          {...(props.onFocus === undefined ? {} : { onFocus: props.onFocus })}
          compact
        />
      </div>
    </DetailButton>
  )
}
