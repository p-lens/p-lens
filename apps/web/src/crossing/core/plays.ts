import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"

import { previousDay, type IsoDate } from "../../core/calendar/calendar"
import type { PlayDraft } from "../../core/live-play/draft"
import { readPlayDraft } from "../../core/live-play/draft-reading"
import type { PlayId } from "../../core/play/play"
import { linesOf, textOf } from "../../core/text/line-diff"
import { canonicalJson, digestOf, type Json } from "./book/canonical"

/** Why a play left its line: it was given up, or it is to be recorded into another book (PROTOCOL.md §6.1). */
export type Ending = "deleted" | "moved"

/** Who wrote a copy, and of which play at which generation. */
export interface CopyOf {
  readonly playId: PlayId
  readonly gen: number
  /** 32 lowercase hex digits: the device, as in its tips. */
  readonly device: string
}

/**
 * A copy's head (PROTOCOL.md §6.1): the play as its device keeps it, without
 * its log, with the hashes of the pieces its log begins with and the lines
 * after them; or that the play left the line.
 */
export type CopyHead = CopyOf & {
  readonly stamp: number
  readonly body: { readonly type: "play"; readonly play: { readonly [key: string]: Json }; readonly pieces: readonly string[]; readonly tail: readonly string[] } | { readonly type: "ended"; readonly ending: Ending }
}

/** One piece of a copy's log: some of its lines, in order. */
export type CopyPiece = CopyOf & { readonly index: number; readonly lines: readonly string[] }

/** The most a piece's lines come to as JSON, in bytes, so that any piece fits one seal (PROTOCOL.md §6.1). */
export const PIECE_BYTES = 30_000

const HEX32 = /^[0-9a-f]{32}$/
const HEX64 = /^[0-9a-f]{64}$/
const ENDINGS: readonly string[] = ["deleted", "moved"] satisfies readonly Ending[]

const isRecord = (value: unknown): value is { readonly [key: string]: unknown } => typeof value === "object" && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isLines = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((line) => typeof line === "string" && !line.includes("\n"))

const hasKeys = (value: { readonly [key: string]: unknown }, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => key in value)

const copyOfFields = (value: { readonly [key: string]: unknown }): CopyOf | undefined =>
  typeof value["playId"] === "string" && value["playId"] !== "" && isCount(value["gen"]) && typeof value["device"] === "string" && HEX32.test(value["device"])
    ? { playId: value["playId"] as PlayId, gen: value["gen"], device: value["device"] }
    : undefined

/** A head as it is sealed. */
export const headJson = (head: CopyHead): Json => {
  const of = { playId: head.playId, gen: head.gen, device: head.device, stamp: head.stamp }
  return head.body.type === "play" ? { ...of, play: head.body.play, pieces: [...head.body.pieces], tail: [...head.body.tail] } : { ...of, ended: head.body.ending }
}

/** A head as it was opened, held to its shape; none where it is anything else. */
export const readHead = (value: unknown): CopyHead | undefined => {
  if (!isRecord(value)) return undefined
  const of = copyOfFields(value)
  if (of === undefined || !isCount(value["stamp"])) return undefined
  const stamp = value["stamp"]
  if (hasKeys(value, ["playId", "gen", "device", "stamp", "ended"])) {
    const ending = value["ended"]
    return typeof ending === "string" && ENDINGS.includes(ending) ? { ...of, stamp, body: { type: "ended", ending: ending as Ending } } : undefined
  }
  if (!hasKeys(value, ["playId", "gen", "device", "stamp", "play", "pieces", "tail"])) return undefined
  const [play, pieces, tail] = [value["play"], value["pieces"], value["tail"]]
  if (!isRecord(play) || !Array.isArray(pieces) || !pieces.every((hash) => typeof hash === "string" && HEX64.test(hash)) || !isLines(tail)) return undefined
  return { ...of, stamp, body: { type: "play", play: play as { readonly [key: string]: Json }, pieces: pieces as readonly string[], tail } }
}

/** A piece as it is sealed. */
export const pieceJson = (piece: CopyPiece): Json => ({ playId: piece.playId, gen: piece.gen, device: piece.device, index: piece.index, lines: [...piece.lines] })

