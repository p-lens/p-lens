/**
 * A Prolog term as the reasoner hands it back: a number, a string, a list,
 * a compound — an atom is a compound with no arguments — or a variable left
 * unbound. Read once at the boundary; nothing here trusts its shape.
 */
export type Term =
  | number
  | string
  | readonly Term[]
  | { readonly functor: string; readonly args: readonly Term[] }
  | { readonly var: string }

export type Compound = Extract<Term, { readonly functor: string }>

export const isCompound = (term: Term): term is Compound => typeof term === "object" && !Array.isArray(term) && "functor" in term

/** The term as the compound `functor(...)` with `arity` arguments, if it is one. */
export const compoundOf = (term: Term | undefined, functor: string, arity: number): Compound | undefined =>
  term !== undefined && isCompound(term) && term.functor === functor && term.args.length === arity ? term : undefined

export const numberOf = (term: Term | undefined): number | undefined => (typeof term === "number" ? term : undefined)

/** An atom's name: the functor of a compound with no arguments. */
export const atomOf = (term: Term | undefined): string | undefined => (term !== undefined && isCompound(term) && term.args.length === 0 ? term.functor : undefined)

/** Reads untrusted JSON as a term, or nothing if any part of it is not one. */
export const termOf = (value: unknown): Term | undefined => {
  if (typeof value === "number" || typeof value === "string") return value
  if (Array.isArray(value)) {
    const items = value.map(termOf)
    return items.every((item): item is Term => item !== undefined) ? items : undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const record = value as Readonly<Record<string, unknown>>
  if (typeof record["var"] === "string") return { var: record["var"] }
  const args = record["args"] === undefined ? [] : record["args"]
  if (typeof record["functor"] !== "string" || !Array.isArray(args)) return undefined
  const read = args.map(termOf)
  return read.every((item): item is Term => item !== undefined) ? { functor: record["functor"], args: read } : undefined
}

/** A number as Prolog reads it: `1e-7` needs its point, `1.0e-7`. */
export const prologNumber = (value: number): string => {
  const text = String(value)
  return /e/i.test(text) && !text.includes(".") ? text.replace(/e/i, ".0e") : text
}
