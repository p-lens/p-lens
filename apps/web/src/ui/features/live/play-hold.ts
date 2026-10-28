/**
 * How a screen has a play: held by this device, to be played on, or a
 * copy of one another of the owner's devices holds, to be watched as of
 * when it was last shown, with the way to continue it here.
 */
export type PlayHold = { readonly type: "held" } | { readonly type: "followed"; readonly shownAt: string; readonly onContinue: () => Promise<void> }
