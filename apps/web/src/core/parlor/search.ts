import type { SubmissionId } from "./parlor"
import { searchKeyOf } from "../text/search-key"
import type { SharedParlor } from "./shared"

/** Whether a parlor is found by what was typed: by its name, its reading or any word it is searched by. */
export const parlorMatches = (parlor: SharedParlor, typed: string): boolean => {
  const wanted = searchKeyOf(typed)
  return wanted === "" || [parlor.name, parlor.reading, ...parlor.keywords].some((text) => searchKeyOf(text).includes(wanted))
}

/**
 * Whether two names are one name: a book keeps a parlor's savings under its
 * name, and names a space or a width apart would be two accounts nobody
 * could tell apart.
 */
export const sameParlorName = (left: string, right: string): boolean => searchKeyOf(left) === searchKeyOf(right)

/**
 * The listed parlor already going by the name a submission was made under,
 * unless it is the parlor the list made from that very submission. The list
 * has one parlor to a name, so such a submission is either that parlor, to
 * be chosen from the list, or another, to be submitted with its branch.
 */
export const namesakeOf = (parlors: readonly SharedParlor[], name: string, submission: SubmissionId): SharedParlor | undefined =>
  parlors.find((parlor) => sameParlorName(parlor.name, name) && !parlor.submissions.includes(submission))
