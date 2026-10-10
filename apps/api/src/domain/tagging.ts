/**
 * What a tag can be put on. Explicit, and checked by the database too; a new
 * kind of target is a new value here and in the migration, never a free-form
 * string.
 */
export const TARGET_TYPES = ["machine", "formula", "distribution"] as const

export type TargetType = (typeof TARGET_TYPES)[number]
