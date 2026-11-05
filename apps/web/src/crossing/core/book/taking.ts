import { bookSettingsOf, BOOK_SETTINGS_FILE } from "../../../core/book/settings"
import { BOOK_FILES, type BookFiles } from "../../../core/journal/layout"
import { titleOfMain } from "../../../core/journal/title"
import { canonicalJson } from "./canonical"
import { changeIdOf, stateDigestOf, type Change, type ChangeId, type Edit, type Merge } from "./change"
import { ancestryOf, mergeBaseOf, wholeOf } from "./graph"
import { mergeStates } from "./merge"
import { isEditorIn, rosterOf, ROSTER_FILE } from "./roster"
import { madeOn, patchesBetween, stateOf, type Held, type Known } from "./state"

/** Every whole change, each after its parents: the order a change can be judged in, its parents judged first. */
const parentsFirst = (held: Held, whole: ReadonlySet<ChangeId>): readonly ChangeId[] => {
  const placed = new Set<ChangeId>()
  const order: ChangeId[] = []
  for (const start of [...whole].toSorted()) {
    const stack: ChangeId[] = [start]
    while (stack.length > 0) {
      const at = stack[stack.length - 1] as ChangeId
      if (placed.has(at)) {
        stack.pop()
        continue
      }
      const waiting = (held.get(at)?.parents ?? []).filter((parent) => whole.has(parent) && !placed.has(parent))
      if (waiting.length > 0) {
        stack.push(...waiting)
        continue
      }
      placed.add(at)
      order.push(at)
      stack.pop()
    }
  }
  return order
}

/** What only a book's owner changes, as a state says it: the title, and the book's place and business day among the owner's books (PROTOCOL.md §5.6). */
const ownersPartOf = (files: BookFiles): string => {
  const settings = bookSettingsOf(files[BOOK_SETTINGS_FILE])
  return canonicalJson({
    title: titleOfMain(files[BOOK_FILES.main] ?? "") ?? "",
    settings: settings.ok ? { order: settings.value.order ?? null, businessDayTurn: settings.value.businessDayTurn ?? null } : "unreadable",
  })
}

/** A state's roster file alone: what a roster's merge is worked on. */
const rosterPart = (files: BookFiles): BookFiles => (files[ROSTER_FILE] === undefined ? {} : { [ROSTER_FILE]: files[ROSTER_FILE] })

/**
 * Which of the changes a device holds are taken (PROTOCOL.md §5.6): of those
 * whose ancestry is held whole, each whose parents are taken — a base's only
 * those held, as it holds its state whole — and which its writer may make on
 * what it was made on. Those already trusted — the
 * device's own head and what it rests on — are taken without being judged
 * again; every other change is judged once its parents are, so that every
 * device holding the same changes takes the same ones. A change not taken
 * is never a head, nor is anything made on it.
 */
