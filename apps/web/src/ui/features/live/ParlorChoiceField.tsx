import { Show, type JSX } from "solid-js"

import { identityKey } from "../../../core/parlor/parlor"
import { Combobox } from "../../primitives/combobox"
import { PlusIcon } from "../../primitives/icons"
import { LOCATE_REQUEST, typedParlorRefused } from "../../wording/parlor"
import type { ParlorChoice } from "./parlor-choice"

const SUBMIT_PARLOR = "一覧にない店舗を申請する"

const ROUND_BUTTON = "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border text-text-secondary hover:border-text-secondary hover:text-text-primary [&_svg]:size-5"

/** The parlor a play started at none may still be said to have been at, chosen and never typed, with the way to submit one the list lacks: it stands where a play at a parlor has its name. */
export function ParlorChoiceField(props: { readonly parlor: ParlorChoice }): JSX.Element {
  const parlor = props.parlor
  return (
    <div class="flex flex-col gap-1.5 sm:max-w-xl">
      <div class="flex min-w-0 items-end gap-2">
        <div class="min-w-0 flex-1">
          <Combobox
            label="店舗"
            placeholder="指定しない"
            options={parlor.offers().map((offer) => ({ value: identityKey(offer.parlor.identity), label: offer.parlor.name, note: offer.note, foundFirst: offer.unplaced !== undefined }))}
            value={parlor.key() === "" ? undefined : parlor.key()}
            onChange={(key) => parlor.choose(key ?? "")}
            matches={(key, typed) => parlor.offerOf().get(key)?.matches(typed) ?? false}
            invalid={parlor.typedOnly()}
            onTyped={parlor.setTyped}
          />
        </div>
        <button type="button" aria-label={SUBMIT_PARLOR} title={SUBMIT_PARLOR} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => parlor.submitParlor()} class={ROUND_BUTTON}>
          <PlusIcon />
        </button>
      </div>
      <Show when={parlor.locating()} keyed>
        {(address) => (
          <a href={address} class="animate-[emerge_1.6s_ease-out] text-xs text-text-secondary underline underline-offset-2 hover:text-text-primary">
            {LOCATE_REQUEST}
          </a>
        )}
      </Show>
      <Show when={parlor.typedOnly()}>
        <p role="alert" class="text-xs text-negative">
          {typedParlorRefused("recording")}
        </p>
      </Show>
    </div>
  )
}
