import { createSignal, type Accessor, type Setter } from "solid-js"

import type { Chosen } from "../../primitives/choice"

/**
 * Whose plays the room shows, kept for as long as the page is open so
 * that going to a play and back keeps them: those its list is narrowed
 * to, and, apart from them, those its total adds up and settles up. Each
 * is members by who they are in the huddle; `undefined` is everyone. With
 * them, the special prizes each member took home as typed for the
 * settling up, by member, as typed: kept on the page and nowhere else;
 * and whether it is settled in thousands, as it is unless asked, or to
 * the yen.
 */
export interface RoomChoices {
  readonly listed: Accessor<Chosen>
  readonly setListed: Setter<Chosen>
  readonly totalled: Accessor<Chosen>
  readonly setTotalled: Setter<Chosen>
  readonly prizes: Accessor<ReadonlyMap<string, string>>
  readonly setPrizes: Setter<ReadonlyMap<string, string>>
  readonly settling: Accessor<Settling>
  readonly setSettling: Setter<Settling>
}

/** How a huddle is settled up: in thousands, those who came to most holding the odd yen, or to the yen. */
export type Settling = "rounded" | "exact"

export const createRoomChoices = (): RoomChoices => {
  const [listed, setListed] = createSignal<Chosen>(undefined)
  const [totalled, setTotalled] = createSignal<Chosen>(undefined)
  const [prizes, setPrizes] = createSignal<ReadonlyMap<string, string>>(new Map())
  const [settling, setSettling] = createSignal<Settling>("rounded")
  return { listed, setListed, totalled, setTotalled, prizes, setPrizes, settling, setSettling }
}
