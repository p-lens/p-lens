/** Why the reasoner gave no proof: it could not be reached, or the goal does not follow. */
export type ReasonerFailure = { readonly type: "reasoner-unavailable"; readonly detail: string } | { readonly type: "not-proved" }

/** What the page sends the reasoner: facts to add to the rules, and a goal to prove from them. */
export type ToReasoner = { readonly type: "prove"; readonly id: number; readonly facts: string; readonly goal: string }

/** What the reasoner sends back: the goal's bindings as JSON terms, or why there are none. */
export type FromReasoner =
  | { readonly type: "proved"; readonly id: number; readonly bindings: unknown }
  | { readonly type: "failed"; readonly id: number; readonly failure: ReasonerFailure }
