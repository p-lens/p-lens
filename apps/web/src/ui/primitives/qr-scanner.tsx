import { onCleanup, onMount, type JSX } from "solid-js"

/** How often a frame of the camera is looked at for a code, in milliseconds. */
const LOOK_EVERY = 250

/** The widest a frame is looked at: a code fills much of what the camera sees, and a smaller frame is read sooner. */
const FRAME_WIDTH = 480

/**
 * The camera looking for a QR code: the back camera's picture, a frame of
 * it looked at four times a second, and the first code's text handed on
 * once, the camera then let go. The reader is fetched only as it opens,
 * and nothing is kept of what the camera saw. Where the camera cannot be
 * had — none, or refused — `onUnavailable` is told, once.
 */
export function QrScanner(props: { readonly label: string; readonly onRead: (text: string) => void; readonly onUnavailable: () => void }): JSX.Element {
  const held: { video: HTMLVideoElement | undefined; stream: MediaStream | undefined; looking: ReturnType<typeof setInterval> | undefined; done: boolean } = { video: undefined, stream: undefined, looking: undefined, done: false }
  const stop = (): void => {
    held.done = true
    clearInterval(held.looking)
    held.stream?.getTracks().forEach((track) => track.stop())
  }
  onMount(async () => {
    try {
      const [{ default: jsQR }, stream] = await Promise.all([import("jsqr"), navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })])
      if (held.done || held.video === undefined) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      held.stream = stream
      held.video.srcObject = stream
      await held.video.play()
      const canvas = document.createElement("canvas")
      const drawing = canvas.getContext("2d", { willReadFrequently: true })
      held.looking = setInterval(() => {
        const video = held.video
        if (drawing === null || video === undefined || video.videoWidth === 0) return
        const scale = Math.min(1, FRAME_WIDTH / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        drawing.drawImage(video, 0, 0, canvas.width, canvas.height)
        const found = jsQR(drawing.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" })
        if (found === null || found.data === "" || held.done) return
        stop()
        props.onRead(found.data)
      }, LOOK_EVERY)
    } catch {
      if (!held.done) props.onUnavailable()
      stop()
    }
  })
  onCleanup(stop)
  return <video ref={(element) => (held.video = element)} aria-label={props.label} muted playsinline class="aspect-square w-full rounded-md bg-surface-0 object-cover" />
}
