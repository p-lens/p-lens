import type { MemberId } from "../book/book"
import type { CatalogTarget } from "../catalog/catalog"
import type { CheckMark, HeldMark, MyMarks } from "../formula/standing"
import type { BookFiles } from "../journal/layout"

/**
 * Where a book says what its members have marked in the shared catalog —
 * the formulas and 設定配分 adopted and rejected, the formulas found good
 * and found wanting — one line of JSON a press, oldest first and only ever
 * added to, so what each of two devices added comes together as lines do
 * in a journal. Nothing else holds a person's marks: what they hold now is
 * these lines read through (`marksOf`), on every device the book reaches,
 * so a mark made on one is seen on the others and is not made twice. It is
 * the book's own record of what was done, which is why the book's activity
 * says nothing of it. No journal includes it, so hledger passes it by.
 */
export const MARKS_LOG = "logs/marks.jsonl"

/** The version of a line's own shape, written on each line as the activity's is; a line of another version is passed over. */
const LINE_VERSION = 1

/** A mark a press sets or clears, or — a check — gives for good. */
export type PressedMark = HeldMark | CheckMark

/** What a press did, as the word its line says it in: a mark given, or one that can be, taken back. */
export type MarkDeed = `${PressedMark}-given` | `${HeldMark}-taken-back`

const DEEDS: readonly MarkDeed[] = ["adoption-given", "adoption-taken-back", "rejection-given", "rejection-taken-back", "verification-given", "refutation-given"]

/**
 * One press in a book, shaped as a line of the book's activity is: a line
 * that can be pointed at by its id, when and by whom, what was done as a
 * word of its own, and what it was done to — with its machine, since an
 * adoption is one a machine.
 */
export interface MarkLine {
  readonly id: string
  readonly at: string
  readonly by: MemberId
  readonly did: MarkDeed
  readonly target: CatalogTarget
  readonly machineId: string
}

/** The word for a mark set or cleared; none for clearing a check, which stands once given. */
export const deedOf = (mark: PressedMark, on: boolean): MarkDeed | undefined => {
  if (on) return `${mark}-given`
  return mark === "adoption" || mark === "rejection" ? `${mark}-taken-back` : undefined
}

/** What a deed did, as the shared catalog is told it: which mark, and whether it is now set. */
export const pressOf = (did: MarkDeed): { readonly mark: PressedMark; readonly on: boolean } => {
  switch (did) {
    case "adoption-given":
      return { mark: "adoption", on: true }
    case "adoption-taken-back":
      return { mark: "adoption", on: false }
    case "rejection-given":
      return { mark: "rejection", on: true }
    case "rejection-taken-back":
      return { mark: "rejection", on: false }
    case "verification-given":
      return { mark: "verification", on: true }
    case "refutation-given":
      return { mark: "refutation", on: true }
  }
}

const lineText = (line: MarkLine): string =>
  JSON.stringify({ v: LINE_VERSION, id: line.id, at: line.at, by: line.by, did: line.did, mark: { target: line.target.type, id: line.target.id, machine: line.machineId } })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const markedOf = (value: unknown): Pick<MarkLine, "target" | "machineId"> | undefined => {
  if (!isRecord(value)) return undefined
  const { target, id, machine } = value
  return (target === "formula" || target === "distribution") && typeof id === "string" && id !== "" && typeof machine === "string" && machine !== ""
    ? { target: { type: target, id }, machineId: machine }
    : undefined
}

/** A line read as a press; one whose word this version does not know says nothing it can go by, and is passed over. */
const lineOf = (text: string): MarkLine | undefined => {
  const value = parsed(text)
  if (!isRecord(value) || value["v"] !== LINE_VERSION) return undefined
  const { id, at, by, did } = value
  if (typeof id !== "string" || id === "" || typeof at !== "string" || Number.isNaN(Date.parse(at)) || typeof by !== "string") return undefined
  const marked = markedOf(value["mark"])
  const deed = DEEDS.find((each) => each === did)
  return marked !== undefined && deed !== undefined ? { id, at, by: by as MemberId, did: deed, ...marked } : undefined
}

/** Every line of a marks log that reads as one, in the order written; a line that does not read is passed over. */
const linesOf = (text: string): readonly MarkLine[] =>
  text.split("\n").flatMap((line) => {
    const found = line.trim() === "" ? undefined : lineOf(line)
    return found === undefined ? [] : [found]
  })

/** What a person holds on one thing, with where it is: an adoption lets go of the others of its kind on the same machine. */
interface Held {
  readonly target: CatalogTarget["type"]
  readonly machineId: string
  readonly marks: MyMarks
}

/** No mark at all: what a person holds on a thing they never pressed. */
export const NO_MARKS: MyMarks = { adopted: false, rejected: false, verified: false, refuted: false }

const pressed = (marks: MyMarks, did: MarkDeed): MyMarks => {
  switch (did) {
    case "adoption-given":
      return { ...marks, adopted: true }
    case "adoption-taken-back":
      return { ...marks, adopted: false }
    case "rejection-given":
      return { ...marks, rejected: true }
    case "rejection-taken-back":
      return { ...marks, rejected: false }
    case "verification-given":
      return { ...marks, verified: true }
    case "refutation-given":
      return { ...marks, refuted: true }
  }
}

const afterLine = (held: ReadonlyMap<string, Held>, line: MarkLine): ReadonlyMap<string, Held> => {
  const others =
    line.did === "adoption-given"
      ? [...held].map(([id, each]): [string, Held] => (each.machineId === line.machineId && each.target === line.target.type ? [id, { ...each, marks: { ...each.marks, adopted: false } }] : [id, each]))
      : [...held]
  const current = held.get(line.target.id)?.marks ?? NO_MARKS
  return new Map(others).set(line.target.id, { target: line.target.type, machineId: line.machineId, marks: pressed(current, line.did) })
}

/**
 * What a member of a book holds on each thing they pressed, by its id: the
 * lines that are theirs made in the order they were pressed — by when, not
 * by where a line sits, since two devices' lines come together in no order
 * of time. An adoption lets go of the member's other adoption of its kind
 * on the same machine and of nothing else; a check given stands.
 */
export const marksOf = (files: BookFiles, member: MemberId): ReadonlyMap<string, MyMarks> => {
  const theirs = linesOf(files[MARKS_LOG] ?? "")
    .filter((line) => line.by === member)
    .toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at))
  return new Map([...theirs.reduce(afterLine, new Map<string, Held>())].map(([id, held]) => [id, held.marks]))
}

/** A book's files with one more press written in its marks. */
export const withMarkLine = (files: BookFiles, line: MarkLine): BookFiles => {
  const held = files[MARKS_LOG] ?? ""
  return { ...files, [MARKS_LOG]: `${held === "" || held.endsWith("\n") ? held : `${held}\n`}${lineText(line)}\n` }
}
