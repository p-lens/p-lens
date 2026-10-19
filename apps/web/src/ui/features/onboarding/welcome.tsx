import { createContext, createResource, createSignal, useContext, type JSX } from "solid-js"

import { loadWelcomeDue } from "../../../application/onboarding/welcome"
import { useApp } from "../../context"
import { WelcomeDialog } from "./WelcomeDialog"

interface WelcomeState {
  /** Open the welcome again, whatever the device has seen. */
  readonly show: () => void
}

const Context = createContext<WelcomeState>()

/** Where the welcome stands: opening by itself if the device is due one, opened because it was asked for, or closed. */
type Showing = { readonly type: "when-due" } | { readonly type: "asked" } | { readonly type: "closed" }

/**
 * Holds the welcome: opened by itself once, as a new device that holds
 * nothing but its first book, untouched, opens the app (`loadWelcomeDue`), and again whenever it is
 * asked for. However it is closed, the device has been welcomed. Making a
 * sample book is the one thing it leads to, and is the caller's to open.
 */
export function WelcomeProvider(props: { readonly onSample: () => void; readonly children: JSX.Element }): JSX.Element {
  const app = useApp()
  const [showing, setShowing] = createSignal<Showing>({ type: "when-due" })
  const [due] = createResource(() => loadWelcomeDue(app.services.session, app.services.drafts, app.services.welcome, app.services.firstBook()))
  const open = (): boolean => ((now) => now.type === "asked" || (now.type === "when-due" && due() === true))(showing())
  const close = (): void => {
    app.services.welcome.setWelcomed()
    setShowing({ type: "closed" })
  }
  return (
    <Context.Provider value={{ show: () => setShowing({ type: "asked" }) }}>
      {props.children}
      <WelcomeDialog
        open={open()}
        name={app.services.name}
        onAlone={close}
        onSample={() => {
          close()
          props.onSample()
        }}
      />
    </Context.Provider>
  )
}

export const useWelcome = (): WelcomeState => {
  const found = useContext(Context)
  if (found === undefined) throw new Error("useWelcome called outside WelcomeProvider")
  return found
}
