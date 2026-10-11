import { For, Show, type JSX } from "solid-js"

/** One space on the rail. */
export interface RailItem {
  readonly id: string
  readonly label: string
  readonly icon: JSX.Element
  readonly selected: boolean
  readonly onSelect: () => void
  /**
   * The colour the space is drawn in when chosen, and takes under the
   * pointer, each as the classes that draw it; the accent where none is
   * given. `resting` is how it is drawn left alone, a filled shape where
   * none is given. For a space that is of another kind than its neighbours.
   */
  readonly colour?: { readonly chosen: string; readonly hovered: string; readonly resting?: string }
  /** What the space wears at its corner, outside its shape: a count of what waits there. */
  readonly badge?: JSX.Element
}

/** A space in the accent: what one is drawn in unless it says otherwise. */
const ACCENT = { chosen: "bg-accent text-accent-contrast", hovered: "hover:bg-accent hover:text-accent-contrast" } as const

/** A space left alone: a filled shape, unless it says otherwise. */
const RESTING = "bg-surface-2 text-text-primary"

/**
 * The column of spaces down the left edge. Spaces come in groups, a divider
 * between each group that has any, and `footer` items are held at the foot
 * however few spaces there are above them.
 *
 * The chosen space is marked by a pill on the edge and a squarer icon, so it
 * reads at a glance without a label. A space's `badge` sits on its corner,
 * over the shape and not cut by it. Labels surface through `renderTooltip`,
 * or the native `title` when none is given, because the shell does not pick a
 * tooltip library on the host's behalf.
 */
export function RailBar(props: {
  readonly groups: readonly (readonly RailItem[])[]
  readonly footer?: readonly RailItem[]
  readonly label: string
  readonly renderTooltip?: (label: string, trigger: JSX.Element) => JSX.Element
}): JSX.Element {
  return (
    <nav aria-label={props.label} class="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-surface-0 py-3">
      <For each={props.groups.filter((group) => group.length > 0)}>
        {(group, index) => (
          <>
            <Show when={index() > 0}>
              <div class="h-0.5 w-8 shrink-0 rounded-full bg-border" aria-hidden="true" />
            </Show>
            <For each={group}>{(item) => <RailButton item={item} renderTooltip={props.renderTooltip} />}</For>
          </>
        )}
      </For>
      <Show when={props.footer !== undefined && props.footer.length > 0}>
        <div class="mt-auto flex w-full flex-col items-center gap-2 pt-1">
          <div class="h-0.5 w-8 rounded-full bg-border" aria-hidden="true" />
          <For each={props.footer}>{(item) => <RailButton item={item} renderTooltip={props.renderTooltip} />}</For>
        </div>
      </Show>
    </nav>
  )
}

function RailButton(props: {
  readonly item: RailItem
  readonly renderTooltip: ((label: string, trigger: JSX.Element) => JSX.Element) | undefined
}): JSX.Element {
  const button = (
    <div class="group relative flex w-full justify-center">
      <span
        aria-hidden="true"
        class="absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-text-primary transition-all"
        classList={{ "h-10": props.item.selected, "h-0 group-hover:h-5": !props.item.selected }}
      />
      <div class="relative">
        <button
          type="button"
          aria-label={props.item.label}
          aria-current={props.item.selected ? "page" : undefined}
          title={props.renderTooltip === undefined ? props.item.label : undefined}
          onClick={() => props.item.onSelect()}
          class="flex size-12 items-center justify-center overflow-hidden transition-all"
          classList={{
            [`rounded-2xl ${(props.item.colour ?? ACCENT).chosen}`]: props.item.selected,
            [`rounded-3xl hover:rounded-2xl ${props.item.colour?.resting ?? RESTING} ${(props.item.colour ?? ACCENT).hovered}`]: !props.item.selected,
          }}
        >
          {props.item.icon}
        </button>
        <Show when={props.item.badge} keyed>
          {(badge) => <span class="pointer-events-none absolute -right-1 -top-1 flex">{badge}</span>}
        </Show>
      </div>
    </div>
  )
  return props.renderTooltip === undefined ? button : props.renderTooltip(props.item.label, button)
}
