const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** As much of Turnstile's browser API as is used. */
interface Turnstile {
  render(container: HTMLElement, options: Readonly<Record<string, unknown>>): string
  remove(widget: string): void
}

const turnstileOf = (): Turnstile | undefined => (window as unknown as { readonly turnstile?: Turnstile }).turnstile

/** Turnstile's script, loaded the first time a check is asked for and kept; a failure is not kept, so the next ask tries again. */
const loader = (): (() => Promise<Turnstile | undefined>) => {
  const held: { loading: Promise<Turnstile | undefined> | undefined } = { loading: undefined }
  const load = (): Promise<Turnstile | undefined> =>
    new Promise((settle) => {
      const script = document.createElement("script")
      script.src = SCRIPT
      script.async = true
      script.onload = () => settle(turnstileOf())
      script.onerror = () => {
        held.loading = undefined
        script.remove()
        settle(undefined)
      }
      document.head.append(script)
    })
  return () => {
    const loading = held.loading ?? load()
    held.loading = loading
    return loading
  }
}

/**
 * Cloudflare Turnstile on this page: a token showing a person is registering
 * from the app's own page, asked for each time something new is registered —
 * a token is good once. Most people see nothing; one Turnstile is unsure of
 * is shown a check in the corner. None, if the check cannot be had.
 */
export const createTurnstileCheck = (siteKey: string): (() => Promise<string | undefined>) => {
  const loaded = loader()
  return async () => {
    const turnstile = await loaded()
    if (turnstile === undefined) return undefined
    const container = document.createElement("div")
    container.style.cssText = "position:fixed;right:1rem;bottom:1rem;z-index:60"
    document.body.append(container)
    const token = await new Promise<string | undefined>((settle) => {
      turnstile.render(container, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: (given: string) => settle(given),
        "error-callback": () => settle(undefined),
        "expired-callback": () => settle(undefined),
      })
    })
    container.remove()
    return token
  }
}
