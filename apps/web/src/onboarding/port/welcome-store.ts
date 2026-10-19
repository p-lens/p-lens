/**
 * What a device keeps of its own arrival at the app: when it first opened
 * it, in UNIX seconds, and whether it has been welcomed. It is this
 * device's alone and goes with it.
 */
export interface WelcomeStore {
  readonly firstOpened: () => number
  readonly welcomed: () => boolean
  readonly setWelcomed: () => void
}
