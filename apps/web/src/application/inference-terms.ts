import type { BookId } from "../core/book/book"
import { BOOK_SETTINGS_FILE, bookSettingsOf, withInferenceTerms, type InferenceTerms, type KeptInferenceTerms } from "../core/book/settings"
import type { PlayGameKind } from "../core/play/play"
import { Ok, mapOk } from "../core/result/result"
import type { BookSession, ProposedChange } from "./book-session"
import type { Outcome } from "./errors"

/** The terms a book keeps for a tally typed in by hand of each game; none where its settings keep none, or do not read. */
export const keptInferenceTermsOf = (files: ProposedChange["files"]): KeptInferenceTerms => ((settings) => (settings.ok ? settings.value.inferenceTerms : {}))(bookSettingsOf(files[BOOK_SETTINGS_FILE]))

/** The terms a tally typed in by hand was weighed on, with its game. */
export interface TermsUsed {
  readonly game: PlayGameKind
  readonly terms: InferenceTerms
}

const sameTerms = (kept: InferenceTerms | undefined, terms: InferenceTerms): boolean => kept?.rentedPerThousand === terms.rentedPerThousand && kept.exchangedPerHundred === terms.exchangedPerHundred

/**
 * The terms a tally typed in by hand of a game was weighed on, written into
 * the settings of the book it went into as one change to that book — kept
 * in its history, backed up and synced like any other, every other game
 * and field left as it was — where they are not what the book keeps
 * already, so that the next tally of that game opens on them.
 */
export const keepInferenceTerms = async (session: BookSession, bookId: BookId, used: TermsUsed): Promise<Outcome<void>> => {
  const kept = await session.read(bookId, async (_journal, stored) => Ok(keptInferenceTermsOf(stored.files)))
  if (!kept.ok) return kept
  if (sameTerms(kept.value[used.game], used.terms)) return Ok(undefined)
  const written = await session.write(bookId, async (_journal, stored) =>
    mapOk(withInferenceTerms(stored.files[BOOK_SETTINGS_FILE], used.game, used.terms), (settings) => ({ files: { ...stored.files, [BOOK_SETTINGS_FILE]: settings }, intent: { type: "inference-terms-set" as const, game: used.game } })),
  )
  return written.ok ? Ok(undefined) : written
}

/**
 * A tally typed in by hand written, and then the terms it was weighed on
 * kept: what the writing came to is the tally's, the terms being kept or
 * not beside it, so a tally written is never reported as refused.
 */
export const writtenKeepingTerms = async <T>(session: BookSession, bookId: BookId, writing: Promise<Outcome<T>>, used: TermsUsed | undefined): Promise<Outcome<T>> => {
  const written = await writing
  if (written.ok && used !== undefined) await keepInferenceTerms(session, bookId, used)
  return written
}
