import type { Accessor } from "solid-js"
import { useRegisterSW } from "virtual:pwa-register/solid"

/**
 * Where the installed app stands against the newest one published.
 *
 * A new version waits to be asked for rather than taking over: a reload takes
 * a half-typed play with it, and that is written down nowhere else.
 */
export type UpdateStatus = { readonly type: "current" } | { readonly type: "offline-ready" } | { readonly type: "update-ready" }

export interface Updates {
  readonly status: Accessor<UpdateStatus>
  readonly apply: () => void
  readonly dismiss: () => void
}

/** Register the service worker and follow it. Must be called inside a reactive owner. */
export function createUpdates(): Updates {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  return {
    status: () => (needRefresh() ? { type: "update-ready" } : offlineReady() ? { type: "offline-ready" } : { type: "current" }),
    apply: () => void updateServiceWorker(true),
    dismiss: () => {
      setNeedRefresh(false)
      setOfflineReady(false)
    },
  }
}
