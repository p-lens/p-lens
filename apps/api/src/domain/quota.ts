import type { QuotaStandingDto, RegistrationKindDto } from "@p-lens/contracts"

/**
 * What a registration is counted as: a machine with its first formula; an
 * addition to a machine there already, a formula or a 設定配分; a tag or a
 * tagging.
 */
export type RegistrationKind = RegistrationKindDto

export const REGISTRATION_KINDS: readonly RegistrationKind[] = ["machine", "addition", "tag"]

/**
 * How much of one kind may be registered: by one device no sooner than
 * `intervalSeconds` after its last, and in a day at most `perDevice` by one
 * device and `perAddress` from one address.
 */
export interface Quota {
  readonly intervalSeconds: number
  readonly perDevice: number
  readonly perAddress: number
}

export type Quotas = Readonly<Record<RegistrationKind, Quota>>

const DAY_MILLIS = 86_400_000

/**
 * What a careful person never reaches and a script does at once. A machine
 * takes half an hour to look up and check at the very least and six hours
 * as a rule, so twenty minutes between two and six in a day stop nobody
 * who did the work; an addition to a machine there already — the same
 * formula from a measured round — is minutes of work, so it is looser. An
 * address takes twice a device's day, for two people behind one line.
 */
export const STANDARD_QUOTAS: Quotas = {
  machine: { intervalSeconds: 1_200, perDevice: 6, perAddress: 12 },
  addition: { intervalSeconds: 300, perDevice: 12, perAddress: 24 },
  tag: { intervalSeconds: 0, perDevice: 20, perAddress: 40 },
}

/** The start of the day a quota counts back over, from `now`. */
export const dayBefore = (now: string): string => new Date(Date.parse(now) - DAY_MILLIS).toISOString()

/** When a day's count of `cap` has room again: when the oldest of the last `cap` leaves the day. None where it has room now. */
const roomAt = (stamps: readonly string[], cap: number): number | undefined => {
  const oldest = stamps.toSorted().at(-cap)
  return stamps.length >= cap && oldest !== undefined ? Date.parse(oldest) + DAY_MILLIS : undefined
}

/** When a device's last registration is `intervalSeconds` behind it. None where it has made none. */
const restedAt = (mine: readonly string[], intervalSeconds: number): number | undefined => {
  const last = mine.toSorted().at(-1)
  return last === undefined ? undefined : Date.parse(last) + intervalSeconds * 1_000
}

/**
 * Where a device stands against a quota: how many more it may register
 * today, and from when it may register the next — nothing where that is
 * now. `mine` and `fromAddress` are when the device, and its address,
 * registered within the last day.
 */
export const standingOf = (quota: Quota, mine: readonly string[], fromAddress: readonly string[], now: string): QuotaStandingDto => {
  const waits = [roomAt(mine, quota.perDevice), roomAt(fromAddress, quota.perAddress), restedAt(mine, quota.intervalSeconds)].flatMap((at) => (at !== undefined && at > Date.parse(now) ? [at] : []))
  const remaining = Math.max(0, Math.min(quota.perDevice - mine.length, quota.perAddress - fromAddress.length))
  return waits.length === 0 ? { remaining } : { remaining, nextAt: new Date(Math.max(...waits)).toISOString() }
}
