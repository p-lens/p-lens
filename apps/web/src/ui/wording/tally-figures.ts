import { toPlainString, type Decimal } from "../../core/decimal/decimal"
import { playTimeText } from "./breakdown"
import { formatCount } from "./numbers"

/** The heading a tally's own figures stand under: what the person's own playing came to, never what a counter showed. */
export const TALLY_FIGURES_HEADING = "自分の記録"

/** A count with its unit, or dashes in its shape where the tally says none: `12回`, `--回`. */
export const countText = (count: number | undefined, unit: string): string => `${count === undefined ? "--" : formatCount(count)}${unit}`

/** A spin performance or a border, to a tenth, or dashes in its shape where the tally says none: `18.5回転/千円`, `--回転/千円`. */
export const perThousandText = (perThousand: Decimal | undefined): string => `${perThousand === undefined ? "--" : Number(toPlainString(perThousand)).toFixed(1)}回転/千円`

/** How long a tally's play lasted, or dashes in its shape where it does not say: `2時間5分`, `--時間--分`. */
export const lastedText = (seconds: Decimal | undefined): string => (seconds === undefined ? "--時間--分" : playTimeText(seconds))
