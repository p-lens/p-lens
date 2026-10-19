import { createEffect, on, onCleanup, type Accessor } from "solid-js"

import type { Outcome } from "../../../application/errors"
import type { IsoDate } from "../../../core/calendar/calendar"
import type { Holdings } from "../../../core/report/holdings"
import { Ok } from "../../../core/result/result"

/** How many askings what was last shown is kept for: a few books and periods, those looked at lately. */
const KEPT_AT_MOST = 6

/** How long after a book is written its savings are asked again, so that 貯玉・貯メダル opened next finds them as they stand: once the screen written from has its answers. */
const ASK_AGAIN_AFTER = 1500

/**
 * What a screen last showed for each thing it asked, and the way to ask it
 * again: shown at once when the screen is opened again, while it is asked
 * anew, so that it never opens blank on what it showed a moment ago. What
 * could not be answered is not kept.
 */
export interface LastShown<T> {
  readonly kept: (key: string) => Outcome<T> | undefined
  /** Ask, and keep the answer as what was last shown for the key, with the way to ask it again. */
  readonly asked: (key: string, ask: () => Promise<Outcome<T>>) => Promise<Outcome<T>>
  /** Ask everything kept again, one after another, keeping the answers. */
  readonly askAgain: () => Promise<void>
}

/** What a screen last showed, for the few things it asked lately. */
export const createLastShown = <T>(): LastShown<T> => {
  const held = new Map<string, { readonly value: T; readonly ask: () => Promise<Outcome<T>> }>()
  const asked = async (key: string, ask: () => Promise<Outcome<T>>): Promise<Outcome<T>> => {
    const answer = await ask()
    if (!answer.ok) return answer
    held.delete(key)
    held.set(key, { value: answer.value, ask })
    ;[...held.keys()].slice(0, Math.max(0, held.size - KEPT_AT_MOST)).forEach((old) => held.delete(old))
    return answer
  }
  return {
    kept: (key) => ((found) => (found === undefined ? undefined : Ok(found.value)))(held.get(key)),
    asked,
    askAgain: () => [...held].reduce<Promise<void>>((before, [key, { ask }]) => before.then(async () => void (await asked(key, ask))), Promise.resolve()),
  }
}

/** What 貯玉・貯メダル last showed: a book's savings, for a period and the parlors chosen, and the day each parlor's savings last moved. */
export interface SavingsShown {
  readonly holdings: LastShown<Holdings>
  readonly lastMoved: LastShown<ReadonlyMap<string, IsoDate>>
}

/**
 * What 貯玉・貯メダル last showed, asked again a while after each book is
 * written: opened again, it shows that at once and asks behind it, and
 * what it shows a moment after a write is the savings as they stand.
 */
export const savingsShownAfterWrites = (revision: Accessor<number>): SavingsShown => {
  const shown: SavingsShown = { holdings: createLastShown(), lastMoved: createLastShown() }
  const held: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  createEffect(
    on(
      revision,
      () => {
        clearTimeout(held.timer)
        held.timer = setTimeout(() => void shown.holdings.askAgain().then(shown.lastMoved.askAgain), ASK_AGAIN_AFTER)
      },
      { defer: true },
    ),
  )
  onCleanup(() => clearTimeout(held.timer))
  return shown
}
