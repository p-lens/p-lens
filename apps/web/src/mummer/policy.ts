/**
 * What may be shown while mumming, kind by kind and facet by facet: not
 * only a value as it is written, but whatever is worked out from it and
 * would tell it — which way it went, how large it stands beside others,
 * how long its name is. A facet a kind does not list is not there to ask.
 *
 * - `text`: a name or a mark as written
 * - `initial`: the first character it is written with, an emoji counted as one
 * - `length`: how long it is written: a name in characters, a journal in lines
 * - `figure`: an amount as written
 * - `tone`: which way an amount went
 * - `scale`: how large an amount stands beside others
 * - `whole`: a part of a screen, all of it: a form a person types the figures into, which no veil can stand over
 */
export type Facet = "text" | "initial" | "length" | "figure" | "tone" | "scale" | "whole"

/** Whether a facet is shown while mumming, or veiled. Outside mumming everything is shown. */
export type Exposure = "shown" | "veiled"

/**
 * - `parlor`: a parlor's name, wherever it is written, an account or an entry's payee too
 * - `cabinet`: a cabinet's number
 * - `book`: a book's name, one's own or one plays are sent to
 * - `member`: the name a member of a shared book goes by, sending plays into it or let in; a huddle's names are made up to be shown, and are no member's
 * - `savings`: tokens a parlor keeps for a person, and what they are worth
 * - `tally`: what a book keeps of plays, one or many
 * - `play`: a play's figures as it is played and followed live
 * - `formula`: what a formula works out for a machine, the catalog's and no one's wallet
 * - `invitation`: a code that lets a device or a person into a book
 * - `journal`: a book's files and entries as they are written; how many lines an entry takes is shown, so that where it would stand keeps its shape
 */
export const POLICY = {
  parlor: { text: "veiled", length: "shown" },
  cabinet: { text: "veiled" },
  book: { text: "veiled", initial: "shown" },
  member: { text: "veiled", initial: "shown" },
  savings: { figure: "veiled", tone: "veiled", scale: "veiled", whole: "veiled" },
  tally: { figure: "veiled", tone: "shown", scale: "veiled", whole: "veiled" },
  play: { figure: "shown", tone: "shown", scale: "shown" },
  formula: { figure: "shown", tone: "shown", scale: "shown" },
  invitation: { whole: "veiled" },
  journal: { text: "veiled", length: "shown", whole: "veiled" },
} as const satisfies Readonly<Record<string, Readonly<Partial<Record<Facet, Exposure>>>>>

export type Kind = keyof typeof POLICY

/** The kinds that list a facet. */
export type KindWith<F extends Facet> = { readonly [K in Kind]: F extends keyof (typeof POLICY)[K] ? K : never }[Kind]

/** How a facet of a kind is exposed while mumming. */
export const exposureOf = <F extends Facet>(kind: KindWith<F>, facet: F): Exposure => (POLICY[kind] as Readonly<Partial<Record<Facet, Exposure>>>)[facet] ?? "veiled"
