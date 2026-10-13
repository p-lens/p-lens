import type { JSX } from "solid-js"

/**
 * The few icons the app draws, as strokes in the current text colour. Drawn
 * here rather than taken from a set, because a set brings hundreds to use six.
 */
const Icon = (props: { readonly children: JSX.Element; readonly label?: string | undefined }): JSX.Element => (
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

export const HeartIcon = (props: { readonly filled: boolean }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={props.filled ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
)

/** Verified: a shield with a tick. */
export const ShieldIcon = () => (
  <Icon>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
)

/** Refuted: a shield with a cross. */
export const ShieldOffIcon = () => (
  <Icon>
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </Icon>
)

/** Rejected: a hand held up, crossed. */
export const HandOffIcon = () => (
  <Icon>
    <path d="M4 4l16 16" />
    <path d="M18 11V7a1.5 1.5 0 0 0-3 0v4M15 10V5a1.5 1.5 0 0 0-3 0v5M12 9.5V6a1.5 1.5 0 0 0-3 0v8l-2-2a1.5 1.5 0 0 0-2 2l3.5 4.5A5 5 0 0 0 12.5 20H14a4 4 0 0 0 4-4v-5" />
  </Icon>
)

/** Refresh: an arrow come round to its start. */
export const RefreshIcon = () => (
  <Icon>
    <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    <path d="M20 4v5h-5" />
  </Icon>
)

/** Copy: two sheets, one over the other. */
export const CopyIcon = () => (
  <Icon>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Icon>
)

/** Something set right where it stands: a pencil over the sheet it writes on. */
export const EditIcon = (props: { readonly label: string }) => (
  <Icon label={props.label}>
    <path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
    <path d="M17 3l4 4-9 9-4 1 1-4z" />
  </Icon>
)

/** Worked out from a machine's figures: a calculator. */
export const CalculatorIcon = (props: { readonly label?: string }) => (
  <Icon label={props.label}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8.500 7h7" />
    <path d="M8.500 12h.010M12 12h.010M15.500 12h.010M8.500 16h.010M12 16h.010M15.500 16h.010" />
  </Icon>
)

/** Sampled by running it on the device: a computer. */
export const ComputerIcon = (props: { readonly label?: string }) => (
  <Icon label={props.label}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M12 16v4M8 20h8" />
  </Icon>
)

/** Figures typed in by hand: a fist laid sideways, its knuckles leading. */
export const FistIcon = (props: { readonly label?: string }) => (
  <Icon label={props.label}>
    <path d="M2.500 8.500H7V8a3 3 0 0 1 3-3h6.500a1.750 1.750 0 0 1 0 3.500a1.750 1.750 0 0 1 0 3.500a1.750 1.750 0 0 1 0 3.500a1.750 1.750 0 0 1 0 3.500H10a3 3 0 0 1-3-3v-.500H2.500" />
    <path d="M16.500 8.500H13M16.500 12H13M16.500 15.500H13" />
  </Icon>
)

/** Adopted: a raised hand. */
export const HandIcon = () => (
  <Icon>
    <path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.5 1.5 0 0 1 2.5-1.6L8 16" />
  </Icon>
)

/** Chosen by the ranking: a medal. */
export const MedalIcon = () => (
  <Icon>
    <circle cx="12" cy="15" r="5" />
    <path d="M9 3l3 7 3-7M7 3h10" />
  </Icon>
)

/** Chosen by hand: a pointer. */
export const PointerIcon = () => (
  <Icon>
    <path d="M6 3l12 9-5 1 3 6-2 1-3-6-4 3z" />
  </Icon>
)

export const QuestionIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8M12 17h.01" />
  </Icon>
)

export const LiveIcon = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5z" />
  </Icon>
)

export const SettingsIcon = () => (
  <Icon>
    <path d="M19.42 10.37 L21.92 10.75 L21.92 13.25 L19.42 13.63 L18.40 16.10 L19.90 18.13 L18.13 19.90 L16.10 18.40 L13.63 19.42 L13.25 21.92 L10.75 21.92 L10.37 19.42 L7.90 18.40 L5.87 19.90 L4.10 18.13 L5.60 16.10 L4.58 13.63 L2.08 13.25 L2.08 10.75 L4.58 10.37 L5.60 7.90 L4.10 5.87 L5.87 4.10 L7.90 5.60 L10.37 4.58 L10.75 2.08 L13.25 2.08 L13.63 4.58 L16.10 5.60 L18.13 4.10 L19.90 5.87 L18.40 7.90 Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

/** Something set finer than the fields beside it show: three sliders, each with its knob somewhere else. */
export const SlidersIcon = () => (
  <Icon>
    <path d="M4 6h3M11 6h9M4 12h9M17 12h3M4 18h2M10 18h10" />
    <circle cx="9" cy="6" r="2" />
    <circle cx="15" cy="12" r="2" />
    <circle cx="8" cy="18" r="2" />
  </Icon>
)

/** Something aimed at: a mark at the middle of rings. */
export const TargetIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Icon>
)

export const HoldingsIcon = () => (
  <Icon>
    <circle cx="8" cy="15" r="5" />
    <circle cx="16" cy="9" r="5" />
  </Icon>
)

