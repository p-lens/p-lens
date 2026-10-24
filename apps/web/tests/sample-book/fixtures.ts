import type { IsoDate } from "../../src/core/calendar/calendar"
import type { PlayId } from "../../src/core/play/play"
import type { SharedParlor, SharedParlorId } from "../../src/core/parlor/shared"
import type { Lineup } from "../../src/sample-book/core/day"
import type * as Pachinko from "../../src/sample-book/core/pachinko"
import type * as Pachislot from "../../src/sample-book/core/pachislot"

/** A pachinko machine of 1/99 to a run of about ten rounds, at a border of 18 a ¥1,000 at 等価. */
export const PACHINKO_SEAT: Pachinko.Seat = {
  figures: {
    roundChanceOneIn: 10,
    payoutPerRound: 139,
    totalChanceOneIn: 99,
    spinsPerHour: 220,
  },
}

/** A pachislot machine of bonuses alone, 合算 1/150, at 97% and at 110%. */
export const PACHISLOT_SEAT: Pachislot.Seat = {
  levels: [
    { settingLevel: 1, payoutRate: 0.97, bonuses: [], combinedOneIn: 150 },
    { settingLevel: 6, payoutRate: 1.1, bonuses: [], combinedOneIn: 120 },
  ],
}

export const LINEUP: Lineup = {
  pachinko: [
    {
      id: "p-old",
      name: "P旧台",
      releasedOn: "2020-01-06" as IsoDate,
      seat: PACHINKO_SEAT,
    },
    {
      id: "p-new",
      name: "P新台",
      releasedOn: "2024-02-05" as IsoDate,
      seat: PACHINKO_SEAT,
    },
    {
      id: "p-later",
      name: "P後発",
      releasedOn: "2024-03-04" as IsoDate,
      seat: PACHINKO_SEAT,
    },
  ],
  pachislot: [
    {
      id: "s-old",
      name: "S旧台",
      releasedOn: "2021-07-05" as IsoDate,
      seat: PACHISLOT_SEAT,
    },
    {
      id: "s-new",
      name: "S新台",
      releasedOn: "2024-02-19" as IsoDate,
      seat: PACHISLOT_SEAT,
    },
  ],
}

const parlorAt = (index: number, prefecture: SharedParlor["prefecture"], latitude: number): SharedParlor => ({
  id: `parlor-${prefecture}-${String(index)}` as SharedParlorId,
  name: `${prefecture}ホール${String(index)}`,
  reading: "",
  keywords: [],
  prefecture,
  address: "",
  location: { latitude, longitude: 139.7 },
  submissions: [],
})

/** Twelve parlors in Tokyo, a little further north each, and three in Kanagawa further south. */
export const PARLOR_LIST: readonly SharedParlor[] = [
  ...Array.from({ length: 12 }, (_, index) => parlorAt(index, "東京都", 35.6 + index * 0.01)),
  ...Array.from({ length: 3 }, (_, index) => parlorAt(index, "神奈川県", 35.3 - index * 0.01)),
]

/** Ids a test can read back: the day and the place among the day's. */
export const playIdOn = (date: IsoDate, index: number): PlayId => `sample-${date}-${String(index)}` as PlayId
