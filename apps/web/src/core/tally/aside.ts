import { decimal, parseDecimal, toPlainString, type Decimal } from "../decimal/decimal"
import { writableText, type Entry } from "../journal/entry"
import { clockOf, clockTags } from "./clock"
import { TALLY_TAGS, type NetCounts, type Sender, type TallyAside, type TallyHead } from "./tally"

/** A spin performance as a book keeps it, measured or broken even at: to a tenth, as the live screen showed it. */
export const keptSpinPerformance = (perThousand: number): Decimal => decimal(BigInt(Math.round(perThousand * 10)), 1)

/** Nothing written beside a tally. */
export const NOTHING_ASIDE: TallyAside = { clock: undefined, spinPerformance: undefined, realBorder: undefined, sender: undefined, netCounts: undefined }

/** What a recorded tally has written beside it, to keep as it is set right. */
export const asideOfTally = (tally: TallyHead): TallyAside => ({ clock: tally.clock, spinPerformance: tally.spinPerformance, realBorder: tally.realBorder, sender: tally.sender, netCounts: tally.netCounts })

/** What an entry says of who sent its play, where someone did. */
const senderTags = (sender: Sender | undefined): Entry["tags"] =>
  sender === undefined ? [] : [[TALLY_TAGS.senderId, sender.id], [TALLY_TAGS.sender, writableText(sender.name)]]

/** Who sent a play, as an entry's tags say it: none where they name no one by id. */
const senderOf = (tagged: (name: string) => string | undefined): Sender | undefined => {
  const id = tagged(TALLY_TAGS.senderId)?.trim() ?? ""
  return id === "" ? undefined : { id, name: tagged(TALLY_TAGS.sender)?.trim() ?? "" }
}

/** What a play's log counted, as an entry's tags say it. */
const netCountTags = (counts: NetCounts | undefined): Entry["tags"] => {
  if (counts === undefined) return []
  switch (counts.type) {
    case "pachinko":
      return [
        ...(counts.spins === undefined ? [] : [[TALLY_TAGS.netSpins, String(counts.spins)] as const]),
        ...(counts.regularSpins === undefined ? [] : [[TALLY_TAGS.netRegularSpins, String(counts.regularSpins)] as const]),
        [TALLY_TAGS.netJackpots, String(counts.jackpots)],
      ]
    case "at-machine":
      return [[TALLY_TAGS.netGames, String(counts.games)], [TALLY_TAGS.netAts, String(counts.ats)]]
    case "bonus-machine":
      return [[TALLY_TAGS.netGames, String(counts.games)], [TALLY_TAGS.netBonuses, String(counts.bonuses)]]
    case "games":
      return [[TALLY_TAGS.netGames, String(counts.games)]]
  }
}

const countOf = (text: string | undefined): number | undefined => (text !== undefined && /^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined)

/** What a play's log counted, as an entry's tags say it: none where they say no whole set of counts. */
const netCountsOf = (tagged: (name: string) => string | undefined): NetCounts | undefined => {
  const [spins, regularSpins, jackpots, games, ats, bonuses] = [TALLY_TAGS.netSpins, TALLY_TAGS.netRegularSpins, TALLY_TAGS.netJackpots, TALLY_TAGS.netGames, TALLY_TAGS.netAts, TALLY_TAGS.netBonuses].map((name) => countOf(tagged(name)))
  if (spins !== undefined || regularSpins !== undefined) return jackpots === undefined ? undefined : { type: "pachinko", spins, regularSpins, jackpots }
  if (games === undefined) return undefined
  if (ats !== undefined) return { type: "at-machine", games, ats }
  return bonuses === undefined ? { type: "games", games } : { type: "bonus-machine", games, bonuses }
}

/** What an entry says beside its tally, each where there is any. */
export const asideTags = (tally: TallyHead): Entry["tags"] => [
  ...clockTags(tally.clock),
  ...(tally.spinPerformance === undefined ? [] : [[TALLY_TAGS.spinPerformance, toPlainString(tally.spinPerformance)] as const]),
  ...(tally.realBorder === undefined ? [] : [[TALLY_TAGS.realBorder, toPlainString(tally.realBorder)] as const]),
  ...senderTags(tally.sender),
  ...netCountTags(tally.netCounts),
]

const amountOf = (text: string | undefined): Decimal | undefined => ((read) => (read?.ok === true ? read.value : undefined))(text === undefined ? undefined : parseDecimal(text))

/** What an entry's tags say beside its tally. */
export const asideOf = (tagged: (name: string) => string | undefined): TallyAside => ({
  clock: clockOf(tagged),
  spinPerformance: amountOf(tagged(TALLY_TAGS.spinPerformance)),
  realBorder: amountOf(tagged(TALLY_TAGS.realBorder)),
  sender: senderOf(tagged),
  netCounts: netCountsOf(tagged),
})

/** A tally with what is written beside it, each part where there is any. */
export const withAside = <T extends TallyHead>(tally: T, aside: TallyAside): T => ({
  ...tally,
  ...(aside.clock === undefined ? {} : { clock: aside.clock }),
  ...(aside.spinPerformance === undefined ? {} : { spinPerformance: aside.spinPerformance }),
  ...(aside.realBorder === undefined ? {} : { realBorder: aside.realBorder }),
  ...(aside.sender === undefined ? {} : { sender: aside.sender }),
  ...(aside.netCounts === undefined ? {} : { netCounts: aside.netCounts }),
})
