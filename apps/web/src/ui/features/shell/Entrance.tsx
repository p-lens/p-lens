import { Navigate } from "@solidjs/router"
import { createResource, Show, type JSX } from "solid-js"

import { useApp } from "../../context"
import { entranceOf } from "../../navigation/entrance"
import { pathOf } from "../../navigation/place"

/**
 * `/` itself: it shows nothing, and is replaced by the place the app is
 * entered at as soon as the books are known, so a back step never lands
 * here again.
 */
export function Entrance(): JSX.Element {
  const app = useApp()
  const [books] = createResource(() => app.services.session.books())
  return (
    <Show when={books()} keyed>
      {(listed) => <Navigate href={pathOf(entranceOf(listed.ok ? listed.value : [], app.services.member))} />}
    </Show>
  )
}
