import type { JSX } from "solid-js"
import { encode } from "uqr"

/** The modules of a QR code as one path: a unit square for each dark one. */
const pathOf = (modules: readonly (readonly boolean[])[]): string =>
  modules.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join("")

/**
 * A text as a QR code, dark on light in either theme, as a camera reads
 * one best, with a quiet border of its own; as wide as its `class` makes
 * it, and named for whoever cannot see it.
 */
export function QrCode(props: { readonly text: string; readonly label: string; readonly class?: string }): JSX.Element {
  const code = () => encode(props.text, { ecc: "M", border: 2 })
  return (
    <svg viewBox={`0 0 ${code().size} ${code().size}`} role="img" aria-label={props.label} shape-rendering="crispEdges" class={`bg-qr-paper text-qr-ink ${props.class ?? ""}`}>
      <path d={pathOf(code().data)} fill="currentColor" />
    </svg>
  )
}
