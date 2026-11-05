/** What each PLN-1 kind carries, by name: the numbers are PROTOCOL.md §4's, in p-lens-relay. */
export const KIND = {
  bookChange: 4738,
  tip: 34738,
  accessList: 34742,
  mailbox: 34743,
  playCopy: 34739,
  sentPlay: 34740,
  huddleState: 34741,
  redemption: 28934,
  deletion: 5,
} as const

export type Kind = (typeof KIND)[keyof typeof KIND]
