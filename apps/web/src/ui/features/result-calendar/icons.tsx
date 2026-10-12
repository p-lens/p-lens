import type { JSX } from "solid-js"

/** A stroke icon in the current text colour, drawn as the app's own are; kept here so the calendar brings its own. */
const Stroked = (props: { readonly children: JSX.Element; readonly label?: string | undefined }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    role={props.label === undefined ? undefined : "img"}
    aria-hidden={props.label === undefined ? "true" : undefined}
    aria-label={props.label}
  >
    {props.children}
  </svg>
)

export const ResultCalendarIcon = (): JSX.Element => (
  <Stroked>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </Stroked>
)

export const EarlierIcon = (props: { readonly label: string }): JSX.Element => (
  <Stroked label={props.label}>
    <path d="M15 6l-6 6 6 6" />
  </Stroked>
)

export const LaterIcon = (props: { readonly label: string }): JSX.Element => (
  <Stroked label={props.label}>
    <path d="M9 6l6 6-6 6" />
  </Stroked>
)
