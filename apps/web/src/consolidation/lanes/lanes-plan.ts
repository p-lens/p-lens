/** What a device says of itself that bears on how many hledgers it may run: its cores, and its memory in gigabytes where it says. */
export interface DeviceRoom {
  readonly cores: number
  readonly memoryGigabytes: number | undefined
}

/** The fewest books from which one more hledger is started beside the one every screen reads on: a few books read in good time on one. */
const FIRST_BOOKS = 4

/** The books after which each further hledger is started: four books, then twelve, then twenty. */
const BOOKS_A_LANE = 8

/** The most hledgers a consolidation runs, whatever the device: each may hold a quarter of a gigabyte of books. */
const MOST = 4

/** What one more hledger may take of a device's memory, in gigabytes, with room left for everything else. */
const GIGABYTES_A_LANE = 2

/** The most a device that does not say its memory is given: a phone that keeps it quiet may have little. */
const UNSAID_MEMORY_MOST = 2

/**
 * How many hledgers a consolidation of so many books reads on: one for
 * three books or fewer, two from four, three from twelve and four from
 * twenty — the measure the owner of the app set; never more
 * than the device has cores to spare beside the page's own, nor more than
 * its memory gives two gigabytes each where it says — two at most where it
 * does not — nor more than four.
 */
export const lanesFor = (books: number, device: DeviceRoom): number => {
  const wanted = books < FIRST_BOOKS ? 1 : 2 + Math.floor((books - FIRST_BOOKS) / BOOKS_A_LANE)
  const byCores = Math.max(1, device.cores - 1)
  const byMemory = device.memoryGigabytes === undefined ? UNSAID_MEMORY_MOST : Math.max(1, Math.floor(device.memoryGigabytes / GIGABYTES_A_LANE))
  return Math.max(1, Math.min(wanted, byCores, byMemory, MOST))
}
