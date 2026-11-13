import type { Result } from "../../core/result/result"
import type { CacheError } from "./parlor-cache"

/** One file of the reports as it came: its text, and the version its publisher gave it, where it gave one. A file not published yet is kept as no text. */
export interface KeptFile {
  readonly text: string
  readonly version: string | undefined
}

/** The reports as the device keeps them: p-lens-parlors' `tiers.jsonl` and p-lens-brokers' `observations.jsonl`, as last read. */
export interface KeptReports {
  readonly tiers: KeptFile
  readonly observations: KeptFile
}

/** The reports as last read, kept on the device: what rates are filled in from at once, offline as well, and what a reading of the published ones is told from. */
export interface RateReportsCache {
  /** The copy kept; none where the device never read the reports. */
  readonly read: () => Promise<Result<KeptReports | undefined, CacheError>>
  readonly replace: (kept: KeptReports) => Promise<Result<void, CacheError>>
}
