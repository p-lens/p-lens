import { createMemo, createSignal, onCleanup, Show, type JSX } from "solid-js"

import type { ApplicationError, Outcome } from "../../application/errors"
import type { HandedFile } from "../../backup/port/handover"
import type { BookId } from "../../core/book/book"
import { Ok } from "../../core/result/result"
import { Button } from "../../ui/primitives/button"
import { createWait } from "../../ui/primitives/wait"
import { describeError } from "../../ui/wording/errors"
import { handOver, type ExportPorts, type ExportReport, type ExportWatch, type Made } from "../application/export"
import { EXPORT_BEGUN, EXPORT_BROKEN, EXPORT_HANDING, EXPORT_READY, EXPORT_SAVE, EXPORT_STOP, exportReportText } from "./export-wording"

/**
 * Where a writing out is: not asked for; being made, with how far it has
 * got where it has said, and the stopping of it; made too long after its
 * press to hand over without another, waiting for 保存; being handed over;
 * failed with why; or broken off with nothing said of why.
 */
export type Working =
  | { readonly type: "idle" }
  | { readonly type: "making"; readonly report: ExportReport | undefined; readonly stop: () => void }
  | { readonly type: "ready"; readonly file: HandedFile }
  | { readonly type: "handing" }
  | { readonly type: "failed"; readonly error: ApplicationError }
  | { readonly type: "broken" }

const IDLE: Working = { type: "idle" }

/** A file the person was asked where to put, and closed the question on: their answer, and nothing to report. */
const declined = (error: ApplicationError): boolean => error.type === "handover" && error.failure.type === "handover-cancelled"

/** A writing out and where it is: one at a time, stopped by the person or by the screen being left, a file made late handed over on a press of its own, and never left busy whatever befalls it. */
export interface Writing {
  readonly working: () => Working
  readonly write: (made: (watch: ExportWatch) => Promise<Outcome<Made>>) => Promise<void>
  readonly save: () => Promise<void>
  readonly stop: () => void
}

const createWriting = (ports: ExportPorts): Writing => {
  const [working, setWorking] = createSignal<Working>(IDLE)
  const settled = (written: Outcome<void>): void => {
    setWorking(written.ok || declined(written.error) ? IDLE : { type: "failed", error: written.error })
  }
  const give = async (file: HandedFile): Promise<void> => {
    setWorking({ type: "handing" })
    try {
      settled(await handOver(ports, file))
    } catch {
      setWorking({ type: "broken" })
    }
  }
  const stop = (): void => {
    const current = working()
    if (current.type === "making") current.stop()
  }
  return {
    working,
    stop,
    save: async () => {
      const current = working()
      if (current.type === "ready") await give(current.file)
    },
    write: async (made) => {
      if (working().type === "making" || working().type === "handing") return
      const stopping = new AbortController()
      const halt = (): void => {
        stopping.abort()
        setWorking(IDLE)
      }
      setWorking({ type: "making", report: undefined, stop: halt })
      try {
        const outcome = await made({ stopped: stopping.signal, onReport: (report) => (stopping.signal.aborted ? undefined : setWorking({ type: "making", report, stop: halt })) })
        if (stopping.signal.aborted) return
        if (!outcome.ok) return settled(outcome)
        if (outcome.value.type === "stopped") return settled(Ok(undefined))
        if (ports.handover.givesNow()) return give(outcome.value.file)
        setWorking({ type: "ready", file: outcome.value.file })
      } catch {
        if (!stopping.signal.aborted) setWorking({ type: "broken" })
      }
    },
  }
}

/** What a writing out is kept by: the books' zip, or a book's on a tab, each tab's apart. */
export type WritingKey = "together" | `${string}:${BookId}`

/**
 * Each book's writing out on each tab, and the books' together, kept by
 * the screen and not by their rows: the list of books is read again
 * whenever a book changes, and a row made anew must still find its writing
 * where it was. Leaving the screen stops whatever is being made.
 */
export const createWritings = (ports: ExportPorts): ((key: WritingKey) => Writing) => {
  const held = new Map<WritingKey, Writing>()
  onCleanup(() => held.forEach((writing) => writing.stop()))
  return (key) => {
    const found = held.get(key)
    if (found !== undefined) return found
    const made = createWriting(ports)
    held.set(key, made)
    return made
  }
}

/** What is said of a file while it is being made, waits for 保存 or is being handed over; nothing otherwise. */
export const progressText = (working: Working): string | undefined => {
  switch (working.type) {
    case "making":
      return working.report === undefined ? EXPORT_BEGUN : exportReportText(working.report)
    case "ready":
      return EXPORT_READY
    case "handing":
      return EXPORT_HANDING
    case "idle":
    case "failed":
    case "broken":
      return undefined
  }
}

/** A file being made or handed over: what nobody is asked to do anything about. */
const isBusy = (working: Working): boolean => working.type === "making" || working.type === "handing"

/**
 * Under a line, where its file stands while it is anything but idle: how
 * far it has got and 中止, or 保存 for a file made late; why it failed, or
 * that it broke off. The buttons stay put as the words beside them change,
 * so a press is never lost to a report. A file made within the wait's
 * quiet never shows it was made at all, and one that shows it is being
 * made says so long enough to be read, with the last it said; 保存 waits
 * on a press, so it shows at once.
 */
export function WritingLine(props: { readonly writing: Writing }): JSX.Element {
  const working = (): Working => props.writing.working()
  const wait = createWait(() => isBusy(working()))
  const lastBusy = createMemo<Working>((before) => (isBusy(working()) ? working() : before), IDLE)
  const shown = (): Working => (working().type === "ready" ? working() : wait().type === "shown" ? lastBusy() : IDLE)
  return (
    <>
      <Show when={progressText(shown()) !== undefined}>
        <div class="flex items-center justify-end gap-2">
          <span class="min-w-0 text-xs text-text-muted" role="status">
            {progressText(shown())}
          </span>
          <Show when={shown().type === "making"}>
            <Button variant="outline" size="small" class="shrink-0" onClick={() => props.writing.stop()}>
              {EXPORT_STOP}
            </Button>
          </Show>
          <Show when={shown().type === "ready"}>
            <Button size="small" class="shrink-0" onClick={() => void props.writing.save()}>
              {EXPORT_SAVE}
            </Button>
          </Show>
        </div>
      </Show>
      <Show when={((current) => (current.type === "failed" ? describeError(current.error) : current.type === "broken" ? EXPORT_BROKEN : undefined))(working())} keyed>
        {(said) => (
          <p role="alert" class="rounded-md border border-negative/40 bg-negative/10 px-3 py-2 text-sm text-text-primary">
            {said}
          </p>
        )}
      </Show>
    </>
  )
}
