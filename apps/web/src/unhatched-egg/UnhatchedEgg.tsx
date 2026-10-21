import { createSignal, onCleanup, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"

import { isOpen, turnOver } from "./hatched"
import { castLook, PRESSED, SAYS, sheetPut } from "./look"
import { stillToGo, turnedOver } from "./words"

/** Presses in a row that open or close the egg. */
const PRESSES = 10

/** The press from which the presses left are counted down. */
const COUNTED_FROM = 7

/** The longest between two presses for them to be in a row, in milliseconds. */
const IN_A_ROW = 1_000

/** How long a press is held to open or close the egg at once, in milliseconds. */
const HELD = 5_000

/** How long what the egg says stays, in milliseconds. */
const SAID_FOR = 1_600

/**
 * What it is given — the version shown under the settings — as it was,
 * and the egg beneath it: ten presses in a row, or one held five seconds, open it, and the
 * same close it again; from the seventh press the presses left are
 * counted down, as Android does. Nothing about it shows until then, and
 * while it is open the screen's edges glow red on every screen, cast over
 * the whole page from here as it turns over (`castLook`).
 */
export function UnhatchedEgg(props: { readonly children: JSX.Element }): JSX.Element {
  const held: { presses: number; lastAt: number; holding: ReturnType<typeof setTimeout> | undefined; heldLong: boolean; saying: ReturnType<typeof setTimeout> | undefined } = {
    presses: 0,
    lastAt: 0,
    holding: undefined,
    heldLong: false,
    saying: undefined,
  }
  const [said, setSaid] = createSignal<string | undefined>()
  sheetPut()
  const say = (words: string): void => {
    clearTimeout(held.saying)
    setSaid(words)
    held.saying = setTimeout(() => setSaid(undefined), SAID_FOR)
  }
  const turn = (): void => {
    held.presses = 0
    const open = turnOver()
    castLook(open)
    say(turnedOver(open))
  }
  const press = (): void => {
    const now = Date.now()
    held.presses = now - held.lastAt <= IN_A_ROW ? held.presses + 1 : 1
    held.lastAt = now
    if (held.presses >= PRESSES) turn()
    else if (held.presses >= COUNTED_FROM) say(stillToGo(PRESSES - held.presses, isOpen()))
  }
  const letGo = (): void => {
    clearTimeout(held.holding)
    held.holding = undefined
  }
  onCleanup(() => {
    letGo()
    clearTimeout(held.saying)
  })
  return (
    <span
      class={PRESSED}
      onPointerDown={() => {
        held.heldLong = false
        letGo()
        held.holding = setTimeout(() => {
          held.heldLong = true
          turn()
        }, HELD)
      }}
      onPointerUp={() => {
        letGo()
        if (!held.heldLong) press()
      }}
      onPointerLeave={letGo}
      onPointerCancel={letGo}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.children}
      <Portal>
        <Show when={said()}>
          {(words) => (
            <p role="status" class={SAYS}>
              {words()}
            </p>
          )}
        </Show>
      </Portal>
    </span>
  )
}
