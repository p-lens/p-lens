import type { AnalysisDto } from "@p-lens/contracts/pachinko"
import { createResource, For, type JSX } from "solid-js"

import { reasonGrounds } from "../../../../application/pachinko/grounds"
import type { Basis } from "../../../../core/pachinko/formula"
import { labelsOf } from "../../../../core/pachinko/world"
import type { SampledFigure } from "../../../../core/pachinko/grounds/facts"
import { useApp } from "../../../context"
import { Loaded } from "../../../primitives/states"
import { groundsLines } from "../../../wording/pachinko/grounds"

/**
 * A formula's figures reasoned out from its basis by the Prolog reasoner:
 * each step from the spec sheet to the figure, indented under what it
 * supports, and the checks against the engine — and for a sampled formula,
 * its stored estimate against the exact figure — marked held or failed.
 */
export function ReasonedGrounds(props: { readonly basis: Basis; readonly analysis: AnalysisDto; readonly sampled: SampledFigure | undefined }): JSX.Element {
  const app = useApp()
  const [proof] = createResource(
    () => ({ basis: props.basis, analysis: props.analysis, sampled: props.sampled }),
    (source) => reasonGrounds(app.services.pachinkoReasoner, source.basis, source.analysis, source.sampled),
  )
  const labels = (): ReadonlyMap<string, string> => labelsOf(props.basis.spec)
  return (
    <section class="flex flex-col gap-2" aria-label="推論した計算根拠">
      <h2 class="text-xs font-bold uppercase tracking-wide text-text-muted">計算根拠（推論）</h2>
      <Loaded outcome={proof()}>
        {(found) => (
          <ol class="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 text-sm">
            <For each={groundsLines(found, props.basis.normalized, labels())}>
              {(line) => (
                <li
                  class="tabular-nums"
                  style={{ "padding-left": `${line.depth * 0.75}rem` }}
                  classList={{ "text-text-secondary": line.tone === "plain", "text-positive": line.tone === "holds", "text-negative": line.tone === "fails" }}
                >
                  {line.tone === "holds" ? "✓ " : line.tone === "fails" ? "✗ " : ""}
                  {line.text}
                </li>
              )}
            </For>
          </ol>
        )}
      </Loaded>
      <p class="text-xs text-text-muted">期待値基礎値と計算エンジンの値を事実として、推論エンジン（Prolog）が規則から導いた根拠です。</p>
    </section>
  )
}
