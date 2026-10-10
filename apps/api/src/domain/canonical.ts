/**
 * JSON with object keys in sorted order and no whitespace: one text for one
 * value, whatever order it was built in. What a content hash is taken over,
 * so a version's hash is the same however its JSON arrived.
 */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (typeof value === "object" && value !== null)
    return `{${Object.keys(value)
      .toSorted()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}
