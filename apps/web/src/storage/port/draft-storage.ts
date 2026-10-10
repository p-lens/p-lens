import type { PlayDraft } from "../../core/live-play/draft"
import type { PlayId } from "../../core/play/play"
import type { Result } from "../../core/result/result"
import type { StorageError } from "./book-storage"

export type DraftError = StorageError | { readonly type: "draft-missing"; readonly playId: PlayId }

/**
 * Where the day's plays are kept on this device: those still being played,
 * and those recorded since the business day turned, which stay to be set
 * right and recorded again. Work in hand, never part of a book: a draft is
 * let go of once its play is recorded and its day is past.
 */
export interface DraftStorage {
  readonly listDrafts: () => Promise<Result<readonly PlayDraft[], DraftError>>
  readonly readDraft: (id: PlayId) => Promise<Result<PlayDraft, DraftError>>
  readonly createDraft: (draft: PlayDraft) => Promise<Result<void, DraftError>>
  /**
   * Replace a draft, only if its log still reads as `previousLog`: a line
   * written in another tab meanwhile is not written over.
   */
  readonly updateDraft: (draft: PlayDraft, previousLog: string) => Promise<Result<void, DraftError>>
  readonly deleteDraft: (id: PlayId) => Promise<Result<void, DraftError>>
}
