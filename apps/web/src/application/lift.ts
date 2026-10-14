import type { ProofError } from "../core/grounds/proof"
import type { OpeningProblem } from "../core/parlor/opening"
import type { TallyError } from "../core/tally/tally"
import type { ReportError } from "../core/report/figures"
import { mapErr, type Result } from "../core/result/result"
import type { Trouble } from "../hledger/protocol/wire"
import type { HistoryError } from "../history/port/history-port"
import type { StorageError } from "../storage/port/book-storage"
import type { DraftError } from "../storage/port/draft-storage"
import type { CatalogError } from "../catalog/port/catalog"
import type { DirectoryError } from "../parlors/port/parlor-directory"
import type { ReasonerFailure } from "../reasoning/protocol/messages"
import type * as PachinkoEngine from "../pachinko-engine/protocol/messages"
import type * as PachislotEngine from "../pachislot-engine/protocol/messages"
import type { Outcome } from "./errors"

/** Each failure lifted into the one the use cases answer with. */
export const fromHledger = <T>(reply: Result<T, Trouble>): Outcome<T> => mapErr(reply, (trouble) => ({ type: "hledger", trouble }))

export const fromStorage = <T>(result: Result<T, StorageError>): Outcome<T> => mapErr(result, (error) => ({ type: "storage", error }))

export const fromDraft = <T>(result: Result<T, DraftError>): Outcome<T> => mapErr(result, (error) => ({ type: "draft", error }))

export const fromDirectory = <T>(result: Result<T, DirectoryError>): Outcome<T> => mapErr(result, (error) => ({ type: "directory", error }))

export const fromCatalog = <T>(result: Result<T, CatalogError>): Outcome<T> => mapErr(result, (error) => ({ type: "catalog", error }))

export const fromReasoner = <T>(result: Result<T, ReasonerFailure>): Outcome<T> => mapErr(result, (failure) => ({ type: "reasoner", failure }))

export const fromProof = <T>(result: Result<T, ProofError>): Outcome<T> => mapErr(result, (error) => ({ type: "proof", error }))

export const fromPachinkoEngine = <T>(result: Result<T, PachinkoEngine.EngineFailure>): Outcome<T> =>
  mapErr(result, (failure) => ({ type: "pachinko-engine", failure }))

export const fromPachislotEngine = <T>(result: Result<T, PachislotEngine.EngineFailure>): Outcome<T> =>
  mapErr(result, (failure) => ({ type: "pachislot-engine", failure }))

export const fromReport = <T>(result: Result<T, ReportError>): Outcome<T> => mapErr(result, (error) => ({ type: "report", error }))

export const fromOpening = <T>(result: Result<T, OpeningProblem>): Outcome<T> => mapErr(result, (error) => ({ type: "parlor", error }))

export const fromTally = <T>(result: Result<T, TallyError>): Outcome<T> => mapErr(result, (error) => ({ type: "tally", error }))

export const fromHistory = <T>(result: Result<T, HistoryError>): Outcome<T> => mapErr(result, (error) => ({ type: "history", error }))
