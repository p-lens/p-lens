import type { AnalysisDto } from "@p-lens/contracts/pachislot"

import type { SettingLevelFigures } from "../../core/pachislot/figures"
import type { Basis } from "../../core/pachislot/formula"
import { groundsFacts, type SampledMargin } from "../../core/pachislot/grounds/facts"
import { proofOf, type Proof } from "../../core/grounds/proof"
import { termOf } from "../../core/grounds/term"
import { Err } from "../../core/result/result"
import type { ReasonerClient } from "../../reasoning/client/client"
import type { Outcome } from "../errors"
import { fromProof, fromReasoner } from "../lift"

/** The goal an AT machine's grounds are proved by: each setting level's AT gain and 機械割, checked, and what was taken unchecked. */
const GROUNDS_GOAL = "prove(grounds, Proof)."

/** One variable's binding in an answer the reasoner sent, untrusted until read as a term. */
const bindingOf = (answer: unknown, variable: string): unknown =>
  typeof answer === "object" && answer !== null ? Object.entries(answer).find(([name]) => name === variable)?.[1] : undefined

/**
 * An AT machine's 計算根拠, reasoned: its basis, the figures the engine
 * solved from it and the figures it stores handed to the reasoner as
 * facts, and the proof read back — under each setting level, what the AT
 * gains and how the 機械割 comes of it, each checked against the engine,
 * the stored figure and the 機械割 the spec states, and what was taken
 * unchecked.
 */
export const reasonGrounds = async (reasoner: ReasonerClient, basis: Basis, analysis: AnalysisDto, figures: readonly SettingLevelFigures[], margins: readonly SampledMargin[] | undefined): Promise<Outcome<Proof>> => {
  const proved = fromReasoner(await reasoner.prove(groundsFacts(basis, analysis, figures, margins), GROUNDS_GOAL))
  if (!proved.ok) return proved
  const proof = termOf(bindingOf(proved.value, "Proof"))
  return proof === undefined ? Err({ type: "proof", error: { type: "unreadable-proof", at: "Proof" } }) : fromProof(proofOf(proof))
}
