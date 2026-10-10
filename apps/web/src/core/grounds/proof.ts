import { Err, Ok, type Result } from "../result/result"
import { compoundOf, isCompound, numberOf, type Compound, type Term } from "./term"

/**
 * Why a conclusion holds, as the reasoner proved it: a named step from its
 * premises, a given fact, an arithmetic result, a list of proofs collected
 * together, something shown not to hold, or a comparison checked.
 */
export type Proof =
  | { readonly type: "step"; readonly rule: string; readonly claim: Compound; readonly premises: readonly Proof[] }
  | { readonly type: "given"; readonly fact: Compound }
  | { readonly type: "computed"; readonly value: number; readonly expression: Term }
  | { readonly type: "collected"; readonly proofs: readonly Proof[] }
  | { readonly type: "absent"; readonly goal: Term }
  | { readonly type: "checked"; readonly comparison: Term }
  | { readonly type: "done" }

export type ProofError = { readonly type: "unreadable-proof"; readonly at: string }

const unreadable = (at: Term): Result<never, ProofError> => Err({ type: "unreadable-proof", at: JSON.stringify(at).slice(0, 200) })

const all = (terms: readonly Term[]): Result<readonly Proof[], ProofError> =>
  terms.reduce<Result<readonly Proof[], ProofError>>((found, term) => {
    if (!found.ok) return found
    const proof = proofOf(term)
    return proof.ok ? Ok([...found.value, proof.value]) : proof
  }, Ok([]))

/** The reasoner's proof term as a proof, or where it could not be read. */
export const proofOf = (term: Term): Result<Proof, ProofError> => {
  const step = compoundOf(term, "step", 3)
  if (step !== undefined) {
    const [rule, claim, premises] = step.args
    if (rule === undefined || !isCompound(rule) || claim === undefined || !isCompound(claim) || !Array.isArray(premises)) return unreadable(term)
    const proved = all(premises)
    return proved.ok ? Ok({ type: "step", rule: rule.functor, claim, premises: proved.value }) : proved
  }
  const given = compoundOf(term, "given", 1)?.args[0]
  if (given !== undefined) return isCompound(given) ? Ok({ type: "given", fact: given }) : unreadable(term)
  const computed = compoundOf(term, "computed", 2)
  if (computed !== undefined) {
    const value = numberOf(computed.args[0])
    const expression = computed.args[1]
    return value === undefined || expression === undefined ? unreadable(term) : Ok({ type: "computed", value, expression })
  }
  const collected = compoundOf(term, "collected", 1)?.args[0]
  if (collected !== undefined) {
    if (!Array.isArray(collected)) return unreadable(term)
    const proved = all(collected)
    return proved.ok ? Ok({ type: "collected", proofs: proved.value }) : proved
  }
  const absent = compoundOf(term, "absent", 1)?.args[0]
  if (absent !== undefined) return Ok({ type: "absent", goal: absent })
  const checked = compoundOf(term, "checked", 1)?.args[0]
  if (checked !== undefined) return Ok({ type: "checked", comparison: checked })
  return compoundOf(term, "done", 0) === undefined ? unreadable(term) : Ok({ type: "done" })
}

/** The steps a proof's premises take, collected lists opened up, in order. */
export const stepsUnder = (proof: Proof): readonly (Proof & { readonly type: "step" })[] =>
  proof.type === "step"
    ? proof.premises.flatMap((premise) => (premise.type === "step" ? [premise] : premise.type === "collected" ? premise.proofs.flatMap((inner) => (inner.type === "step" ? [inner] : [])) : []))
    : []

/** The first fact a step was given whose functor is `functor`. */
export const givenIn = (step: Proof & { readonly type: "step" }, functor: string): Compound | undefined =>
  step.premises.flatMap((premise) => (premise.type === "given" && premise.fact.functor === functor ? [premise.fact] : [])).at(0)

/** Every step of a proof, depth first, itself included. */
export const everyStep = (proof: Proof): readonly (Proof & { readonly type: "step" })[] =>
  proof.type === "step"
    ? [proof, ...proof.premises.flatMap(everyStep)]
    : proof.type === "collected"
      ? proof.proofs.flatMap(everyStep)
      : []

/** A check the proof made, and whether it held: a figure against the engine's, or a sample against the exact figure. */
export interface Check {
  readonly rule: string
  readonly claim: Compound
  readonly holds: boolean
}

/** The checks a proof made, in order. */
export const checksIn = (proof: Proof): readonly Check[] =>
  everyStep(proof).flatMap((step) => {
    const verdict = step.claim.args.at(-1)
    const holds = verdict !== undefined && isCompound(verdict) ? verdict.functor : undefined
    return step.rule.startsWith("check_") && (holds === "holds" || holds === "fails") ? [{ rule: step.rule, claim: step.claim, holds: holds === "holds" }] : []
  })
