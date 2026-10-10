import type { JSX } from "solid-js"

import type { Selection } from "../../../../core/formula/standing"
import type { Formula } from "../../../../core/pachinko/formula"
import { HeartIcon, MedalIcon, PointerIcon } from "../../../primitives/icons"

const REASONS: Readonly<Record<Selection<Formula>["by"], { readonly icon: () => JSX.Element; readonly label: string }>> = {
  favorite: { icon: () => <HeartIcon filled />, label: "お気に入りから選ばれました" },
  ranking: { icon: () => <MedalIcon />, label: "検証とイチオシの順位で選ばれました" },
  person: { icon: () => <PointerIcon />, label: "自分で選びました" },
}

/** Why a formula is the one chosen, as an icon that arrives with it, the size its `class` gives: no words on screen, a name for screen readers. */
export function SelectionReason(props: { readonly by: Selection<Formula>["by"]; readonly class: string }): JSX.Element {
  return (
    <span
      class={`flex items-center justify-center text-accent animate-[arrive_420ms_ease-out] [&_svg]:size-full ${props.class}`}
      role="img"
      aria-label={REASONS[props.by].label}
      title={REASONS[props.by].label}
    >
      {REASONS[props.by].icon()}
    </span>
  )
}
