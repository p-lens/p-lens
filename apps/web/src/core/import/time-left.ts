/**
 * How long what is left of a run of like steps should take, in seconds, at
 * the pace those done went at: none before any is done, which leaves no
 * pace to go by, and nought once all are.
 */
export const secondsLeftOf = (done: number, of: number, elapsedMilliseconds: number): number | undefined =>
  done <= 0 ? undefined : Math.max(0, ((of - done) * elapsedMilliseconds) / done / 1000)
