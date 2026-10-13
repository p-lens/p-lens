import type { AnalysisDto } from "@p-lens/contracts/pachinko"

import type { Figures } from "../../core/pachinko/figures"
import type { Basis } from "../../core/pachinko/formula"
import { groundsFacts, type SampledFigure } from "../../core/pachinko/grounds/facts"
import { proofOf, type Proof } from "../../core/grounds/proof"
import { termOf } from "../../core/grounds/term"
import { Err } from "../../core/result/result"
import type { ReasonerClient } from "../../reasoning/client/client"
import type { Outcome } from "../errors"
import { fromProof, fromReasoner } from "../lift"

/** The goal a formula's grounds are proved by: its 1R トータル確率 and 1R 平均出玉, and everything they rest on, checked. */
const GROUNDS_GOAL = "prove(grounds, Proof)."

/** One variable's binding in an answer the reasoner sent, untrusted until read as a term. */
const bindingOf = (answer: unknown, variable: string): unknown =>
  typeof answer === "object" && answer !== null ? Object.entries(answer).find(([name]) => name === variable)?.[1] : undefined

/**
 * A formula's 計算根拠, reasoned: its basis, what the engine solved of it and
 * the figures it stores handed to the reasoner as facts, and the proof read
 * back — every step from the spec sheet to the figure, the checks of the
 * engine's solution, of the chain it solved and of the stored figures, and
 * what was taken unchecked.
 */
export const reasonGrounds = async (
  reasoner: ReasonerClient,
  basis: Basis,
  analysis: AnalysisDto,
  figures: Figures,
  sampled: SampledFigure | undefined,
): Promise<Outcome<Proof>> => {
  const proved = fromReasoner(await reasoner.prove(groundsFacts(basis, analysis, figures, sampled), GROUNDS_GOAL))
  if (!proved.ok) return proved
  const proof = termOf(bindingOf(proved.value, "Proof"))
  return proof === undefined ? Err({ type: "proof", error: { type: "unreadable-proof", at: "Proof" } }) : fromProof(proofOf(proof))
}
