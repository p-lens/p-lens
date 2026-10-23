/**
 * Render a branding's icons from the one drawing in its folder of
 * src/branding/, `icon.png`, into its `served/`, which is served at the
 * site's root as it is. The branding is the one `BRANDING` names, as for a
 * build: `default` when it names none.
 *
 *   bun run icons                      needs ImageMagick (`magick`) on the PATH
 *   BRANDING=p-lens bun run icons
 *
 * The drawing is a square, its background running to the edges. From it:
 *
 * - `icon-192.png`, `icon-512.png`, `favicon.png` and `favicon.ico` have
 *   their corners rounded, for where an icon is shown as it is;
 * - `apple-touch-icon.png` is left square, because iOS rounds it itself;
 * - `icon-maskable-512.png` is drawn smaller on its background carried
 *   outward, so the letter stays inside the circle a launcher may cut;
 * - `og.png` is the card a link to the app is shown as where it is shared:
 *   the drawing on its background carried outward to 1200×630 and blurred
 *   smooth, with the deployment's name under it and nothing else. It needs the
 *   Noto Sans CJK JP font.
 *
 * The files are committed, so building the app never needs this; it is run
 * when the drawing changes.
 */

import { brandingOf } from "../src/branding/brandings"

const { folder, deployment: DEPLOYMENT } = brandingOf(process.env.BRANDING)

const SOURCE = `${folder}icon.png`

/** Where the rendered files go: beside the drawing, with everything else that is the deployment's own. */
const SERVED = `${folder}served`

/** How round a corner is, as a share of the icon's side. */
const CORNER = 0.22

/** How much of a maskable icon's side the drawing takes, the rest being its background carried outward. */
const MASKABLE_SHARE = 0.76

const rounded = (size: number): readonly string[] => {
  const radius = Math.round(size * CORNER)
  return [
    SOURCE,
    "-resize",
    `${size}x${size}`,
    "(",
    "+clone",
    "-alpha",
    "transparent",
    "-fill",
    "white",
    "-draw",
    `roundrectangle 0,0 ${size - 1},${size - 1} ${radius},${radius}`,
    ")",
    "-alpha",
    "off",
    "-compose",
    "CopyOpacity",
    "-composite",
  ]
}

const square = (size: number): readonly string[] => [SOURCE, "-resize", `${size}x${size}`]

const maskable = (size: number): readonly string[] => {
  const inner = Math.round(size * MASKABLE_SHARE)
  const margin = Math.round((size - inner) / 2)
  return [SOURCE, "-resize", `${inner}x${inner}`, "-virtual-pixel", "Edge", "-set", "option:distort:viewport", `${size}x${size}-${margin}-${margin}`, "-distort", "SRT", "0", "+repage"]
}

/** The card's size, as the places a link is shared ask for it. */
const CARD = { width: 1200, height: 630 }

/** The drawing's side on the card, and how far down its top edge sits. */
const CARD_MARK = { side: 340, top: 95 }

/** How far in from the drawing's edge it gives way to the smoothed background, so no edge of it shows. */
const CARD_INSET = 15

/** How far down the card the app's name is written. */
const CARD_NAME_TOP = 470

const card = (): readonly string[] => {
  const left = Math.round((CARD.width - CARD_MARK.side) / 2)
  const shown = { left: left + CARD_INSET, top: CARD_MARK.top + CARD_INSET, right: left + CARD_MARK.side - CARD_INSET, bottom: CARD_MARK.top + CARD_MARK.side - CARD_INSET }
  return [
    SOURCE,
    "-resize",
    `${CARD_MARK.side}x${CARD_MARK.side}`,
    "-virtual-pixel",
    "Edge",
    "-set",
    "option:distort:viewport",
    `${CARD.width}x${CARD.height}-${left}-${CARD_MARK.top}`,
    "-distort",
    "SRT",
    "0",
    "+repage",
    "(",
    "+clone",
    "-blur",
    "0x60",
    ")",
    "(",
    "-size",
    `${CARD.width}x${CARD.height}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `roundrectangle ${shown.left},${shown.top} ${shown.right},${shown.bottom} 40,40`,
    "-blur",
    "0x14",
    ")",
    "-swap",
    "0,1",
    "-compose",
    "Over",
    "-composite",
    "-font",
    "Noto-Sans-CJK-JP-Bold",
    "-fill",
    "white",
    "-pointsize",
    "58",
    "-kerning",
    "6",
    "-gravity",
    "North",
    "-annotate",
    `+0+${CARD_NAME_TOP}`,
    DEPLOYMENT.name,
  ]
}

const renders: readonly (readonly [readonly string[], string])[] = [
  [rounded(192), `${SERVED}/icon-192.png`],
  [rounded(512), `${SERVED}/icon-512.png`],
  [rounded(96), `${SERVED}/favicon.png`],
  [square(180), `${SERVED}/apple-touch-icon.png`],
  [maskable(512), `${SERVED}/icon-maskable-512.png`],
  [card(), `${SERVED}/og.png`],
  [[...rounded(256), "-define", "icon:auto-resize=48,32,16"], `${SERVED}/favicon.ico`],
]

const rendered = await Promise.all(
  renders.map(async ([drawing, target]) => {
    const exit = await Bun.spawn(["magick", ...drawing, "-strip", target]).exited
    return { target, exit }
  }),
)

rendered.forEach(({ target, exit }) => (exit === 0 ? console.log(target) : console.error(`failed: ${target}`)))
process.exitCode = rendered.every(({ exit }) => exit === 0) ? 0 : 1
