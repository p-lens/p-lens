import { Route, Router } from "@solidjs/router"
import { createResource, Match, Switch, type JSX } from "solid-js"

import type { ApplicationError } from "../application/errors"
import { ensureFirstBook } from "../application/seed"
import type { Services } from "../application/services"
import { createUpdates } from "../pwa/updates"
import { AppProvider } from "../ui/context"
import { PLensScreen } from "../ui/features/shell/PLensScreen"
import { describeError } from "../ui/wording/errors"
import { createThemeState } from "../ui/theme/theme"

/**
 * The app: services and theme provided once, a first book put on the
 * device where it has none, and every address handed to one screen that reads
 * the place off it.
 */
export function App(props: { readonly services: Services }): JSX.Element {
  const theme = createThemeState()
  const updates = createUpdates()
  const [seeded] = createResource(() => ensureFirstBook(props.services.session, props.services.firstBook))
  const seedFailure = (): ApplicationError | undefined => {
    const outcome = seeded()
    return outcome?.ok === false ? outcome.error : undefined
  }

  return (
    <AppProvider services={props.services} theme={theme} updates={updates}>
      <Switch>
        <Match when={seeded() === undefined}>
          <p class="p-6 text-sm text-text-muted" role="status">
            帳簿を準備しています…
          </p>
        </Match>
        <Match when={seedFailure()} keyed>
          {(error) => (
            <p class="p-6 text-sm text-negative" role="alert">
              {describeError(error)}
            </p>
          )}
        </Match>
        <Match when={seeded()?.ok === true}>
          <Router>
            <Route path="*" component={PLensScreen} />
          </Router>
        </Match>
      </Switch>
    </AppProvider>
  )
}
