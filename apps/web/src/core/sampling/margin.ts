/**
 * The margin a sampling of so many trials would come to, told from one
 * already run: a mean's margin narrows as the square root of its trials.
 */
export const marginAtTrials = (sampled: { readonly margin: number; readonly trials: number }, trials: number): number => sampled.margin * Math.sqrt(sampled.trials / trials)
