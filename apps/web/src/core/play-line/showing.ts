import { patchBetween, patched } from "../change/patch"
import type { PlayId } from "../play/play"
import { linesOf, textOf } from "../text/line-diff"
import type { DeviceId } from "./device"
import { readShownPlay, type PlayLineEntry, type ShownPlay } from "./entry"
import { handoversOf } from "./following"

/**
 * An entry as a line is kept once read: a patch taken as the play it makes,
 * with how many patches it comes after the whole showing it was built
 * from; every other entry as it was written.
 */
export type LineEntry =
  | Exclude<PlayLineEntry, { readonly type: "patched" }>
  | { readonly type: "patched"; readonly by: DeviceId; readonly at: string; readonly play: ShownPlay; readonly patches: number }

/** An entry at the place the relay gave it on its line. */
export interface Placed<E> {
  readonly seq: number
  readonly entry: E
}

/** A play's showing on a line, whole or patched, with the play it comes to. */
type Showing = Placed<Extract<LineEntry, { readonly type: "shown" | "patched" }>>

/**
 * How many patches of a play a holder puts in a row before it shows the
 * play whole again: a device that could not open one, and so none after
 * it, keeps the copy it has until then, and nothing is asked of it.
 */
const WHOLE_EVERY = 20

/**
 * A part's name and how its lines say it: its value whole, one item of a
 * list, or one line of a text of several. The value runs to the line's end
 * whatever it holds, U+2028, U+2029 and a carriage return among it, which
 * JSON leaves raw or a log may carry.
 */
const PART_LINE = /^([A-Za-z]+)([=+>])(.*)$/s

type Mark = "=" | "+" | ">"

const partLines = (name: string, value: unknown): readonly string[] => {
  if (Array.isArray(value) && value.length > 0) return value.map((item) => `${name}+${JSON.stringify(item)}`)
  if (typeof value === "string" && value.includes("\n")) return value.split("\n").map((line) => `${name}>${line}`)
  return [`${name}=${JSON.stringify(value)}`]
}

/** Names in the order of their code units, the same on every device whatever its locale. */
const byCodeUnits = (one: string, other: string): number => (one < other ? -1 : one > other ? 1 : 0)

/**
 * A play shown, as a text of a line for each thing in it: each part by
 * its name, in order of name, its value on a line of its own — a list an
 * item to a line, and a text of several lines, such as its log, a line to
 * a line — so that a reading put in changes a line or two of it.
 */
export const shownTextOf = (play: ShownPlay): string =>
  textOf(
    Object.entries(play)
      .filter(([, value]) => value !== undefined)
      .toSorted(([one], [other]) => byCodeUnits(one, other))
      .flatMap(([name, value]) => partLines(name, value)),
  )

interface PartLine {
  readonly name: string
  readonly mark: Mark
  readonly value: string
}

const partLineOf = (line: string): PartLine | undefined => {
  const found = PART_LINE.exec(line)
  return found === null ? undefined : { name: found[1] ?? "", mark: (found[2] ?? "=") as Mark, value: found[3] ?? "" }
}

/** The lines of a text, each run of lines of one part together; none where a part's lines are not all together and of one kind, or its value whole is on more than one. */
const partsOf = (lines: readonly PartLine[]): readonly (readonly PartLine[])[] | undefined => {
  const runs = lines.reduce<readonly (readonly PartLine[])[]>((so, line) => {
    const last = so.at(-1)
    return last?.[0]?.name === line.name ? [...so.slice(0, -1), [...last, line]] : [...so, [line]]
  }, [])
  const names = runs.map((run) => run[0]?.name)
  const whole = runs.every((run) => run.every((line) => line.mark === run[0]?.mark) && (run[0]?.mark !== "=" || run.length === 1)) && new Set(names).size === names.length
  return whole ? runs : undefined
}

const valueOf = (run: readonly PartLine[]): unknown => {
  const mark = run[0]?.mark
  if (mark === ">") return run.map((line) => line.value).join("\n")
  if (mark === "+") return run.map((line) => JSON.parse(line.value) as unknown)
  return JSON.parse(run[0]?.value ?? "") as unknown
}

