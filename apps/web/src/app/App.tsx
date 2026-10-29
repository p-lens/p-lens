import { Route, Router } from "@solidjs/router"
import { createResource, Match, Switch, type JSX } from "solid-js"

import type { ApplicationError } from "../application/errors"
import { ensureFirstBook } from "../application/seed"
import { FirstTouch } from "../first-touch"
import type { Services } from "../application/services"
import { createUpdates } from "../pwa/updates"
import { AppProvider } from "../ui/context"
import { ClearData } from "../ui/features/settings/ClearDataSettings"
import { Entrance } from "../ui/features/shell/Entrance"
import { PLensScreen } from "../ui/features/shell/PLensScreen"
import { describeError } from "../ui/wording/errors"
import { createThemeState } from "../ui/theme/theme"

/**
 * The app: services and theme provided once, a first book put on the
 * device where it has none, and every address handed to one screen that reads
 * the place off it — but `/`, which is only the way in. Where the books
 * cannot even be listed, nothing else opens, and the way out is emptying
 * the device, offered beside why.
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
            <div class="max-w-5xl">
              <p class="px-4 pt-6 text-sm text-negative" role="alert">
                {describeError(error)}
              </p>
              <ClearData />
            </div>
          )}
        </Match>
        <Match when={seeded()?.ok === true}>
          <Router>
            <Route path="/" component={Entrance} />
            <Route path="*" component={PLensScreen} />
          </Router>
          <FirstTouch />
        </Match>
      </Switch>
    </AppProvider>
  )
}
