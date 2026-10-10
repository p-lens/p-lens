/**
 * Whether two records hold the same things, field by field, each the very
 * same value. What a resource is asked for is a record made afresh whenever
 * anything near it changes; told apart by its fields, the same asking is
 * not answered twice.
 */
export const sameFields = <T extends object>(was: T | undefined, now: T | undefined): boolean => {
  if (was === undefined || now === undefined) return was === now
  const keys = Object.keys(now) as (keyof T)[]
  return Object.keys(was).length === keys.length && keys.every((key) => Object.is(was[key], now[key]))
}
