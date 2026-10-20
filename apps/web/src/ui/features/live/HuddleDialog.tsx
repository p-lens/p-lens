import { createSignal, Show, type JSX } from "solid-js"

import { joinHuddle, leaveHuddle, startHuddle } from "../../../application/huddle"
import type { Outcome } from "../../../application/errors"
import { huddleCodeOf, huddleNameOf, type Huddle } from "../../../core/huddle/huddle"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { copyText } from "../../primitives/clipboard"
import { NoticeDialog } from "../../primitives/dialog"
import { QrCode } from "../../primitives/qr-code"
import { QrScanner } from "../../primitives/qr-scanner"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { describeError } from "../../wording/errors"
import {
  COPY_HUDDLE_CODE,
  HUDDLE_ABOUT,
  HUDDLE_CODE_COPIED,
  HUDDLE_CODE_FIELD,
  HUDDLE_HEADING,
  HUDDLE_NAME,
  HUDDLE_NAME_NEEDED,
  HUDDLE_NO_CAMERA,
  HUDDLE_SCANNING,
  HUDDLE_SHOW_CODE,
  JOIN_BY_CODE,
  JOIN_HUDDLE,
  LEAVE_HUDDLE,
  START_HUDDLE,
} from "../../wording/huddle"
import { huddlePortsOf } from "./huddle-board"

/** The huddle this device is in: its QR code for the others to read, its code to copy, and the way out. */
function JoinedHuddle(props: { readonly huddle: Huddle; readonly onLeave: () => void }): JSX.Element {
  const copy = async (): Promise<void> => {
    const copied = await copyText(huddleCodeOf(props.huddle))
    if (copied.ok) toast({ title: HUDDLE_CODE_COPIED })
  }
  return (
    <div class="flex flex-col gap-3">
      <QrCode text={huddleCodeOf(props.huddle)} label={HUDDLE_HEADING} class="mx-auto w-56 max-w-full" />
      <p>{HUDDLE_SHOW_CODE}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="small" onClick={() => void copy()}>
          {COPY_HUDDLE_CODE}
        </Button>
        <Button variant="outline" size="small" onClick={props.onLeave}>
          {LEAVE_HUDDLE}
        </Button>
      </div>
    </div>
  )
}

/** A huddle not yet joined: the name to go by, and a huddle begun, or joined by reading its code — or by pasting it, where the camera cannot be used. */
function NewHuddle(props: { readonly onJoined: (made: Outcome<Huddle>) => void }): JSX.Element {
  const app = useApp()
  const ports = huddlePortsOf(app.services)
  const [typed, setTyped] = createSignal("")
  const [pasted, setPasted] = createSignal("")
  const [scanning, setScanning] = createSignal(false)
  const [nameMissed, setNameMissed] = createSignal(false)
  const named = (then: (name: string) => void): void => {
    const name = huddleNameOf(typed())
    setNameMissed(name === undefined)
    if (name !== undefined) then(name)
  }
  const join = (code: string): void => named((name) => props.onJoined(joinHuddle(ports, code, name, app.services.businessDay())))
  return (
    <div class="flex flex-col gap-3">
      <p>{HUDDLE_ABOUT}</p>
      <TextField label={HUDDLE_NAME} value={typed()} onChange={setTyped} required error={nameMissed() ? HUDDLE_NAME_NEEDED : undefined} />
      <Show
        when={scanning()}
        fallback={
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="small" onClick={() => named(() => setScanning(true))}>
              {JOIN_HUDDLE}
            </Button>
            <Button size="small" onClick={() => named((name) => props.onJoined(startHuddle(ports, name, app.services.businessDay())))}>
              {START_HUDDLE}
            </Button>
          </div>
        }
      >
        <p>{HUDDLE_SCANNING}</p>
        <QrScanner
          label={HUDDLE_SCANNING}
          onRead={(code) => {
            setScanning(false)
            join(code)
          }}
          onUnavailable={() => {
            setScanning(false)
            toast({ title: HUDDLE_NO_CAMERA, tone: "error" })
          }}
        />
      </Show>
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <TextField label={HUDDLE_CODE_FIELD} value={pasted()} onChange={setPasted} />
        </div>
        <Button variant="outline" size="small" onClick={() => join(pasted())}>
          {JOIN_BY_CODE}
        </Button>
      </div>
    </div>
  )
}

/**
 * ノリ打ち, opened from the rail: begun or joined where the device is in
 * no huddle, and its QR code shown where it is in one.
 */
export function HuddleDialog(props: { readonly open: boolean; readonly onClosed: () => void }): JSX.Element {
  const app = useApp()
  const joined = (made: Outcome<Huddle>): void => {
    if (!made.ok) {
      toast({ title: HUDDLE_HEADING, description: describeError(made.error), tone: "error" })
      return
    }
    app.huddle.changed()
  }
  const leave = (): void => {
    leaveHuddle(app.services.preferences)
    app.huddle.changed()
    props.onClosed()
  }
  return (
    <NoticeDialog open={props.open} title={HUDDLE_HEADING} acknowledge="閉じる" onAcknowledged={props.onClosed}>
      <Show when={app.huddle.now()} keyed fallback={<NewHuddle onJoined={joined} />}>
        {(huddle) => <JoinedHuddle huddle={huddle} onLeave={leave} />}
      </Show>
    </NoticeDialog>
  )
}
