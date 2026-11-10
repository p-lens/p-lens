/**
 * The tags an imported tally carries beside a tally's own, saying where it
 * came from and what that app called things. They are kept apart from
 * `parlor-id` and `machine`, which only ever hold the lists' own: a source's
 * name is written here as it was, with its code, so that it can be tied to
 * a listed parlor or a catalogued machine later, by the code, without
 * reading it back out of a description. The labels that app let a person
 * put on a tally are kept the same way, a label a tag of its own: they are
 * that app's, and never written into this app's own tags, nor read as
 * them.
 */
export const SOURCE_TAGS = {
  from: "imported-from",
  parlor: "source-parlor",
  parlorCode: "source-parlor-code",
  machine: "source-machine",
  machineCode: "source-machine-code",
  maker: "source-maker",
  label: "source-label",
} as const
