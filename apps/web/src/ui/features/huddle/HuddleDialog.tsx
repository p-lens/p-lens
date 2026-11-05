import { createSignal, Show, type JSX } from "solid-js"

import { huddleLeftOn, markHuddleLeft, renameInHuddle } from "../../../application/huddle"
import { huddleNameOf, type Huddle } from "../../../core/huddle/huddle"
import { huddleDepartureOf } from "../../../core/huddle/post"
import type { Result } from "../../../core/result/result"
import { huddleCodeOf, joinHuddle, startHuddle, type CrossingServices, type HuddleProblem } from "../../../crossing"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { PanelDialog } from "../../primitives/dialog"
import { QrCode } from "../../primitives/qr-code"
import { qrInImage } from "../../primitives/qr-image"
import { QrScanner } from "../../primitives/qr-scanner"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import {
  HUDDLE_ABOUT,
  HUDDLE_HEADING,
  HUDDLE_NAME,
  HUDDLE_NAME_NEEDED,
  HUDDLE_NO_CAMERA,
  HUDDLE_NOT_IN_IMAGE,
  HUDDLE_SCANNING,
  HUDDLE_SHOW_CODE,
  describeHuddleProblem,
  huddleJoinedAs,
  huddleLeftUntoldText,
  JOIN_BY_IMAGE,
  JOIN_HUDDLE,
  LEAVE_HUDDLE,
  RENAME_IN_HUDDLE,
  RENAME_IN_HUDDLE_DONE,
  RENAME_IN_HUDDLE_LEFT_ALONE,
  START_HUDDLE,
} from "../../wording/huddle"
import { suggestedHuddleName } from "../../wording/huddle-names"

/** Typing the name to go by in the huddle instead, from the one gone by now: kept by Enter or its button, or left alone. */
function Renaming(props: { readonly huddle: Huddle; readonly onDone: () => void }): JSX.Element {
  const app = useApp()
  const [typed, setTyped] = createSignal(props.huddle.name)
  const [nameMissed, setNameMissed] = createSignal(false)
  const rename = (): void => {
    settleTyping()
    const name = huddleNameOf(typed())
    setNameMissed(name === undefined)
    if (name === undefined) return
    if (name !== props.huddle.name) renameInHuddle(app.services.preferences, props.huddle, name)
    app.huddle.changed()
    props.onDone()
  }
  return (
    <form
      autocomplete="off"
      class="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        rename()
      }}
    >
      <TextField label={HUDDLE_NAME} value={typed()} onChange={setTyped} required focusedOnShow error={nameMissed() ? HUDDLE_NAME_NEEDED : undefined} />
      <div class="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="small" onClick={props.onDone}>
          {RENAME_IN_HUDDLE_LEFT_ALONE}
        </Button>
        <Button type="submit" size="small">
          {RENAME_IN_HUDDLE_DONE}
        </Button>
      </div>
    </form>
  )
}

/** The huddle this device is in: the name it is in it as, changed where it stands at the top so that no keyboard hides the field, its QR code for the others to read — on this screen, or as a screenshot sent on — and below, the way to change the name and the way out. */
function JoinedHuddle(props: { readonly huddle: Huddle; readonly onLeave: () => void }): JSX.Element {
  const [renaming, setRenaming] = createSignal(false)
  return (
    <div class="flex flex-col gap-3">
      <Show when={renaming()} fallback={<p class="font-semibold text-text-primary">{huddleJoinedAs(props.huddle.name)}</p>}>
        <Renaming huddle={props.huddle} onDone={() => setRenaming(false)} />
      </Show>
      <QrCode text={huddleCodeOf(props.huddle)} label={HUDDLE_HEADING} class="mx-auto w-56 max-w-full" />
      <p>{HUDDLE_SHOW_CODE}</p>
      <Show when={!renaming()}>
        <div class="flex flex-wrap justify-between gap-2">
          <Button variant="outline" size="small" onClick={() => setRenaming(true)}>
            {RENAME_IN_HUDDLE}
          </Button>
          <Button variant="outline" size="small" onClick={props.onLeave}>
            {LEAVE_HUDDLE}
          </Button>
        </div>
      </Show>
    </div>
  )
}

/** A huddle not yet joined: the name to go by — the one gone by in a huddle left that day, to come back as, or else one drawn from the suggestions — and a huddle begun, or joined by reading its QR code — by the camera, or out of an image such as a screenshot sent in a chat. */
function NewHuddle(props: { readonly crossing: CrossingServices; readonly onJoined: (made: Result<Huddle, HuddleProblem>) => void }): JSX.Element {
  const app = useApp()
  const [typed, setTyped] = createSignal(huddleLeftOn(app.services.preferences, app.services.businessDay())?.name ?? suggestedHuddleName(Math.random))
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const [scanning, setScanning] = createSignal(false)
  const [nameMissed, setNameMissed] = createSignal(false)
  const named = (then: (name: string) => void): void => {
    const name = huddleNameOf(typed())
    setNameMissed(name === undefined)
    if (name !== undefined) then(name)
  }
  const join = (code: string): void => named((name) => void joinHuddle(props.crossing.huddle, code, name, app.services.businessDay()).then(props.onJoined))
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
      <TextField label={HUDDLE_NAME} value={typed()} onChange={setTyped} required error={nameMissed() ? HUDDLE_NAME_NEEDED : undefined} />
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
            <Button size="small" onClick={() => named((name) => void startHuddle(props.crossing.huddle, name, app.services.businessDay()).then(props.onJoined))}>
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
export function HuddleDialog(props: { readonly open: boolean; readonly crossing: CrossingServices; readonly onClosed: () => void }): JSX.Element {
  const app = useApp()
  const joined = (made: Result<Huddle, HuddleProblem>): void => {
    if (!made.ok) {
      toast({ title: HUDDLE_HEADING, description: describeHuddleProblem(made.error), tone: "error" })
      return
    }
    app.huddle.changed()
  }
  /** Leaving: said on the line while it is still open, and the device left at once whether the others heard or not. */
  const leave = (huddle: Huddle): void => {
    const line = app.huddle.line.held.line
    const said = line === undefined ? Promise.resolve<Result<void, HuddleProblem>>({ ok: false, error: { type: "unreachable" } }) : line.put(huddleDepartureOf(huddle, app.services.now()))
    markHuddleLeft(app.services.preferences, huddle)
    app.huddle.changed()
    props.onClosed()
    void said.then((outcome) => {
      if (!outcome.ok) toast({ title: HUDDLE_HEADING, description: huddleLeftUntoldText(outcome.error), tone: "error" })
    })
  }
  return (
    <PanelDialog open={props.open} title={HUDDLE_HEADING} onClosed={props.onClosed}>
      <Show when={app.huddle.now()} keyed fallback={<NewHuddle crossing={props.crossing} onJoined={joined} />}>
        {(huddle) => <JoinedHuddle huddle={huddle} onLeave={() => leave(huddle)} />}
      </Show>
    </PanelDialog>
  )
}
