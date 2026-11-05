import "../ui/theme/theme.css"

import { render } from "solid-js/web"

import { App } from "./App"
import { crossingOf } from "./composition/crossing"
import { createServices } from "./composition/services"

/**
 * The services, made once for the whole app. Made inside the JSX they would
 * be made again on every read of the prop, Solid's props being getters.
 */
const services = createServices()
const crossing = crossingOf(services)

const root = document.getElementById("root")
if (root !== null) render(() => <App services={services} crossing={crossing} />, root)
