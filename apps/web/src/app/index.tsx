import "../ui/theme/theme.css"

import { render } from "solid-js/web"

import { pathOf } from "../ui/navigation/place"
import { App } from "./App"
import { createServices } from "./composition/services"

/**
 * Nothing lives at `/`. It is rewritten to the live space, the top of the
 * rail, as a server list opens on its direct messages.
 */
const enterAtTheLiveSpace = (): void => {
  if (window.location.pathname === "/") window.history.replaceState(null, "", pathOf({ kind: "live" }))
}

enterAtTheLiveSpace()

/**
 * The services, made once for the whole app. Made inside the JSX they would
 * be made again on every read of the prop, Solid's props being getters.
 */
const services = createServices()

const root = document.getElementById("root")
if (root !== null) render(() => <App services={services} />, root)
