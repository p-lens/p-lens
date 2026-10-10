# solid-gathering-shell

A **domain-free application shell for SolidJS**, shaped for a place where people,
records and groups gather: a bar across the top, a rail of spaces down the left,
the list inside the chosen space, the main content of the chosen item, and its
detail.

```text
┌──────────────────────────────────────────────────────────────┐
│                       TopBar (optional)                      │
├──────┬────────────┬──────────────────────────┬──────────────┤
│ Rail │ SidePanel  │       MainContent        │   AuxPanel   │
│ Bar  │            │                          │   optional   │
└──────┴────────────┴──────────────────────────┴──────────────┘
```

It owns the frame and the geometry. The host brings every pane's content, and
the meaning of it: the shell does not know what a space, a list or a detail is.

## Two arrangements, one navigation

A wide window shows the panes side by side. A narrow one is **not the same
layout squeezed**: it shows one pane at a time, in the order

```text
selection (rail + side)  →  content (main)  →  detail (aux)
```

The shell holds no navigation state. The host says which `arrangement` the
window calls for and which pane is in `focus`, deriving the focus from wherever
it keeps the place the person is at — normally the address. Each step forward
is then a navigation, and the browser's back button, a phone's included, walks
back through detail → content → selection without anything here having to
listen for it.

Hidden panes stay mounted, so a list comes back scrolled where it was left.

## Parts

| Export | Role |
|---|---|
| `GatheringShell` | The frame. Props: `arrangement`, `focus`, `topBar?`, `rail`, `side`, `aux?`, `children` (main). |
| `TopBar` | The thin bar across the top: an optional `title`, with optional `leading` and `trailing` either side. |
| `RailBar` / `RailItem` | The column of spaces, in `groups` divided from each other. The chosen one gets a pill and a squarer icon; `footer` items sit at the foot. |
| `SidePanel` | The list beside the rail. Resizable in a wide arrangement, full screen in a narrow one. |
| `MainContent` | The pane taking the room left over, with an optional `header`. |
| `Breadcrumb` / `Crumb` | A trail for the main content's header: the steps that led to where it is, the earlier ones going back — as a thread shows its channel. |
| `AuxPanel` | The detail on the far side. Resizable from its leading edge. |
| `ResizableBoundary` | The hairline between panes. |
| `createArrangement` | Follows the window width (`{ narrowBelow }`) and answers `wide` or `narrow`. |
| `createResizable` / `clampSize` | The width a boundary drags, kept within bounds that may move. |
| `visiblePanes` | Which panes an arrangement and a focus put on screen; pure. |

## Usage

```tsx
const arrangement = createArrangement({ narrowBelow: 768 })

<GatheringShell
  arrangement={arrangement()}
  focus={focusFromAddress()}
  topBar={<TopBar title="Title" />}
  rail={<RailBar label="Spaces" groups={[home(), spaces()]} footer={[settings()]} />}
  side={<SidePanel header={<h2>Lists</h2>}>{/* … */}</SidePanel>}
  aux={selected() ? <AuxPanel>{/* … */}</AuxPanel> : undefined}
>
  <MainContent header={<h1>Title</h1>}>{/* … */}</MainContent>
</GatheringShell>
```

## Requirements

`solid-js`, and Tailwind with these theme colours defined by the host:
`surface-0` (rail), `surface-1` (side and aux), `surface-2` (main),
`text-primary`, `border`, `accent`, `accent-contrast`. The host's stylesheet
must let Tailwind see this package's sources, e.g.
`@source "../node_modules/solid-gathering-shell/src";`.

Nothing else: no button library, no tooltip library, no icon set. Rail labels
surface through `renderTooltip`, or the native `title` attribute without one.

## License

MIT © P-Lens contributors
