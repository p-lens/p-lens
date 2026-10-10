/** The same text, compared in time that does not depend on where they differ. */
const sameText = (left: string, right: string): boolean => {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  return a.length === b.length && a.reduce((difference, byte, index) => difference | (byte ^ (b[index] ?? 0)), 0) === 0
}

/**
 * Whether a request is the administrator's: it carries the deployment's
 * admin token as `Authorization: Bearer …`. A deployment with no token has no
 * administrator at all.
 */
export const isAdmin = (token: string | undefined, request: Request): boolean => {
  if (token === undefined || token === "") return false
  const sent = request.headers.get("Authorization") ?? ""
  return sent.startsWith("Bearer ") && sameText(sent.slice("Bearer ".length), token)
}
