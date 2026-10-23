import { Match, Switch, type JSX } from "solid-js"

import { createKeptRoom } from "../../../primitives/kept-room"
import { describeError } from "../../../wording/errors"
import { theoreticalFigureText } from "../../../wording/numbers"
import { priorName } from "../../../wording/pachislot/formula"
import { SettingLevelOdds } from "../live/SettingLevelOdds"
import type { SettingInference } from "../../../../application/pachislot/setting-inference"
import { DEFAULT_PRIOR } from "../../../../core/pachislot/prior"
import { seal } from "../../../../mummer"

/** What a reading came to is set in: a dark card with a frame, as a machine would report it. */
const CARD = "flex flex-col gap-3 rounded-[3px] border border-border bg-surface-0 px-4 py-3"

/**
 * What a told play's setting level was read as, under its result: the
 * theoretical value of the games played, each setting level weighed by how
 * likely it now is, then how likely each one is, as the live screen shows
 * it. Why a reading failed, in the same card. While it is read, a line
 * with room below it, so the card coming in drops what is below by less.
 * Read again, it keeps the room the card took until the new one comes.
 * Nothing while nothing is read.
 */
export function SettingInferenceLine(props: { readonly inference: SettingInference }): JSX.Element {
  const room = createKeptRoom(() => props.inference.type === "inferring")
  return (
    <div ref={room.keep} style={room.style()}>
      <Switch>
        <Match when={props.inference.type === "inferring"}>
          <div role="status" class="min-h-40">
            <p class="flex items-center gap-2 text-xs text-text-muted">
              <span aria-hidden="true" class="block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
              事後分布を計算しています
            </p>
          </div>
        </Match>
        <Match when={((now) => (now.type === "inferred" ? now.inferred : undefined))(props.inference)} keyed>
          {(inferred) => (
            <div class={CARD} role="status">
              <div class="flex flex-col gap-1 font-mono">
                <p class="text-xs tracking-widest text-text-secondary">推定期待値</p>
                <p class="origin-left animate-[reveal_480ms_ease-out] text-2xl font-bold tabular-nums text-text-primary">{theoreticalFigureText(seal.tally(inferred.theoreticalValue))}</p>
              </div>
              <SettingLevelOdds settingLevels={inferred.settingLevels} prior={priorName(DEFAULT_PRIOR)} grounded unfolding />
            </div>
          )}
        </Match>
        <Match when={((now) => (now.type === "failed" ? now.error : undefined))(props.inference)} keyed>
          {(error) => (
            <p role="alert" class={`${CARD} text-sm text-text-primary`}>
              {describeError(error)}
            </p>
          )}
        </Match>
      </Switch>
    </div>
  )
}
