import { createSignal, type JSX } from "solid-js"

import type { TokenKind } from "../../../core/commodity/commodity"
import { tokensInBoxes, type BoxCount as Count } from "../../../core/live-play/box-count"
import { tidyTyped } from "../../../core/text/tidy"
import { seal } from "../../../mummer"
import { Button } from "../../primitives/button"
import { DetailButton } from "../../primitives/detail-button"
import { BoxIcon } from "../../primitives/icons"
import { TextField } from "../../primitives/text-field"
import { amountText, tokenUnit } from "../../wording/numbers"

const COUNT = /^\d+$/

/** A count as typed, none where it is empty or is not one. */
const countOf = (text: string): number | undefined => ((plain) => (COUNT.test(plain) ? Number(plain) : undefined))(tidyTyped(text).replaceAll(",", ""))

/**
 * The tokens in hand counted by the box, behind a small button beside
 * where they are typed: the full boxes, how many one holds — opening on
 * what it held when last used at the parlor — and those loose beside them,
 * and what they come to, put into the field at a press. Boxes left empty
 * are none, and so are loose tokens.
 */
export function BoxCount(props: { readonly kind: TokenKind; readonly perBox: number | undefined; readonly onCounted: (tokens: number, perBox: number) => void }): JSX.Element {
  const unit = (): string => tokenUnit(props.kind)
  const [boxes, setBoxes] = createSignal("")
  const [perBox, setPerBox] = createSignal(props.perBox === undefined ? "" : String(props.perBox))
  const [loose, setLoose] = createSignal("")
  const count = (): Count | undefined => {
    const each = countOf(perBox())
    const full = boxes().trim() === "" ? 0 : countOf(boxes())
    const rest = loose().trim() === "" ? 0 : countOf(loose())
    return each === undefined || each <= 0 || full === undefined || rest === undefined ? undefined : { boxes: full, perBox: each, loose: rest }
  }
  return (
    <DetailButton label={" "} face={<BoxIcon />} says="箱で数える" marked={false} invalid={false} tone="semipro" placement="top-end" fitted>
      <div class="flex w-56 flex-col gap-2">
        <div class="grid grid-cols-3 gap-2">
          <TextField label="箱数" value={boxes()} onChange={setBoxes} inputMode="numeric" suffix="箱" compact />
          <TextField label={`1箱の${unit()}数`} value={perBox()} onChange={setPerBox} inputMode="numeric" suffix={unit()} compact />
          <TextField label="上皿・バラ" value={loose()} onChange={setLoose} inputMode="numeric" suffix={unit()} compact />
        </div>
        <div class="flex items-center justify-between gap-2">
          <output class="text-sm font-bold tabular-nums text-text-primary">{((found) => (found === undefined ? "--" : `${amountText(seal.play(tokensInBoxes(found)))}${unit()}`))(count())}</output>
          <Button
            type="button"
            size="small"
            onClick={() => {
              const found = count()
              if (found !== undefined) props.onCounted(tokensInBoxes(found), found.perBox)
            }}
          >
            入れる
          </Button>
        </div>
      </div>
    </DetailButton>
  )
}
