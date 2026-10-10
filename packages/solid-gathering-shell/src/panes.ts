/**
 * How the shell is laid out: every pane side by side, or one at a time.
 *
 * Not a size squeezed by CSS. A narrow window is a different arrangement with
 * its own navigation — selection, then content, then detail — and the host
 * moves between them as it moves between addresses.
 */
export type Arrangement = "wide" | "narrow"

/**
 * Which pane a narrow arrangement shows.
 *
 * The host derives it from wherever it keeps the place the person is at, so a
 * step forward and the browser's back button undo each other without the shell
 * holding any navigation state.
 */
export type Focus = "selection" | "content" | "detail"

export interface VisiblePanes {
  readonly selection: boolean
  readonly content: boolean
  readonly detail: boolean
}

/**
 * Which panes are on screen.
 *
 * A detail asked for with nothing to show in it falls back to the content
 * rather than to an empty screen.
 */
export const visiblePanes = (arrangement: Arrangement, focus: Focus, hasDetail: boolean): VisiblePanes =>
  arrangement === "wide"
    ? { selection: true, content: true, detail: hasDetail }
    : narrowPanes(focus === "detail" && !hasDetail ? "content" : focus)

const narrowPanes = (focus: Focus): VisiblePanes => ({
  selection: focus === "selection",
  content: focus === "content",
  detail: focus === "detail",
})
