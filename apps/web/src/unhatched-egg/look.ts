import { createEffect, onCleanup } from "solid-js"

import { isOpen } from "./hatched"

/**
 * The egg's own look, cast over the whole page from here: a stylesheet of
 * its own put into the document's head, and a mark put on the document
 * itself while the egg is open, under which the screen's four edges glow
 * a faint, blurred red, slowly brighter and dimmer, over everything and
 * in the way of nothing; and what the egg says, and the name it is opened
 * by, styled by the same sheet. No part of the app draws it, or knows of
 * it, and none of the app's styles are borrowed: it matches no theme on
 * purpose, and stays still where a device asks for less motion.
 */
const SHEET = "unhatched-egg"
const MARK = "data-unhatched-egg"

/** The classes the sheet styles: the name the egg is opened by, and what it says. */
export const PRESSED = "unhatched-egg-pressed"
export const SAYS = "unhatched-egg-says"

const LOOK = `
html[${MARK}]::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  box-shadow: inset 0 0 32px 4px rgba(255, 32, 48, 0.22);
  animation: unhatched-egg-breath 3.2s ease-in-out infinite;
}
@keyframes unhatched-egg-breath {
  50% { box-shadow: inset 0 0 48px 8px rgba(255, 32, 48, 0.38); }
}
.${PRESSED} {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.${SAYS} {
  position: fixed;
  top: 2.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  pointer-events: none;
  margin: 0;
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  background: rgba(40, 8, 12, 0.92);
  color: #ffe9ea;
  font-size: 0.875rem;
  box-shadow: 0 0 16px rgba(255, 32, 48, 0.45);
}
@media (prefers-reduced-motion: reduce) {
  html[${MARK}]::after { animation: none; }
}
`

const sheetPut = (): void => {
  if (document.getElementById(SHEET) !== null) return
  const sheet = document.createElement("style")
  sheet.id = SHEET
  sheet.textContent = LOOK
  document.head.append(sheet)
}

/** Cast the egg's look over the page for as long as the one casting it stays: the mark on while the egg is open, off once it is closed, and off as it goes. */
export const castLook = (): void => {
  sheetPut()
  createEffect(() => document.documentElement.toggleAttribute(MARK, isOpen()))
  onCleanup(() => document.documentElement.removeAttribute(MARK))
}