export const PlaysIcon = () => (
  <Icon>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
)

export const ActivityIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const FileIcon = () => (
  <Icon>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
)

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

/** Draw again: a die, showing three. */
export const DiceIcon = () => (
  <Icon>
    <rect x="3" y="3" width="18" height="18" rx="4" stroke-width="2.5" />
    <path d="M8 8h.01M12 12h.01M16 16h.01" stroke-width="3.5" />
  </Icon>
)

/** Change places: an arrow up beside an arrow down, between the two rows that swap. */
export const SwapIcon = () => (
  <Icon>
    <path d="M8 19V5" />
    <path d="M4 9l4-4l4 4" />
    <path d="M16 5v14" />
    <path d="M12 15l4 4l4-4" />
  </Icon>
)

/** Change: an arrow head pointing down, at what opens a list to choose again from. */
export const ChevronDownIcon = () => (
  <Icon>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const BackIcon = (props: { readonly label: string }) => (
  <Icon label={props.label}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
)

export const CloseIcon = (props: { readonly label: string }) => (
  <Icon label={props.label}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

/** Kept on the device: a tick over the tray it came down into. */
export const KeptOnDeviceIcon = () => (
  <Icon>
    <path d="M8 9l3 3 5-6" />
    <path d="M5 15v4h14v-4" />
  </Icon>
)

/** A newer version: an arrow up, out of a ring. */
export const NewVersionIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16V8M8.5 11.5L12 8l3.5 3.5" />
  </Icon>
)

/** Backup: a box with its lid on, kept. */
export const BackupIcon = () => (
  <Icon>
    <path d="M4 4h16v4H4z" />
    <path d="M6 8v11h12V8" />
    <path d="M10 12h4" />
  </Icon>
)

/** The books a device keeps: two standing side by side, a third leaning on them. */
export const BooksIcon = () => (
  <Icon>
    <path d="M5 4v16M9 4v16" />
    <path d="M5 4h4M5 20h4" />
    <path d="M13 6l5.500 13.500" />
    <path d="M13 6l2.800-1.100l5.500 13.500l-2.800 1.100" />
  </Icon>
)

/** A filter: a funnel, what is shown narrowed to what passes through — filled in while something is being held back by it. */
export const FilterIcon = (props: { readonly filled: boolean }) => (
  <Icon>
    <path d="M4 5h16l-6 8v5l-4 2v-7z" fill={props.filled ? "currentColor" : "none"} />
  </Icon>
)

/** A breakdown: results set out in rows of differing length, group by group. */
export const BreakdownIcon = () => (
  <Icon>
    <path d="M4 6h16" />
    <path d="M4 12h10" />
    <path d="M4 18h13" />
  </Icon>
)

/** Sent on its way to someone: a paper plane. */
export const SendIcon = (props: { readonly label?: string }) => (
  <Icon label={props.label}>
    <path d="M21 3L10 14" />
    <path d="M21 3l-7 18l-4-7l-7-4z" />
  </Icon>
)

/** Consolidated: books laid one on another, several as one. */
export const ConsolidatedIcon = () => (
  <Icon>
    <path d="M12 4l8 4l-8 4l-8-4z" />
    <path d="M4 12l8 4l8-4" />
    <path d="M4 16l8 4l8-4" />
  </Icon>
)

/** Export: an arrow up out of a tray, a file leaving the app. */
export const ExportIcon = () => (
  <Icon>
    <path d="M12 15V4" />
    <path d="M8 8l4-4l4 4" />
    <path d="M5 14v5h14v-5" />
  </Icon>
)

/** Import: an arrow down into a tray, a file coming into the app. */
export const ImportIcon = () => (
  <Icon>
    <path d="M12 4v11" />
    <path d="M8 11l4 4l4-4" />
    <path d="M5 14v5h14v-5" />
  </Icon>
)

/** Taken off the device for good: a bin, its lid lifted by the handle. */
export const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v5M14 11v5" />
  </Icon>
)

/**
 * Where a day is closed and the next begins: 〆, the mark a day's books are
 * closed with, in the two strokes type sets it in — a short stroke down
 * that turns into a long sweep up to the right, and the stroke that
 * crosses it — each with a brush's slight bow. Written in one looping
 * line it reads as an α at this size, and as nothing in particular.
 */
export const ClosingIcon = () => (
  <Icon>
    <path d="M5 13.500c.3 2 .9 4 1.800 6C10 14 14.500 8 20 3.500M7.500 8c4.200 2.200 8.300 5.200 12 9.500" />
  </Icon>
)

/** People a thing is shared with: one nearer, one behind their shoulder. */
export const PeopleIcon = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.500 20c.5-4 3-6 6.500-6s6 2 6.500 6" />
    <path d="M15.500 4.800a3.500 3.500 0 0 1 0 6.400" />
    <path d="M17.500 14.300c2.300.7 3.700 2.600 4 5.700" />
  </Icon>
)

export const PaletteIcon = () => (
  <Icon>
    <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-.9-.7-1.3-.7-2.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7" r="1" />
    <circle cx="15" cy="7" r="1" />
  </Icon>
)
