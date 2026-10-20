/** The widest an image is looked at for a code: a screenshot's code fills much of it, and a smaller one is read sooner. */
const LOOKED_AT_WIDTH = 1_200

/**
 * The text of the first QR code found in an image — a screenshot sent in a
 * chat, say — or none where none is found or the image cannot be read.
 * The reader is fetched only as it is first wanted; nothing of the image
 * is kept.
 */
export const qrInImage = async (image: Blob): Promise<string | undefined> => {
  try {
    const [{ default: jsQR }, bitmap] = await Promise.all([import("jsqr"), createImageBitmap(image)])
    const scale = Math.min(1, LOOKED_AT_WIDTH / bitmap.width)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const drawing = canvas.getContext("2d", { willReadFrequently: true })
    if (drawing === null) return undefined
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const found = jsQR(drawing.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" })
    return found === null || found.data === "" ? undefined : found.data
  } catch {
    return undefined
  }
}
