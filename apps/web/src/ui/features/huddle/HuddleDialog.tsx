import { createSignal, Show, type JSX } from "solid-js"

import { huddleLeftOn, joinHuddle, leaveHuddle, startHuddle } from "../../../application/huddle"
import type { Outcome } from "../../../application/errors"
import { huddleCodeOf, huddleNameOf, type Huddle } from "../../../core/huddle/huddle"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { DiceIcon } from "../../primitives/icons"
import { PanelDialog } from "../../primitives/dialog"
import { QrCode } from "../../primitives/qr-code"
import { qrInImage } from "../../primitives/qr-image"
import { QrScanner } from "../../primitives/qr-scanner"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { describeError } from "../../wording/errors"
import {
  HUDDLE_ABOUT,
  HUDDLE_HEADING,
  HUDDLE_NAME,
  HUDDLE_NAME_NEEDED,
  HUDDLE_NO_CAMERA,
  HUDDLE_NOT_IN_IMAGE,
  HUDDLE_REDRAW_NAME,
  HUDDLE_SCANNING,
  HUDDLE_SHOW_CODE,
  JOIN_BY_IMAGE,
  JOIN_HUDDLE,
  LEAVE_HUDDLE,
  START_HUDDLE,
} from "../../wording/huddle"
import { suggestedHuddleName } from "../../wording/huddle-names"
import { huddlePortsOf } from "./huddle-ports"

/** The huddle this device is in: its QR code for the others to read — on this screen, or as a screenshot sent on — and the way out. */
function JoinedHuddle(props: { readonly huddle: Huddle; readonly onLeave: () => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-3">
      <QrCode text={huddleCodeOf(props.huddle)} label={HUDDLE_HEADING} class="mx-auto w-56 max-w-full" />
      <p>{HUDDLE_SHOW_CODE}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="small" onClick={props.onLeave}>
          {LEAVE_HUDDLE}
        </Button>
      </div>
    </div>
  )
}

/** A huddle not yet joined: the name to go by — the one gone by in a huddle left that day, to come back as, or else one drawn from the suggestions — and a huddle begun, or joined by reading its QR code — by the camera, or out of an image such as a screenshot sent in a chat. */
function NewHuddle(props: { readonly onJoined: (made: Outcome<Huddle>) => void }): JSX.Element {
  const app = useApp()
  const ports = huddlePortsOf(app.services)
  const [typed, setTyped] = createSignal(huddleLeftOn(app.services.preferences, app.services.businessDay())?.name ?? suggestedHuddleName(Math.random))
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const [scanning, setScanning] = createSignal(false)
  const [nameMissed, setNameMissed] = createSignal(false)
  const named = (then: (name: string) => void): void => {
    const name = huddleNameOf(typed())
    setNameMissed(name === undefined)
    if (name !== undefined) then(name)
  }
  const join = (code: string): void => named((name) => props.onJoined(joinHuddle(ports, code, name, app.services.businessDay())))
  const picked = async (input: HTMLInputElement): Promise<void> => {
    const image = input.files?.[0]
    input.value = ""
    if (image === undefined) return
    const code = await qrInImage(image)
    if (code === undefined) toast({ title: HUDDLE_NOT_IN_IMAGE, tone: "error" })
    else join(code)
  }
  return (
    <div class="flex flex-col gap-3">
      <p>{HUDDLE_ABOUT}</p>
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <TextField label={HUDDLE_NAME} value={typed()} onChange={setTyped} required error={nameMissed() ? HUDDLE_NAME_NEEDED : undefined} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          class="mt-6 shrink-0"
          aria-label={HUDDLE_REDRAW_NAME}
          title={HUDDLE_REDRAW_NAME}
          onClick={() => {
            setTyped(suggestedHuddleName(Math.random, typed()))
            setNameMissed(false)
          }}
        >
          <DiceIcon />
        </Button>
      </div>
      <Show
        when={scanning()}
        fallback={
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="small" onClick={() => named(() => picker.input?.click())}>
              {JOIN_BY_IMAGE}
            </Button>
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
      <input ref={(element) => (picker.input = element)} type="file" accept="image/*" class="hidden" onChange={(event) => void picked(event.currentTarget)} />
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
  const leave = (huddle: Huddle): void => {
    const said = leaveHuddle(huddlePortsOf(app.services), huddle, app.huddle.line.held.lineEnd)
    app.huddle.changed()
    props.onClosed()
    void said.then((outcome) => {
      if (!outcome.ok) toast({ title: HUDDLE_HEADING, description: describeError(outcome.error), tone: "error" })
    })
  }
  return (
    <PanelDialog open={props.open} title={HUDDLE_HEADING} onClosed={props.onClosed}>
      <Show when={app.huddle.now()} keyed fallback={<NewHuddle onJoined={joined} />}>
        {(huddle) => <JoinedHuddle huddle={huddle} onLeave={() => leave(huddle)} />}
      </Show>
    </PanelDialog>
  )
}
