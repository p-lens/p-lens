import {
  type Coordinates,
  inDirectoryOrder,
  isPrefecture,
  isWritableParlorName,
  type ParlorList,
  type Rejection,
  type SharedParlor,
  type SharedParlorId,
} from "../../core/parlor/shared"
import type { SubmissionId } from "../../core/parlor/parlor"
import { Err, Ok, type Result } from "../../core/result/result"
import type { KeptList, ParlorCache } from "../port/parlor-cache"
import type { DirectoryError, ParlorDirectory } from "../port/parlor-directory"

/** What the directory needs from outside: where the list is published, how to ask, how long to wait, and where to keep it. */
export interface JsonlDirectoryPorts {
  /** Where `parlors.jsonl`, `unplaced.jsonl` and `rejections.jsonl` are published, ending in a slash. */
  readonly base: string
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long the list is waited for, in milliseconds, before a reading of it is given up. */
  readonly answerWithin: number
  /** How long a look at the published list stands, in milliseconds, before it is looked at again behind the device's copy. */
  readonly freshFor: number
  /** The moment, in milliseconds, for telling how old a reading is. */
  readonly now: () => number
  readonly cache: ParlorCache
}

type Json = Readonly<Record<string, unknown>>

const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string => typeof value === "string"

const isFilledText = (value: unknown): value is string => isText(value) && value.trim() !== ""

/** Japan, generously boxed: a parlor placed outside it is a mistake in the list. */
const inJapan = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === "number" && typeof longitude === "number" && latitude >= 20 && latitude <= 46 && longitude >= 122 && longitude <= 154

