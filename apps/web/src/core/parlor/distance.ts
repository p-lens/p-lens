import type { Coordinates, SharedParlor } from "./shared"

const EARTH_RADIUS_METRES = 6_371_000

const radians = (degrees: number): number => (degrees * Math.PI) / 180

/** How far apart two places are along the earth's surface, in metres. */
export const distanceInMetres = (from: Coordinates, to: Coordinates): number => {
  const latitude = radians(to.latitude - from.latitude)
  const longitude = radians(to.longitude - from.longitude)
  const along = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(along)))
}

/** A parlor and how far it is from here, where the list has placed it. */
export interface NearParlor {
  readonly parlor: SharedParlor
  readonly metres: number | undefined
}

const far = (near: NearParlor): number => near.metres ?? Number.POSITIVE_INFINITY

/**
 * The parlors nearest first, each with its distance from here; those the
 * list has not placed come after them all, in the order they were given.
 * Worked out on the device; here goes nowhere.
 */
export const nearestFirst = (parlors: readonly SharedParlor[], here: Coordinates): readonly NearParlor[] =>
  parlors
    .map((parlor) => ({ parlor, metres: parlor.location === undefined ? undefined : distanceInMetres(here, parlor.location) }))
    .toSorted((left, right) => (far(left) === far(right) ? 0 : far(left) - far(right)))
