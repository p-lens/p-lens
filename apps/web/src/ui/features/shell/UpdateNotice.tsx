import { Match, Switch, type JSX } from "solid-js"

import { useApp } from "../../context"
import { KeptOnDeviceIcon, NewVersionIcon } from "../../primitives/icons"

const UPDATE_READY = "更新があります"

const OFFLINE_READY = "オフラインでも使えます（押すと閉じます）"

/**
 * Where the installed app stands, in the top bar's corner: a new version
 * waiting, or the app now kept on the device and working offline. Never
 * laid over the screen, where it would cover whatever is at the bottom of a
 * form. A narrow window's corner has no room for words, so there each is
 * its mark alone, named by them.
 */
export function UpdateNotice(): JSX.Element {
  const { updates } = useApp()
  return (
    <Switch>
      <Match when={updates.status().type === "update-ready"}>
        <button
          type="button"
          onClick={() => updates.apply()}
          aria-label={UPDATE_READY}
          title={UPDATE_READY}
          class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded bg-accent text-xs font-medium text-accent-contrast hover:bg-accent-hover sm:h-auto sm:px-2 sm:py-0.5 [&_svg]:size-5"
        >
          <span class="hidden whitespace-nowrap sm:inline">{UPDATE_READY}</span>
          <span class="sm:hidden">
            <NewVersionIcon />
          </span>
        </button>
      </Match>
      <Match when={updates.status().type === "offline-ready"}>
        <button
          type="button"
          onClick={() => updates.dismiss()}
          aria-label={OFFLINE_READY}
          title={OFFLINE_READY}
          class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded text-xs text-text-muted hover:bg-surface-3 sm:px-2 [&_svg]:size-5"
        >
          <span class="hidden whitespace-nowrap sm:inline">オフライン対応済み ✓</span>
          <span class="sm:hidden">
            <KeptOnDeviceIcon />
          </span>
        </button>
      </Match>
    </Switch>
  )
}
