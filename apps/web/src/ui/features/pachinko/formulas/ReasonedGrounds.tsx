import type { AnalysisDto } from "@p-lens/contracts/pachinko"
import { createResource, For, type JSX } from "solid-js"

import { reasonGrounds } from "../../../../application/pachinko/grounds"
import type { Figures } from "../../../../core/pachinko/figures"
import type { Basis } from "../../../../core/pachinko/formula"
import { labelsOf } from "../../../../core/pachinko/world"
import type { SampledFigure } from "../../../../core/pachinko/grounds/facts"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { groundsLines, groundsStanding, type GroundsTone } from "../../../wording/pachinko/grounds"

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
 * A formula's figures reasoned out from its basis by the Prolog reasoner:
 * what the grounds come to in a sentence, then each step from the spec
 * sheet to the figure, indented under what it supports — the checks marked
 * held or failed, what was taken unchecked and what is guessed to be out of the
 * ordinary marked as such, and a part that could not be proved said so.
 */
export function ReasonedGrounds(props: { readonly basis: Basis; readonly analysis: AnalysisDto; readonly figures: Figures; readonly sampled: SampledFigure | undefined }): JSX.Element {
  const app = useApp()
  const [proof] = createResource(
    () => ({ basis: props.basis, analysis: props.analysis, figures: props.figures, sampled: props.sampled }),
    (source) => reasonGrounds(app.services.pachinkoReasoner, source.basis, source.analysis, source.figures, source.sampled),
  )
  const labels = (): ReadonlyMap<string, string> => labelsOf(props.basis.spec)
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
              <For each={groundsLines(found, props.basis.normalized, labels())}>
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
      <p class="text-xs text-text-muted">推論エンジン（Prolog）が、期待値基礎値から規則で導き直した根拠です。計算エンジンが解いた値は、そのまま信じずに式へ入れて確かめています。</p>
    </section>
  )
}
