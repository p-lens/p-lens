import { createSignal, type Accessor, type Setter } from "solid-js"

import type { Chosen } from "../../primitives/choice"

/**
 * Whose plays the room shows, kept for as long as the page is open so
 * that going to a play and back keeps them: those its list is narrowed
 * to, and, apart from them, those its total adds up. Each is members by
 * who they are in the huddle; `undefined` is everyone.
 */
export interface RoomChoices {
  readonly listed: Accessor<Chosen>
  readonly setListed: Setter<Chosen>
  readonly totalled: Accessor<Chosen>
  readonly setTotalled: Setter<Chosen>
}

export const createRoomChoices = (): RoomChoices => {
  const [listed, setListed] = createSignal<Chosen>(undefined)
  const [totalled, setTotalled] = createSignal<Chosen>(undefined)
  return { listed, setListed, totalled, setTotalled }
}
