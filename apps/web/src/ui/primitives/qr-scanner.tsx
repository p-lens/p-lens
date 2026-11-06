import { onCleanup, onMount, type JSX } from "solid-js"

/** How often a frame of the camera is looked at for a code, in milliseconds. */
const LOOK_EVERY = 250

/** The widest a frame is looked at: a code fills much of what the camera sees, and a smaller frame is read sooner. */
const FRAME_WIDTH = 480

/** The widest the picture is drawn for the person to aim by: sharp enough on a phone, and no more. */
const PREVIEW_WIDTH = 720

/**
 * The camera looking for a QR code: the back camera's picture, a frame of
 * it looked at four times a second, and the first code's text handed on
 * once, the camera then let go. The reader is fetched only as it opens,
 * and nothing is kept of what the camera saw. Where the camera cannot be
 * had — none, or refused — `onUnavailable` is told, once.
 *
 * What the camera sees is drawn onto a canvas at every frame for the person
 * to aim by, the video itself kept out of sight: Safari on an iPhone plays
 * a camera into a video in a dialog and reads its frames, but may draw
 * none of them on screen.
 */
export function QrScanner(props: { readonly label: string; readonly onRead: (text: string) => void; readonly onUnavailable: () => void }): JSX.Element {
  const held: { video: HTMLVideoElement | undefined; preview: HTMLCanvasElement | undefined; stream: MediaStream | undefined; looking: ReturnType<typeof setInterval> | undefined; frame: number | undefined; done: boolean } = {
    video: undefined,
    preview: undefined,
    stream: undefined,
    looking: undefined,
    frame: undefined,
    done: false,
  }
  const stop = (): void => {
    held.done = true
    clearInterval(held.looking)
    if (held.frame !== undefined) cancelAnimationFrame(held.frame)
    held.stream?.getTracks().forEach((track) => track.stop())
  }
  /** The camera's picture drawn for the person, frame after frame, until the camera is let go. */
  const drawn = (): void => {
    const video = held.video
    const preview = held.preview
    const drawing = preview?.getContext("2d")
    if (held.done || video === undefined || preview === undefined || drawing === null || drawing === undefined) return
    if (video.videoWidth > 0) {
      const scale = Math.min(1, PREVIEW_WIDTH / video.videoWidth)
      const [width, height] = [Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale)]
      if (preview.width !== width || preview.height !== height) [preview.width, preview.height] = [width, height]
      drawing.drawImage(video, 0, 0, width, height)
    }
    held.frame = requestAnimationFrame(drawn)
  }
  onMount(async () => {
    try {
      const [{ default: jsQR }, stream] = await Promise.all([import("jsqr"), navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })])
      if (held.done || held.video === undefined) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      held.stream = stream
      held.video.muted = true
      held.video.setAttribute("muted", "")
      held.video.setAttribute("playsinline", "")
      held.video.srcObject = stream
      await held.video.play()
      held.frame = requestAnimationFrame(drawn)
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
  return (
    <div class="relative">
      <video ref={(element) => (held.video = element)} muted playsinline aria-hidden="true" class="pointer-events-none absolute left-0 top-0 size-px opacity-0" />
      <canvas ref={(element) => (held.preview = element)} role="img" aria-label={props.label} class="aspect-square w-full rounded-md bg-surface-0 object-cover" />
    </div>
  )
}
