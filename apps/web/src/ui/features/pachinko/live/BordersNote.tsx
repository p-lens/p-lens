import { For, type JSX } from "solid-js"

import type { SheetBorders } from "../../../../core/pachinko/theoretical-value"
import { InfoNote } from "../../../primitives/popover"

const borderText = (perThousand: number | undefined): string => (perThousand === undefined ? "--" : `${perThousand.toFixed(1)}回転/千円`)

/**
 * The small i by a live play's border: the play's borders at its corner,
 * every ball rented, six in ten its own and all its own (`playBordersOf`),
 * a line each. Dashes until the corner's terms are known.
 */
export function BordersNote(props: { readonly borders: SheetBorders | undefined }): JSX.Element {
  const lines = (): readonly (readonly [string, number | undefined])[] => [
    ["現金ボーダー", props.borders?.cash],
    ["持玉60%ボーダー", props.borders?.mixed],
    ["持玉100%ボーダー", props.borders?.own],
  ]
  return (
    <InfoNote label="ボーダーについて">
      <dl class="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <For each={lines()}>
          {([label, border]) => (
            <>
              <dt>{label}</dt>
              <dd class="text-right">{borderText(border)}</dd>
            </>
          )}
        </For>
      </dl>
    </InfoNote>
  )
}
