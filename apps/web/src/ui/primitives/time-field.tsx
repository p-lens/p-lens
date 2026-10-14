// On Kobalte's time field, on P-Lens's tokens.

import * as TimeFieldPrimitive from "@kobalte/core/time-field"
import type { JSX } from "solid-js"

/** A time of day to the minute, on a 24-hour clock. */
export interface TimeOfDay {
  readonly hour: number
  readonly minute: number
}

/**
 * A labelled time of day: its hour and its minute each a field of their
 * own, typed over or stepped, on a 24-hour clock with nothing of a date
 * about it. A change is told once both hold a number. Its label is words
 * and no more, as every field's is. A field that may be left empty is
 * given `onClear`, told once either part is emptied, and shows its
 * placeholder while its value is none.
 */
export function TimeField(props: {
  readonly label: string
  readonly value: TimeOfDay | undefined
  readonly onChange: (value: TimeOfDay) => void
  readonly onClear?: () => void
}): JSX.Element {
  return (
    <TimeFieldPrimitive.Root
      {...(props.value === undefined ? {} : { value: { hour: props.value.hour, minute: props.value.minute } })}
      onChange={(time) => {
        if (time?.hour !== undefined && time.minute !== undefined) props.onChange({ hour: time.hour, minute: time.minute })
        else props.onClear?.()
      }}
      hourCycle={24}
      granularity="minute"
      forceLeadingZeros
      class="flex flex-col gap-1.5"
    >
      <TimeFieldPrimitive.Label class="text-xs font-bold uppercase tracking-wide text-text-secondary">{props.label}</TimeFieldPrimitive.Label>
      <TimeFieldPrimitive.Input class="flex h-10 items-center rounded-[3px] bg-surface-input px-2 text-text-primary tabular-nums focus-within:outline-2 focus-within:outline-focus-ring">
        {(segment) => (
          <TimeFieldPrimitive.Segment
            segment={segment()}
            class="rounded-[3px] px-1 caret-transparent outline-none focus:bg-accent/30 data-[placeholder]:text-text-muted"
          />
        )}
      </TimeFieldPrimitive.Input>
    </TimeFieldPrimitive.Root>
  )
}
