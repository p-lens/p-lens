/**
 * solid-gathering-shell — a domain-free SolidJS shell for a place where people,
 * records and groups gather: a bar across the top, a rail of spaces, the list
 * inside one, the main content, and the detail of what is chosen. Wide windows
 * show them side by side; narrow ones show one at a time, as selection, content
 * and detail.
 */
export { GatheringShell } from "./GatheringShell"
export { RailBar, type RailItem } from "./RailBar"
export { TopBar } from "./TopBar"
export { Breadcrumb, type Crumb } from "./Breadcrumb"
export { SidePanel, AuxPanel, MainContent, type PanelWidth } from "./panels"
export { ResizableBoundary } from "./ResizableBoundary"
export { createArrangement } from "./arrangement"
export { useArrangement } from "./context"
export { createResizable, clampSize, type Bound, type HandleEdge, type Resizable, type SizeBounds } from "./resize"
export { visiblePanes, type Arrangement, type Focus, type VisiblePanes } from "./panes"
