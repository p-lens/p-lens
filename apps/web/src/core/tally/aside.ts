import { decimal, parseDecimal, toPlainString, type Decimal } from "../decimal/decimal"
import { writableText, type Entry } from "../journal/entry"
import { clockOf, clockTags } from "./clock"
import { TALLY_TAGS, type Sender, type TallyAside, type TallyHead } from "./tally"

/** A spin performance as a book keeps it: to a tenth, as the live screen showed it. */
export const keptSpinPerformance = (perThousand: number): Decimal => decimal(BigInt(Math.round(perThousand * 10)), 1)

/** Nothing written beside a tally. */
export const NOTHING_ASIDE: TallyAside = { clock: undefined, spinPerformance: undefined, sender: undefined }

/** What a recorded tally has written beside it, to keep as it is set right. */
export const asideOfTally = (tally: TallyHead): TallyAside => ({ clock: tally.clock, spinPerformance: tally.spinPerformance, sender: tally.sender })

/** What an entry says of who sent its play, where someone did. */
const senderTags = (sender: Sender | undefined): Entry["tags"] =>
  sender === undefined ? [] : [[TALLY_TAGS.senderId, sender.id], [TALLY_TAGS.sender, writableText(sender.name)]]

/** Who sent a play, as an entry's tags say it: none where they name no one by id. */
const senderOf = (tagged: (name: string) => string | undefined): Sender | undefined => {
  const id = tagged(TALLY_TAGS.senderId)?.trim() ?? ""
  return id === "" ? undefined : { id, name: tagged(TALLY_TAGS.sender)?.trim() ?? "" }
}

/** What an entry says beside its tally, each where there is any. */
export const asideTags = (tally: TallyHead): Entry["tags"] => [
  ...clockTags(tally.clock),
  ...(tally.spinPerformance === undefined ? [] : [[TALLY_TAGS.spinPerformance, toPlainString(tally.spinPerformance)] as const]),
  ...senderTags(tally.sender),
]

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** What an entry's tags say beside its tally. */
export const asideOf = (tagged: (name: string) => string | undefined): TallyAside => ({
  clock: clockOf(tagged),
  spinPerformance: amountOf(tagged(TALLY_TAGS.spinPerformance)),
  sender: senderOf(tagged),
})

/** A tally with what is written beside it, each part where there is any. */
export const withAside = <T extends TallyHead>(tally: T, aside: TallyAside): T => ({
  ...tally,
  ...(aside.clock === undefined ? {} : { clock: aside.clock }),
  ...(aside.spinPerformance === undefined ? {} : { spinPerformance: aside.spinPerformance }),
  ...(aside.sender === undefined ? {} : { sender: aside.sender }),
})
