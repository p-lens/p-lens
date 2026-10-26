import type { TokenKind } from "../commodity/commodity"
import { sameIdentity, type ParlorIdentity } from "../parlor/parlor"

/** Tokens in hand counted by the box: so many full boxes of so many each, and those loose beside them. */
export interface BoxCount {
  readonly boxes: number
  readonly perBox: number
  readonly loose: number
}

/** The tokens in hand a count by the box comes to. */
export const tokensInBoxes = (count: BoxCount): number => count.boxes * count.perBox + count.loose

/**
 * How many tokens of a kind fill one box at a parlor, as last used there on
 * this device: boxes and how full they are heaped differ from parlor to
 * parlor. A play at no parlor keeps its own, as `identity` left out.
 */
export interface BoxSize {
  readonly identity: ParlorIdentity | undefined
  readonly kind: TokenKind
  readonly perBox: number
}

const samePlace = (size: BoxSize, identity: ParlorIdentity | undefined, kind: TokenKind): boolean =>
  size.kind === kind && (size.identity === undefined || identity === undefined ? size.identity === identity : sameIdentity(size.identity, identity))

/** The tokens one box held when last used at a parlor for a kind of token, or none yet. */
export const boxSizeAt = (sizes: readonly BoxSize[], identity: ParlorIdentity | undefined, kind: TokenKind): number | undefined => sizes.find((size) => samePlace(size, identity, kind))?.perBox

/** The box sizes with a parlor's for a kind of token set to what was just used. */
export const withBoxSize = (sizes: readonly BoxSize[], size: BoxSize): readonly BoxSize[] => [...sizes.filter((each) => !samePlace(each, size.identity, size.kind)), size]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const identityIn = (value: unknown): ParlorIdentity | undefined => {
  if (!isRecord(value)) return undefined
  if (value["type"] === "listed" && typeof value["id"] === "string") return { type: "listed", id: value["id"] as never }
  if (value["type"] === "submitted" && typeof value["submission"] === "string") return { type: "submitted", submission: value["submission"] as never }
  return undefined
}

const sizeIn = (value: unknown): readonly BoxSize[] => {
  if (!isRecord(value)) return []
  const { kind, perBox } = value
  const identity = identityIn(value["identity"])
  if ((identity === undefined && value["identity"] !== undefined) || (kind !== "ball" && kind !== "medal") || typeof perBox !== "number" || !Number.isInteger(perBox) || perBox <= 0) return []
  return [{ identity, kind, perBox }]
}

/** Box sizes as kept on the device; none where nothing, or nothing that reads, was kept. A size that does not read is left out alone. */
export const readBoxSizes = (written: string | undefined): readonly BoxSize[] => {
  if (written === undefined) return []
  try {
    const parsed: unknown = JSON.parse(written)
    return Array.isArray(parsed) ? parsed.flatMap(sizeIn) : []
  } catch {
    return []
  }
}

/** Box sizes as they are kept on the device. */
export const writtenBoxSizes = (sizes: readonly BoxSize[]): string => JSON.stringify(sizes)