/** A play read back from its text as a showing's: none where the text is not one, or the play it says is none this app reads. */
export const readShownText = (text: string): ShownPlay | undefined => {
  const lines = linesOf(text).map(partLineOf)
  if (lines.some((line) => line === undefined)) return undefined
  const runs = partsOf(lines.flatMap((line) => (line === undefined ? [] : [line])))
  if (runs === undefined) return undefined
  try {
    return readShownPlay(Object.fromEntries(runs.map((run) => [run[0]?.name ?? "", valueOf(run)])))
  } catch {
    return undefined
  }
}

const isShowing = (placed: Placed<LineEntry>): placed is Showing => placed.entry.type === "shown" || placed.entry.type === "patched"

/** The showing of a play by a device at a place on a line, if that is what is there. */
const showingAt = (entries: readonly Placed<LineEntry>[], seq: number, by: DeviceId, playId: PlayId): Showing | undefined => {
  const found = entries.find((placed) => placed.seq === seq)
  return found !== undefined && isShowing(found) && found.entry.by === by && found.entry.play.id === playId ? found : undefined
}

const patchesOf = (showing: Showing): number => (showing.entry.type === "patched" ? showing.entry.patches : 0)

/**
 * A patch taken as the play it makes: made on the text of the showing it
 * names, which must be one of that play by the same device, and must hold
 * what the patch takes away. None where any of that is not so — a showing
 * missed, or one that could not be opened — and nothing is guessed: the
 * play stands as it was last shown whole or patched until it is next
 * shown whole.
 */
const patchTaken = (entries: readonly Placed<LineEntry>[], entry: Extract<PlayLineEntry, { readonly type: "patched" }>): LineEntry | undefined => {
  const base = showingAt(entries, entry.on, entry.by, entry.playId)
  if (base === undefined) return undefined
  const made = patched(shownTextOf(base.entry.play), { path: entry.playId, created: false, hunks: entry.hunks })
  const play = made.ok ? readShownText(made.value) : undefined
  return play === undefined || play.id !== entry.playId ? undefined : { type: "patched", by: entry.by, at: entry.at, play, patches: patchesOf(base) + 1 }
}

/**
 * Entries read onto a line as it is kept, in the order the relay put them:
 * a patch taken as the play it makes, against what the line already has,
 * and passed over where it does not fit; every other entry as it is.
 */
export const readOnto = (kept: readonly Placed<LineEntry>[], given: readonly Placed<PlayLineEntry>[]): readonly Placed<LineEntry>[] =>
  given
    .toSorted((one, other) => one.seq - other.seq)
    .reduce<readonly Placed<LineEntry>[]>((so, { seq, entry }) => {
      const taken = entry.type === "patched" ? patchTaken(so, entry) : entry
      return taken === undefined ? so : [...so, { seq, entry: taken }]
    }, kept)

/** The latest showing of a play on a line by a device. */
const lastShowingBy = (entries: readonly Placed<LineEntry>[], by: DeviceId, playId: PlayId): Showing | undefined =>
  entries.filter(isShowing).findLast((placed) => placed.entry.by === by && placed.entry.play.id === playId)

/** Whether a device has shown a play on a line. */
export const hasShownOn = (entries: readonly Placed<LineEntry>[], by: DeviceId, playId: PlayId): boolean => lastShowingBy(entries, by, playId) !== undefined

/**
 * How a device shows a play it holds on a line: as a patch of its last
 * showing of it there, or whole. Whole the first time it shows it on the
 * line, the first time since it took the play up — at another handover
 * than it last showed it at — after so many patches in a row, and where a
 * patch would come to no less than the play itself.
 */
export const showingOf = (entries: readonly Placed<LineEntry>[], by: DeviceId, at: string, play: ShownPlay): PlayLineEntry => {
  const whole: PlayLineEntry = { type: "shown", by, at, play }
  const base = lastShowingBy(entries, by, play.id)
  if (base === undefined || handoversOf(base.entry.play) !== handoversOf(play) || patchesOf(base) + 1 >= WHOLE_EVERY) return whole
  const text = shownTextOf(play)
  const { hunks } = patchBetween(play.id, shownTextOf(base.entry.play), text)
  return JSON.stringify(hunks).length < text.length ? { type: "patched", by, at, playId: play.id, on: base.seq, hunks } : whole
}