/** A piece as it was opened, held to its shape; none where it is anything else. */
export const readPiece = (value: unknown): CopyPiece | undefined => {
  if (!isRecord(value) || !hasKeys(value, ["playId", "gen", "device", "index", "lines"])) return undefined
  const of = copyOfFields(value)
  const [index, lines] = [value["index"], value["lines"]]
  return of !== undefined && isCount(index) && isLines(lines) ? { ...of, index, lines } : undefined
}

/** The hash a head names a piece by: of its lines' canonical JSON. */
export const pieceHash = (lines: readonly string[]): string => digestOf([...lines])

const jsonBytes = (lines: readonly string[]): number => utf8ToBytes(canonicalJson([...lines])).length

/**
 * A log's lines in pieces, each as many lines from where the last ended as
 * stay within `PIECE_BYTES`: taken from the first line on, so that a log
 * that only grew keeps every piece but its last as it was. A line too long
 * for a piece of its own is one anyway, which no seal will carry.
 */
export const logPieces = (log: string): readonly (readonly string[])[] =>
  linesOf(log).reduce<readonly (readonly string[])[]>((pieces, line) => {
    const last = pieces.at(-1)
    return last !== undefined && jsonBytes([...last, line]) <= PIECE_BYTES ? [...pieces.slice(0, -1), [...last, line]] : [...pieces, [line]]
  }, [])

/** A play as a copy carries it: as the device keeps it, without its log and the history of its log. */
export const copiedPlayOf = (draft: PlayDraft): { readonly [key: string]: Json } => {
  const { log: _log, history: _history, ...rest } = draft
  return JSON.parse(JSON.stringify(rest)) as { readonly [key: string]: Json }
}

/** The play a head and its pieces come to; none until a piece it names is held, or where what they come to is no play of the head's id. */
export const assembledPlay = (head: CopyHead, pieces: ReadonlyMap<number, CopyPiece>): PlayDraft | undefined => {
  if (head.body.type !== "play") return undefined
  const lines = head.body.pieces.map((hash, index) => ((piece) => (piece !== undefined && pieceHash(piece.lines) === hash ? piece.lines : undefined))(pieces.get(index)))
  if (lines.some((each) => each === undefined)) return undefined
  const play = readPlayDraft({ ...head.body.play, log: textOf([...lines.flatMap((each) => each ?? []), ...head.body.tail]) })
  return play?.id === head.playId ? play : undefined
}

/** How a head ranks among the heads of its play: by generation, and in one generation by the hash of the play and its device, the same on every device (PROTOCOL.md §6.2). */
const rankOf = (head: CopyOf): string => `${String(head.gen).padStart(16, "0")}:${bytesToHex(sha256(utf8ToBytes(`${head.playId}:${head.device}`)))}`

/** Whether one head is above another: its device holds the play over the other's. */
export const isAbove = (one: CopyOf, other: CopyOf): boolean => rankOf(one) > rankOf(other)

/** The days whose lines a device reads on a business day: it, the day before and the day before that (PROTOCOL.md §6). */
export const playsDaysOf = (day: IsoDate): readonly IsoDate[] => [day, previousDay(day), previousDay(previousDay(day))]

/** When a copy may be let go of by the relay: the start of the UTC day three days after its play's business day, so that no hour is told. */
export const playsExpiration = (day: IsoDate): number => {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number]
  return Date.UTC(year, month - 1, date + 3) / 1000
}

/** When a copy is said to be made: now rounded down to ten seconds, and later than the last at its address (PROTOCOL.md §1.2, §3.4). */
export const copyTime = (nowSeconds: number, last: number | undefined): number => Math.max(Math.floor(nowSeconds / 10) * 10, (last ?? 0) + 1)

/** How many lines of a log another does not have, each counted as often as it is missing: what a device yielding a play lost of it. */
export const linesLost = (mine: string, theirs: string): number => {
  const left = linesOf(theirs).reduce((counted, line) => counted.set(line, (counted.get(line) ?? 0) + 1), new Map<string, number>())
  return linesOf(mine).filter((line) => {
    const count = left.get(line) ?? 0
    left.set(line, count - 1)
    return count <= 0
  }).length
}
