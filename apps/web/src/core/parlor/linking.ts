import type { BookFiles } from "../journal/layout"
import { PARLOR_ID_TAG, PARLOR_SUBMISSION_TAG, type Parlor, type ParlorId, type SubmissionId } from "./parlor"
import type { SharedParlor } from "./shared"

/** A submission a book waits on that the list has now taken, as the parlor it became. */
export interface Link {
  readonly submission: SubmissionId
  readonly id: ParlorId
  /** The parlor's name as the book has it. */
  readonly name: string
}

/** The book's parlors still waiting on a submission that a listed parlor names as one it was made from. */
export const linksFor = (parlors: readonly Parlor[], listed: readonly SharedParlor[]): readonly Link[] =>
  parlors.flatMap((parlor): readonly Link[] => {
    if (parlor.identity.type !== "submitted") return []
    const { submission } = parlor.identity
    const taken = listed.find((candidate) => candidate.submissions.includes(submission))
    return taken === undefined ? [] : [{ submission, id: taken.id as string as ParlorId, name: parlor.name }]
  })

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * A journal file with each link written: the list's id beside every waiting
 * submission tag — on the parlor's account declarations and on its tallies —
 * so the book reads the parlor as listed from then on. Past entries are
 * otherwise left as they are; the submission stays, saying where it came from.
 */
export const linkedText = (text: string, links: readonly Link[]): string =>
  links.reduce(
    (written, link) =>
      written.replace(
        new RegExp(`${PARLOR_SUBMISSION_TAG}: ${escapeRegex(link.submission)}(?=[ \\t]*(,|$))`, "gm"),
        `${PARLOR_SUBMISSION_TAG}: ${link.submission}, ${PARLOR_ID_TAG}: ${link.id}`,
      ),
    text,
  )

/** Every journal file of a book with the links written; a file they do not touch is the same text. */
export const linkedFiles = (files: BookFiles, links: readonly Link[]): BookFiles =>
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path, path.endsWith(".journal") ? linkedText(text, links) : text]))