export const takenOf = (held: Held, owner: string, trusted: ReadonlySet<ChangeId>, known: Known | undefined): ReadonlySet<ChangeId> => {
  const whole = wholeOf(held)
  const taken = new Set([...trusted].filter((id) => whole.has(id)))
  const states = new Map<ChangeId, BookFiles | undefined>()

  const stateAt = (id: ChangeId): BookFiles | undefined => {
    if (states.has(id)) return states.get(id)
    const change = held.get(id)
    const parent = change === undefined || change.sort === "base" ? undefined : states.get(change.parents[0] as ChangeId)
    const fromParent = change !== undefined && change.sort !== "base" && parent !== undefined ? madeOn(parent, change.patches) : undefined
    const worked = fromParent?.ok === true ? fromParent.value : ((found) => (found.ok ? found.value : undefined))(stateOf(held, known, id))
    states.set(id, worked)
    return worked
  }

  const leaves = (id: ChangeId, change: Change): boolean => ((files) => files !== undefined && stateDigestOf(files) === change.result)(stateAt(id))

  const editorOn = (parent: ChangeId, writer: string): boolean => ((files) => files !== undefined && ((roster) => roster !== "unreadable" && isEditorIn(roster, writer))(rosterOf(files[ROSTER_FILE])))(stateAt(parent))

  const editorsEdit = (id: ChangeId, edit: Edit): boolean => {
    const [parent] = edit.parents as [ChangeId]
    const [before, after] = [stateAt(parent), stateAt(id)]
    return (
      before !== undefined &&
      after !== undefined &&
      editorOn(parent, edit.writer) &&
      edit.patches.every((patch) => patch.path !== ROSTER_FILE) &&
      leaves(id, edit) &&
      ownersPartOf(before) === ownersPartOf(after)
    )
  }

  /** The merge two heads come to, worked out again: the one any device makes of them (PROTOCOL.md §5.3). */
  const isTheMerge = (id: ChangeId, merge: Merge): boolean => {
    const [first, second] = merge.parents as [ChangeId, ChangeId]
    const from = mergeBaseOf(held, first, second)
    const [one, other, base] = [stateAt(first), stateAt(second), from === undefined ? {} : stateAt(from)]
    if (one === undefined || other === undefined || base === undefined) return false
    const made = mergeStates(base, one, other)
    if (!made.ok) return false
    const patches = patchesBetween(one, made.value)
    if (!patches.ok) return false
    const again: Merge = { sort: "merge", parents: [first, second], writer: "", at: Math.max(held.get(first)?.at ?? 0, held.get(second)?.at ?? 0), patches: patches.value, result: stateDigestOf(made.value) }
    return changeIdOf(again) === id
  }

  /** A merge an editor settled: theirs to make where its first parent's roster lists them, the roster it leaves the one its parents' merge to. */
  const editorsMerge = (id: ChangeId, merge: Merge): boolean => {
    const [first, second] = merge.parents as [ChangeId, ChangeId]
    const from = mergeBaseOf(held, first, second)
    const [one, other, base, after] = [stateAt(first), stateAt(second), from === undefined ? {} : stateAt(from), stateAt(id)]
    if (one === undefined || other === undefined || base === undefined || after === undefined || !editorOn(first, merge.writer) || !leaves(id, merge)) return false
    const rosters = mergeStates(rosterPart(base), rosterPart(one), rosterPart(other))
    return rosters.ok && rosters.value[ROSTER_FILE] === after[ROSTER_FILE]
  }

  const judged = (id: ChangeId, change: Change): boolean => {
    if (change.writer === owner) return true
    switch (change.sort) {
      case "base":
        return false
      case "edit":
        return editorsEdit(id, change)
      case "merge":
        return change.writer === "" ? isTheMerge(id, change) : editorsMerge(id, change)
    }
  }

  /** Whether a parent leaves its change free to be judged: taken; or, under a base, which holds its state whole, not held at all. */
  const parentAllows = (change: Change, parent: ChangeId): boolean => taken.has(parent) || (change.sort === "base" && !held.has(parent))

  for (const id of parentsFirst(held, whole)) {
    const change = held.get(id)
    if (change === undefined || taken.has(id) || !change.parents.every((parent) => parentAllows(change, parent))) continue
    if (judged(id, change)) taken.add(id)
  }
  return taken
}

/**
 * The changes taken that are on an epoch's floor or made on it (PROTOCOL.md
 * §5.8): the floor, and each change every parent of which is one of them, so
 * that a head is always one every device on the new line can work out.
 */
export const onFloorOf = (held: Held, taken: ReadonlySet<ChangeId>, floor: ChangeId): ReadonlySet<ChangeId> => {
  const below = ancestryOf(held, floor)
  const found = new Set<ChangeId>()
  for (const id of parentsFirst(held, taken)) {
    const change = held.get(id)
    if (id === floor || (change !== undefined && !below.has(id) && change.parents.length > 0 && change.parents.every((parent) => found.has(parent)))) found.add(id)
  }
  return found
}
