/** How a probability is written: the one shape the pachinko and pachislot engines share. */
export type ProbabilityDto =
  | { readonly type: "ratio"; readonly numerator: number; readonly denominatorHundredths: number }
  | { readonly type: "percent"; readonly basisPoints: number }
