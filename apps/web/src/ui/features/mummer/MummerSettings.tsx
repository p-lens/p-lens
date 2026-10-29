import { Show, type JSX } from "solid-js"
import { MainContent } from "solid-gathering-shell"

import { clearPlainLabel, isMumming, startMumming, stopMumming } from "../../../mummer"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { toast } from "../../primitives/toast"
import type { Place } from "../../navigation/place"
import { INSTALL_GUIDE, MUMMER_ADDRESS_SHOWN, MUMMER_CHOOSE_FIRST, MUMMER_EXPLAINED, MUMMER_HEADING, MUMMER_TURN, PLAIN_LABEL_CLEAR, PLAIN_LABEL_CLEAR_EXPLAINED, plainLabelClearedText } from "../../wording/mummer"
import { ViewHeader } from "../shell/ViewHeader"
import { isInstalled } from "./installed"

/** Where mumming is turned on and off: the one place it is turned off, which the mark in the top bar leads to while it is on, and where the plain label left after it can be taken away before the business day turns. In a browser's tab it says that the address is not veiled, and is turned all the same: what it does veil is no less worth veiling. */
export function MummerSettings(props: { readonly place: Place }): JSX.Element {
  const app = useApp()
  return (
    <MainContent header={<ViewHeader place={props.place} title={MUMMER_HEADING} />}>
      <div class="max-w-5xl">
        <div class="flex flex-col gap-3 p-4">
          <label class="flex cursor-pointer items-center gap-3 rounded-md bg-surface-1 px-3 py-3">
            <input type="checkbox" checked={isMumming()} onChange={(event) => (event.currentTarget.checked ? startMumming(app.services.businessDay()) : stopMumming(app.services.businessDay()))} class="size-5 shrink-0 accent-accent" />
            <span class="min-w-0 flex-1 text-sm font-medium text-text-primary">{MUMMER_TURN}</span>
          </label>
          <p class="text-xs text-text-muted">{MUMMER_EXPLAINED}</p>
          <p class="text-xs text-text-muted">{MUMMER_CHOOSE_FIRST}</p>
          <Show when={!isInstalled()}>
            <p class="text-xs text-warning">
              {MUMMER_ADDRESS_SHOWN}
              <Show when={app.services.installGuide} keyed>
                {(guide) => (
                  <a href={guide} target="_blank" rel="noreferrer" class="ml-1 text-accent hover:underline">
                    {INSTALL_GUIDE}
                  </a>
                )}
              </Show>
            </p>
          </Show>
          <div class="flex items-center gap-3">
            <p class="min-w-0 flex-1 text-xs text-text-muted">{PLAIN_LABEL_CLEAR_EXPLAINED}</p>
            <Button type="button" variant="outline" size="small" class="shrink-0" onClick={() => toast({ title: plainLabelClearedText(clearPlainLabel(app.services.businessDay())) })}>
              {PLAIN_LABEL_CLEAR}
            </Button>
          </div>
        </div>
      </div>
    </MainContent>
  )
}
