import { Err, Ok, type Result } from "../result/result"
import { compoundOf, isCompound, numberOf, type Compound, type Term } from "./term"

/**
 * Why a conclusion holds, as the reasoner proved it: a named step from its
 * premises, a given fact, an arithmetic result, a list of proofs collected
 * together, something shown not to hold, a comparison checked, or a goal
 * attempted that could not be proved.
 */
export type Proof =
  | { readonly type: "step"; readonly rule: string; readonly claim: Compound; readonly premises: readonly Proof[] }
  | { readonly type: "given"; readonly fact: Compound }
  | { readonly type: "computed"; readonly value: number; readonly expression: Term }
  | { readonly type: "collected"; readonly proofs: readonly Proof[] }
  | { readonly type: "absent"; readonly goal: Term }
  | { readonly type: "checked"; readonly comparison: Term }
  | { readonly type: "unproved"; readonly goal: Term }
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
  const unproved = compoundOf(term, "unproved", 1)?.args[0]
  if (unproved !== undefined) return Ok({ type: "unproved", goal: unproved })
  return compoundOf(term, "done", 0) === undefined ? unreadable(term) : Ok({ type: "done" })
}

type Step = Proof & { readonly type: "step" }

type Unproved = Proof & { readonly type: "unproved" }

/** What a proof's premises come to that a reader is told of, collected lists opened up, in order: the steps taken, and the goals that could not be proved. */
export const partsUnder = (proof: Proof): readonly (Step | Unproved)[] => {
  const told = (premise: Proof): readonly (Step | Unproved)[] => (premise.type === "step" || premise.type === "unproved" ? [premise] : premise.type === "collected" ? premise.proofs.flatMap(told) : [])
  return proof.type === "step" ? proof.premises.flatMap(told) : []
}

/** The steps a proof's premises take, collected lists opened up, in order. */
export const stepsUnder = (proof: Proof): readonly Step[] => partsUnder(proof).flatMap((part) => (part.type === "step" ? [part] : []))

/** The first fact a step was given whose functor is `functor`. */
export const givenIn = (step: Step, functor: string): Compound | undefined =>
  step.premises.flatMap((premise) => (premise.type === "given" && premise.fact.functor === functor ? [premise.fact] : [])).at(0)

/** Every step of a proof, depth first, itself included. */
export const everyStep = (proof: Proof): readonly Step[] =>
  proof.type === "step"
    ? [proof, ...proof.premises.flatMap(everyStep)]
    : proof.type === "collected"
      ? proof.proofs.flatMap(everyStep)
      : []

/**
 * How something a proof found stands: a check that held or failed, a
 * figure taken unchecked, something that holds but is guessed to be out of the
 * ordinary, or a part that could not be proved at all.
 */
export type Standing = "holds" | "fails" | "unverified" | "odd" | "unproved"

/** How a step stands by its rule's name and its verdict, if it is a finding: `check_…` ends in a verdict, `unverified_…` and `odd_…` are remarks. */
export const standingOf = (step: Step): Standing | undefined => {
  if (step.rule.startsWith("unverified_")) return "unverified"
  if (step.rule.startsWith("odd_")) return "odd"
  const verdict = step.claim.args.at(-1)
  const said = verdict !== undefined && isCompound(verdict) ? verdict.functor : undefined
  return step.rule.startsWith("check_") && (said === "holds" || said === "fails") ? said : undefined
}

/** Something a proof found: how it stands, and the rule and claim it was found by — none for a part that could not be proved. */
export interface Finding {
  readonly standing: Standing
  readonly rule: string | undefined
  readonly claim: Term
}

/** Everything a proof found, in order, each once however often the proof came to it. */
export const findingsIn = (proof: Proof): readonly Finding[] => {
  const found = (part: Proof): readonly Finding[] => {
    if (part.type === "unproved") return [{ standing: "unproved", rule: undefined, claim: part.goal }]
    if (part.type === "collected") return part.proofs.flatMap(found)
    if (part.type !== "step") return []
    const standing = standingOf(part)
    return [...(standing === undefined ? [] : [{ standing, rule: part.rule, claim: part.claim }]), ...part.premises.flatMap(found)]
  }
  const key = (finding: Finding): string => `${finding.rule ?? ""}:${JSON.stringify(finding.claim)}`
  return found(proof).filter((finding, index, all) => all.findIndex((other) => key(other) === key(finding)) === index)
}

/** How many findings stand each way. */
export const tallyOf = (findings: readonly Finding[]): Readonly<Record<Standing, number>> =>
  findings.reduce<Readonly<Record<Standing, number>>>((tally, finding) => ({ ...tally, [finding.standing]: tally[finding.standing] + 1 }), { holds: 0, fails: 0, unverified: 0, odd: 0, unproved: 0 })
