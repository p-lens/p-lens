/** Where a play's spin performance stands against its border: above it, below it, or level with it. */
export type BorderStanding = "above" | "below" | "level"

/** A rate as it is told, to one place: two rates told alike are level, whatever lies past that place. */
const written = (perThousand: number): number => Math.round(perThousand * 10)

/**
 * Where a spin performance stands against a border, both as they are
 * told; nothing where either is not known, there being nothing to
 * stand against.
 */
export const borderStandingOf = (spinPerformance: number | undefined, border: number | undefined): BorderStanding | undefined => {
  if (spinPerformance === undefined || border === undefined) return undefined
  const ahead = written(spinPerformance) - written(border)
  return ahead > 0 ? "above" : ahead < 0 ? "below" : "level"
}