const jsonOf = (line: string): unknown => {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

/** A list of text, or none where the field is left out; anything else is not a list of text. */
const textsOf = (value: unknown): readonly string[] | undefined =>
  value === undefined ? [] : Array.isArray(value) && value.every(isText) ? value.map((text) => text.trim()).filter((text) => text !== "") : undefined

/**
 * The name a parlor goes by and the other names it is still found by: the
 * operator's own name wherever the list gives one a book could write, with
 * the list's name kept as a search word; otherwise the list's name alone.
 */
const namedBy = (name: string, officialName: unknown): { readonly name: string; readonly others: readonly string[] } => {
  const official = isFilledText(officialName) ? officialName.trim() : undefined
  return official === undefined || official === name || !isWritableParlorName(official) ? { name, others: [] } : { name: official, others: [name] }
}

/** A line's position: where it is, none where the line gives none, or `misplaced` where what it gives is not a place in Japan. */
const locationOf = (lat: unknown, lon: unknown): Coordinates | undefined | "misplaced" => {
  if (lat === undefined && lon === undefined) return undefined
  return inJapan(lat, lon) && typeof lat === "number" && typeof lon === "number" ? { latitude: lat, longitude: lon } : "misplaced"
}

/** One line read as a parlor, or undefined if it is not one a book could write. A line with no position is a parlor the list has not placed yet. */
const parlorOf = (line: string): SharedParlor | undefined => {
  const value = jsonOf(line)
  if (!isJson(value)) return undefined
  const { id, name, officialName, reading, keywords, prefecture, address, lat, lon, submissions } = value
  const words = textsOf(keywords)
  const made = textsOf(submissions)
  const location = locationOf(lat, lon)
  if (!isFilledText(name)) return undefined
  const named = namedBy(name.trim(), officialName)
  return isFilledText(id) &&
    isWritableParlorName(named.name) &&
    isFilledText(reading) &&
    words !== undefined &&
    isText(prefecture) &&
    isPrefecture(prefecture) &&
    isFilledText(address) &&
    location !== "misplaced" &&
    made !== undefined
    ? {
        id: id.trim() as SharedParlorId,
        name: named.name,
        reading: reading.trim(),
        keywords: [...words, ...named.others],
        prefecture,
        address: address.trim(),
        location,
        submissions: made as readonly SubmissionId[],
      }
    : undefined
}

const rejectionOf = (line: string): Rejection | undefined => {
  const value = jsonOf(line)
  if (!isJson(value) || !isFilledText(value["submission"])) return undefined
  const reason = value["reason"]
  return { submission: value["submission"].trim() as SubmissionId, reason: isFilledText(reason) ? reason.trim() : undefined }
}

/**
 * The items a JSONL file holds, one per line. A line that is not one is
 * passed over rather than refuse the rest: the list lives in another
 * repository, and one bad line there must not take everything away here.
 * An item listed twice under one key is kept once, as first listed.
 */
const itemsOf = <T>(text: string, read: (line: string) => T | undefined, key: (item: T) => string): readonly T[] =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(read)
    .filter((item): item is T => item !== undefined)
    .filter((item, index, all) => all.findIndex((other) => key(other) === key(item)) === index)

export const parlorsOfJsonl = (text: string): readonly SharedParlor[] => itemsOf(text, parlorOf, (parlor) => parlor.id)

export const rejectionsOfJsonl = (text: string): readonly Rejection[] => itemsOf(text, rejectionOf, (rejection) => rejection.submission)

/** A file of the list as it answered: its text, and the version its publisher gave it, where it gave one. A file that is not there is `undefined`, which for the rejections means none yet. */
interface Sent {
  readonly text: string
  readonly version: string | undefined
}

type Fetched = Result<Sent | undefined, DirectoryError>

/** The files the list is published as. */
const FILES = ["parlors.jsonl", "unplaced.jsonl", "rejections.jsonl"] as const

/** What says a file is not there, where its version would be. */
const ABSENT = "-"

/**
 * A list's version, from each of its files' own: all of them, in order, or
 * none where the file the list cannot do without gave none — a publisher
 * that tells no versions is read whole every time.
 */
const versionOf = (versions: readonly (string | undefined)[]): string | undefined => (versions[0] === undefined ? undefined : versions.map((version) => version ?? ABSENT).join(" "))

/** Why the list could not be read: the parlors' own failure first, a list not published, or the rejections' failure. */
const failureOf = (parlors: Fetched, rejections: Fetched): DirectoryError => {
  if (!parlors.ok) return parlors.error
  if (parlors.value === undefined) return { type: "unavailable", detail: "parlors.jsonl is not published" }
  return rejections.ok ? { type: "unavailable", detail: "the list could not be read" } : rejections.error
}

/**
 * The parlor list, read from where it is published: the parlors placed on
 * the map, then those not placed yet — a file that may be missing, or fail,
 * without the placed ones being lost for it.
 *
 * The copy last read is kept on the device, and once there is one it is
 * what is listed, at once: a parlor hall's network must never leave the
 * app waiting, and the list is megabytes that change a few times a week.
 * The published list is then looked at behind it, no more often than
 * `freshFor`: only its files' versions are asked for, a few hundred bytes,
 * and the files themselves are read, and the copy replaced, only where a
 * version has moved. What that brings is listed from the next asking on.
 * Only a device with no copy waits for the network. Everyone reads the
 * same files, so which submission a device waits on stays on the device.
 */
export const createJsonlDirectory = (ports: JsonlDirectoryPorts): ParlorDirectory => {
  const held: { kept: KeptList | undefined; lookedAt: number | undefined; looking: Promise<Result<ParlorList, DirectoryError>> | undefined } = {
    kept: undefined,
    lookedAt: undefined,
    looking: undefined,
  }

  const asked = async (file: string, method: "GET" | "HEAD"): Promise<Fetched> => {
    try {
      const response = await ports.request(`${ports.base}${file}`, { method, signal: AbortSignal.timeout(ports.answerWithin) })
      if (response.status === 404) return Ok(undefined)
      if (!response.ok) return Err({ type: "unavailable", detail: `${file} answered ${String(response.status)}` })
      return Ok({ text: method === "HEAD" ? "" : await response.text(), version: response.headers.get("ETag") ?? undefined })
    } catch (cause) {
      return Err({ type: "unavailable", detail: String(cause) })
    }
  }

  const versionsOf = (files: readonly Fetched[]): string | undefined => (files.every((file) => file.ok) ? versionOf(files.map((file) => (file.ok ? file.value?.version : undefined))) : undefined)

  /** The published list's version as it stands, asked for without its files; none where it cannot be told. */
  const versionNow = async (): Promise<string | undefined> => versionsOf(await Promise.all(FILES.map((file) => asked(file, "HEAD"))))

  /** The published list read whole and kept, in the order it is listed in; or why it could not be read. */
  const read = async (): Promise<Result<ParlorList, DirectoryError>> => {
    const [parlors, unplaced, rejections] = await Promise.all([asked(FILES[0], "GET"), asked(FILES[1], "GET"), asked(FILES[2], "GET")])
    if (!parlors.ok || parlors.value === undefined || !rejections.ok) return Err(failureOf(parlors, rejections))
    const lines = `${parlors.value.text}\n${unplaced.ok ? (unplaced.value?.text ?? "") : ""}`
    const list: ParlorList = { parlors: parlorsOfJsonl(lines), rejections: rejectionsOfJsonl(rejections.value?.text ?? "") }
    const version = versionsOf([parlors, unplaced, rejections])
    await ports.cache.replace({ list, version })
    held.kept = { list: { ...list, parlors: inDirectoryOrder(list.parlors) }, version }
    held.lookedAt = ports.now()
    return Ok(held.kept.list)
  }

  /** The published list looked at: left as it is where its version has not moved from the copy's, read whole where it has, or where either has none. */
  const looked = async (): Promise<Result<ParlorList, DirectoryError>> => {
    const copy = held.kept
    if (copy === undefined || copy.version === undefined) return read()
    const version = await versionNow()
    if (version !== copy.version) return read()
    held.lookedAt = ports.now()
    return Ok(copy.list)
  }

  /** One look at the published list at a time: whoever asks while one runs is given that one. */
  const looking = (): Promise<Result<ParlorList, DirectoryError>> => {
    const running = held.looking ?? looked().finally(() => (held.looking = undefined))
    held.looking = running
    return running
  }

  /** The device's copy, read once and held; none where it has none yet. */
  const kept = async (): Promise<KeptList | undefined> => {
    if (held.kept !== undefined) return held.kept
    const stored = await ports.cache.read()
    if (!stored.ok || stored.value.list.parlors.length === 0) return undefined
    held.kept = { list: { ...stored.value.list, parlors: inDirectoryOrder(stored.value.list.parlors) }, version: stored.value.version }
    return held.kept
  }

  const stale = (): boolean => held.lookedAt === undefined || ports.now() - held.lookedAt >= ports.freshFor

  const list: ParlorDirectory["list"] = async () => {
    const copy = await kept()
    if (copy === undefined) return looking()
    if (stale()) void looking()
    return Ok(copy.list)
  }

  return { list }
}
