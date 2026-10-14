import { decimal, parseDecimal, toPlainString, type Decimal } from "../decimal/decimal"
import type { Entry } from "../journal/entry"
import { clockOf, clockTags } from "./clock"
import { TALLY_TAGS, type TallyAside, type TallyHead } from "./tally"

/** A spin performance as a book keeps it: to a tenth, as the live screen showed it. */
export const keptSpinPerformance = (perThousand: number): Decimal => decimal(BigInt(Math.round(perThousand * 10)), 1)

/** Nothing written beside a tally. */
export const NOTHING_ASIDE: TallyAside = { clock: undefined, spinPerformance: undefined }

/** What a recorded tally has written beside it, to keep as it is set right. */
export const asideOfTally = (tally: TallyHead): TallyAside => ({ clock: tally.clock, spinPerformance: tally.spinPerformance })

/** What an entry says beside its tally, each where there is any. */
export const asideTags = (tally: TallyHead): Entry["tags"] => [
  ...clockTags(tally.clock),
  ...(tally.spinPerformance === undefined ? [] : [[TALLY_TAGS.spinPerformance, toPlainString(tally.spinPerformance)] as const]),
]

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** What an entry's tags say beside its tally. */
export const asideOf = (tagged: (name: string) => string | undefined): TallyAside => ({ clock: clockOf(tagged), spinPerformance: amountOf(tagged(TALLY_TAGS.spinPerformance)) })

/** A tally with what is written beside it, each part where there is any. */
export const withAside = <T extends TallyHead>(tally: T, aside: TallyAside): T => ({
  ...tally,
  ...(aside.clock === undefined ? {} : { clock: aside.clock }),
  ...(aside.spinPerformance === undefined ? {} : { spinPerformance: aside.spinPerformance }),
})
