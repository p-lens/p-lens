import { isFilePatch, type FilePatch } from "../../../core/change/patch"
import type { BookFiles } from "../../../core/journal/layout"
import { digestOf, type Json } from "./canonical"

/** A change's id: the SHA-256 of its canonical JSON (PROTOCOL.md §5.1). */
export type ChangeId = string & { readonly __brand: "ChangeId" }

/** A book's whole state, as it leaves a change. */
export type StateDigest = string & { readonly __brand: "StateDigest" }

/** What every change carries: what it was made on, by whom, when, and the state it leaves. */
interface Made {
  readonly parents: readonly ChangeId[]
  /** The author's public key; empty on a merge any device would make alike. */
  readonly writer: string
  /** Seconds since the epoch. */
  readonly at: number
  readonly result: StateDigest
}

/** A book whole: where a line starts, and where it starts again every so often so that nobody reads it from its beginning. */
export interface Base extends Made {
  readonly sort: "base"
  /** The book's id on the devices, kept by a device joining. */
  readonly book: string
  readonly files: BookFiles
}

/** A book written on one device: its patches made on its one parent's state. */
export interface Edit extends Made {
  readonly sort: "edit"
  readonly patches: readonly FilePatch[]
}

/** Two heads brought together: its patches made on its first parent's state. */
export interface Merge extends Made {
  readonly sort: "merge"
  readonly patches: readonly FilePatch[]
}

/** One change on a book's line (PROTOCOL.md §5.1). */
export type Change = Base | Edit | Merge

/** A book's state as its digest: the SHA-256 of its files as canonical JSON. */
export const stateDigestOf = (files: BookFiles): StateDigest => digestOf(files) as StateDigest

export const changeIdOf = (change: Change): ChangeId => digestOf(change as unknown as Json) as ChangeId

const HEX64 = /^[0-9a-f]{64}$/

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is ChangeId => typeof value === "string" && HEX64.test(value)

const isFiles = (value: unknown): value is BookFiles => isRecord(value) && Object.values(value).every((text) => typeof text === "string")

const keysAre = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => Object.keys(value).length === keys.length && keys.every((key) => key in value)

const PARENTS_OF: Readonly<Record<Change["sort"], (count: number) => boolean>> = {
  base: (count) => count <= 1,
  edit: (count) => count === 1,
  merge: (count) => count === 2,
}

const madeOf = (value: Readonly<Record<string, unknown>>, sort: Change["sort"]): Made | undefined => {
  const [parents, writer, at, result] = [value["parents"], value["writer"], value["at"], value["result"]]
  if (!Array.isArray(parents) || !parents.every(isId) || !PARENTS_OF[sort](parents.length) || new Set(parents).size !== parents.length) return undefined
  if (typeof writer !== "string" || !(HEX64.test(writer) || (sort === "merge" && writer === ""))) return undefined
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0 || !HEX64.test(String(result))) return undefined
  return { parents, writer, at, result: result as StateDigest }
}

/** A patch as PLN-1 carries it, and nothing else that came with it: what is hashed is what every device reads. */
const plainPatch = (patch: FilePatch): FilePatch => ({ path: patch.path, created: patch.created, hunks: patch.hunks.map((hunk) => ({ at: hunk.at, removed: hunk.removed, added: hunk.added })) })

const MADE_KEYS = ["sort", "parents", "writer", "at", "result"] as const

/** What came off a line, read as a change, or none where it is not one: nothing that arrives is taken on trust. */
export const readChange = (value: unknown): Change | undefined => {
  if (!isRecord(value)) return undefined
  const sort = value["sort"]
  if (sort === "base") {
    const made = madeOf(value, sort)
    const [book, files] = [value["book"], value["files"]]
    return made !== undefined && keysAre(value, [...MADE_KEYS, "book", "files"]) && typeof book === "string" && book !== "" && isFiles(files) ? { sort, ...made, book, files } : undefined
  }
  if (sort === "edit" || sort === "merge") {
    const made = madeOf(value, sort)
    const patches = value["patches"]
    if (made === undefined || !keysAre(value, [...MADE_KEYS, "patches"]) || !Array.isArray(patches) || !patches.every(isFilePatch)) return undefined
    const sorted = sort === "edit" || (made.parents[0] ?? "") < (made.parents[1] ?? "")
    return sorted ? { sort, ...made, patches: patches.map(plainPatch) } : undefined
  }
  return undefined
}
