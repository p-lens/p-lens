import type { AnalysisDto } from "@p-lens/contracts/pachislot"
import { createResource, For, type JSX } from "solid-js"

import { reasonGrounds } from "../../../../application/pachislot/grounds"
import type { SettingLevelFigures } from "../../../../core/pachislot/figures"
import type { Basis } from "../../../../core/pachislot/formula"
import type { SampledMargin } from "../../../../core/pachislot/grounds/facts"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { groundsLines, groundsStanding, type GroundsTone } from "../../../wording/pachislot/grounds"

const MARKS: Readonly<Record<GroundsTone, string>> = { plain: "", holds: "✓ ", fails: "✗ ", unverified: "？ ", odd: "△ " }

/** A line of grounds in its tone's colour, with its mark before it. */
function Toned(props: { readonly tone: GroundsTone; readonly text: string }): JSX.Element {
  return (
    <span
      classList={{
        "text-text-secondary": props.tone === "plain",
        "text-positive": props.tone === "holds",
        "text-negative": props.tone === "fails",
        "text-text-muted": props.tone === "unverified",
        "text-warning": props.tone === "odd",
      }}
    >
      {MARKS[props.tone]}
      {props.text}
    </span>
  )
}

/**
 * An AT machine's figures reasoned out from its basis by the Prolog
 * reasoner: what the grounds come to in a sentence, then under each setting
 * level, what the AT gains and how the 機械割 comes of it, each step
 * indented under what it supports — the checks marked held or failed, what
 * was taken unchecked and what is guessed to be out of the ordinary marked as such,
 * and a setting level that could not be proved said so.
 */
export function ReasonedGrounds(props: {
  readonly basis: Basis
  readonly analysis: AnalysisDto
  readonly figures: readonly SettingLevelFigures[]
  readonly margins: readonly SampledMargin[] | undefined
}): JSX.Element {
  const app = useApp()
  const [proof] = createResource(
    () => ({ basis: props.basis, analysis: props.analysis, figures: props.figures, margins: props.margins }),
    (source) => reasonGrounds(app.services.pachislotReasoner, source.basis, source.analysis, source.figures, source.margins),
  )
  return (
    <section class="flex flex-col gap-2" aria-label="推論した計算根拠">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">計算根拠（推論）</h2>
      <Loaded outcome={proof()}>
        {(found) => (
          <div class="flex flex-col gap-2">
            <p class="text-sm font-bold">
              <Toned {...groundsStanding(found)} />
            </p>
            <ol class="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
              <For each={groundsLines(found)}>
                {(line) => (
                  <li class="tabular-nums" style={{ "padding-left": `${line.depth * 0.75}rem` }}>
                    <Toned tone={line.tone} text={line.text} />
                  </li>
                )}
              </For>
            </ol>
          </div>
        )}
      </Loaded>
      <p class="text-xs text-text-muted">推論エンジン（Prolog）が、解析値から規則で導き直した根拠です。計算エンジンの値をそのまま使った箇所は、未確認として示しています。</p>
    </section>
  )
}
