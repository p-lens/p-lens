import { createContext, useContext, type Accessor } from "solid-js"

import type { Arrangement } from "./panes"

const outsideAnyShell: Accessor<Arrangement> = () => "wide"

const ArrangementContext = createContext<Accessor<Arrangement>>(outsideAnyShell)

export const ArrangementProvider = ArrangementContext.Provider

/**
 * The arrangement the enclosing shell is in, for a pane deciding whether it
 * keeps its own width or fills the screen. Outside a shell it is `wide`.
 */
export const useArrangement = (): Accessor<Arrangement> => useContext(ArrangementContext)
