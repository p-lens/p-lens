import { createSignal, Show, type JSX } from "solid-js"

import { joinByCode, type CrossingServices, type Joined } from "../../../crossing"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { qrInImage } from "../../primitives/qr-image"
import { QrScanner } from "../../primitives/qr-scanner"
import { settleTyping, TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { ADD_BY_CODE, describeBookSyncProblem, JOINING, SCAN_SYNC_CODE, SYNC_CODE_BY_IMAGE, SYNC_NO_CAMERA } from "../../wording/sync"

/** What a screen joining a book by a code says: what to do, the field's name, what the camera is pointed at, and how it went — a book put on the device, or a book's inbox it now sends plays to. */
export interface JoinWording {
  readonly about: string
  readonly field: string
  readonly scanning: string
  readonly notInImage: string
  readonly joined: (joined: Joined) => { readonly title: string; readonly description?: string }
  readonly notJoined: string
}

/**
 * A book put on this device from its line, or a book's inbox to send plays
 * to, by a code: one of the owner's sync codes or a person's invitation
 * code, read off its QR code by the camera or out of an image, or pasted.
 */
export function JoinByCode(props: { readonly crossing: CrossingServices; readonly wording: JoinWording; readonly onJoined: () => void }): JSX.Element {
  const app = useApp()
  const [typed, setTyped] = createSignal("")
  const [scanning, setScanning] = createSignal(false)
  const [joining, setJoining] = createSignal(false)
  const picker: { input: HTMLInputElement | undefined } = { input: undefined }
  const join = async (code: string): Promise<void> => {
    if (joining()) return
    setJoining(true)
    const joined = await joinByCode(props.crossing.books, code)
    setJoining(false)
    if (!joined.ok) return toast({ title: props.wording.notJoined, description: describeBookSyncProblem(joined.error), tone: "error" })
    setTyped("")
    app.bookLines.relinked()
    app.wrote()
    props.onJoined()
    toast(props.wording.joined(joined.value))
  }
  const picked = async (input: HTMLInputElement): Promise<void> => {
    const image = input.files?.[0]
    input.value = ""
    if (image === undefined) return
    const code = await qrInImage(image)
    if (code === undefined) toast({ title: props.wording.notInImage, tone: "error" })
    else await join(code)
  }
  return (
    <div class="flex flex-col gap-3">
      <p class="text-sm text-text-muted">{props.wording.about}</p>
      <Show
        when={scanning()}
        fallback={
          <div class="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="small" onClick={() => picker.input?.click()}>
              {SYNC_CODE_BY_IMAGE}
            </Button>
            <Button variant="secondary" size="small" onClick={() => setScanning(true)}>
              {SCAN_SYNC_CODE}
            </Button>
          </div>
        }
      >
        <p class="text-sm">{props.wording.scanning}</p>
        <QrScanner
          label={props.wording.scanning}
          onRead={(code) => {
            setScanning(false)
            void join(code)
          }}
          onUnavailable={() => {
            setScanning(false)
            toast({ title: SYNC_NO_CAMERA, tone: "error" })
          }}
        />
      </Show>
      <form
        autocomplete="off"
        class="flex flex-col gap-2"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          settleTyping()
          if (typed().trim() !== "") void join(typed())
        }}
      >
        <TextField label={props.wording.field} value={typed()} onChange={setTyped} />
        <div class="flex justify-end">
          <Button type="submit" size="small" variant="secondary" aria-busy={joining()}>
            {joining() ? JOINING : ADD_BY_CODE}
          </Button>
        </div>
      </form>
      <input ref={(element) => (picker.input = element)} type="file" accept="image/*" class="hidden" onChange={(event) => void picked(event.currentTarget)} />
    </div>
  )
}
