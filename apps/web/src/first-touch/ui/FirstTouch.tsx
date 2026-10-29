/// <reference types="vite/client" />
import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"

import { useApp } from "../../ui/context"
import { noteFor, type Noted } from "../core/notes"
import { touchOf } from "./touched"
import { noteText, UNDERSTOOD } from "./wording"
import "./first-touch.css"

/** A note showing, and the thing it points at. */
interface Shown {
  readonly noted: Noted
  readonly anchor: Element
}

/** Where a note is drawn: the box it points at, its own place, the side it stands on, and how far along it the tail is. */
interface Drawn {
  readonly ring: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  readonly left: number
  readonly top: number
  readonly width: number
  readonly side: "above" | "below"
  readonly tail: number
}

/** Room kept between a note and the screen's sides, and between a note and what it points at, in pixels. */
const MARGIN = 16
const GAP = 14

/** The widest a note grows, in pixels: two short lines on a phone. */
const WIDEST = 320

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), Math.max(low, high))

/** The side a note stands on: away from what the thing opened, where it opened something and there is room; else above where there is room, the keyboard rising from below, and below where there is not. */
const sideOf = (box: DOMRect, height: number, opened: DOMRect | undefined): Drawn["side"] => {
  const roomAbove = box.top - GAP - height >= 8
  const roomBelow = box.bottom + GAP + height <= window.innerHeight - 8
  if (opened !== undefined && opened.bottom <= box.top + 1 && roomBelow) return "below"
  if (opened !== undefined && opened.top >= box.bottom - 1 && roomAbove) return "above"
  return roomAbove ? "above" : "below"
}

/** Where a note of a height stands beside a box, out of the way of what the thing opened. */
const drawnBeside = (box: DOMRect, height: number, opened: DOMRect | undefined): Drawn => {
  const width = Math.min(WIDEST, window.innerWidth - MARGIN * 2)
  const left = clamp(box.left - 8, MARGIN, window.innerWidth - width - MARGIN)
  const side = sideOf(box, height, opened)
  return {
    ring: { left: box.left, top: box.top, width: box.width, height: box.height },
    left,
    top: side === "above" ? box.top - GAP - height : box.bottom + GAP,
    width,
    side,
    tail: clamp(box.left + Math.min(box.width / 2, 28) - left, 18, width - 18),
  }
}

const sameDrawn = (was: Drawn | undefined, now: Drawn): boolean =>
  was !== undefined && was.left === now.left && was.top === now.top && was.width === now.width && was.side === now.side && was.tail === now.tail && was.ring.left === now.ring.left && was.ring.top === now.ring.top && was.ring.width === now.ring.width && was.ring.height === now.ring.height

/** What a thing's `aria-controls` names: a list it opens, drawn elsewhere on the page. */
const controlledBy = (element: Element): readonly Element[] =>
  [element, ...element.querySelectorAll("[aria-controls]")]
    .flatMap((each) => (each.getAttribute("aria-controls") ?? "").split(/\s+/))
    .flatMap((id) => (id === "" ? [] : [document.getElementById(id) ?? undefined]))
    .filter((found): found is HTMLElement => found !== undefined)

/** Whether a touch or a focus is still on the thing a note points at: on it, or in a list it opened, where the focus goes as a select opens. */
const within = (anchor: Element, target: Node): boolean => anchor.contains(target) || controlledBy(anchor).some((list) => list.contains(target))

/**
 * 操作の手引き: the first time a person touches a thing a note is about —
 * a field that takes a running total, a button that does more when held
 * — a loud yellow bubble says, beside it, what it is; once, on any
 * screen, and never again on the device. It is put on the page once and
 * listens to every touch and every focus from outside, reading what was
 * touched by what it already is (`touchOf`): no screen carries anything
 * for it, so that it can be taken away whole. It never takes the focus
 * from the field being typed in; a touch anywhere but the bubble or what
 * it points at, or Escape, closes it, and a note follows its thing as
 * the page scrolls under it.
 */
export function FirstTouch(): JSX.Element {
  const app = useApp()
  const [shown, setShown] = createSignal<Shown | undefined>()
  const [drawn, setDrawn] = createSignal<Drawn | undefined>()
  const own: { bubble: HTMLElement | undefined; frame: number | undefined } = { bubble: undefined, frame: undefined }

  const close = (): void => {
    setShown(undefined)
    setDrawn(undefined)
  }

  const touched = (event: Event): void => {
    const current = shown()
    const target = event.target
    if (current !== undefined && target instanceof Node && (own.bubble?.contains(target) === true || within(current.anchor, target))) return
    if (current !== undefined) close()
    const found = touchOf(target, window.location.pathname)
    const noted = found === undefined ? undefined : noteFor(found.touch)
    if (found === undefined || noted === undefined || app.services.firstTouch.seen(noted.note)) return
    app.services.firstTouch.see(noted.note)
    setShown({ noted, anchor: found.anchor })
  }

  const escaped = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && shown() !== undefined) close()
  }

  const follow = (): void => {
    own.frame = undefined
    const current = shown()
    if (current === undefined) return
    if (!current.anchor.isConnected) {
      close()
      return
    }
    const now = drawnBeside(current.anchor.getBoundingClientRect(), own.bubble?.offsetHeight ?? 0, controlledBy(current.anchor)[0]?.getBoundingClientRect())
    if (!sameDrawn(drawn(), now)) setDrawn(now)
    own.frame = requestAnimationFrame(follow)
  }

  createEffect(() => {
    if (shown() === undefined || own.frame !== undefined) return
    own.frame = requestAnimationFrame(follow)
  })

  onMount(() => {
    document.addEventListener("pointerdown", touched, true)
    document.addEventListener("focusin", touched, true)
    document.addEventListener("keydown", escaped, true)
  })
  onCleanup(() => {
    document.removeEventListener("pointerdown", touched, true)
    document.removeEventListener("focusin", touched, true)
    document.removeEventListener("keydown", escaped, true)
    if (own.frame !== undefined) cancelAnimationFrame(own.frame)
  })

  return (
    <Show when={shown()} keyed>
      {(current) => (
        <Portal>
          <Show when={drawn()} keyed>
            {(at) => <div class="first-touch-ring" style={{ left: `${at.ring.left - 4}px`, top: `${at.ring.top - 4}px`, width: `${at.ring.width + 8}px`, height: `${at.ring.height + 8}px` }} />}
          </Show>
          <div
            ref={(element) => {
              own.bubble = element
            }}
            role="status"
            class="first-touch-bubble"
            data-side={drawn()?.side ?? "above"}
            style={{ left: `${drawn()?.left ?? 0}px`, top: `${drawn()?.top ?? 0}px`, width: `${drawn()?.width ?? WIDEST}px`, visibility: drawn() === undefined ? "hidden" : "visible" }}
          >
            <span class="first-touch-bubble__tail" style={{ left: `${drawn()?.tail ?? 18}px` }} />
            <svg class="first-touch-bubble__bulb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9 18h6" />
              <path d="M10 21h4" />
              <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z" />
            </svg>
            <p class="first-touch-bubble__text">{noteText(current.noted.note, current.noted.tokens)}</p>
            <button type="button" tabIndex={-1} class="first-touch-bubble__done" onMouseDown={(event) => event.preventDefault()} onClick={close}>
              {UNDERSTOOD}
            </button>
          </div>
        </Portal>
      )}
    </Show>
  )
}
