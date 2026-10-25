import { For, type JSX } from "solid-js"

import { BORDER_GRADES, type BorderGrade, type BorderMark } from "../../../../core/pachinko/border-standing"
import { CrownIcon, StarIcon, TrianglesDownIcon, TriangleUpIcon } from "../../../primitives/icons"
import { borderMarkSays, gradeFloorText } from "../../../wording/pachinko/play"

const DRAWN = "[&_svg]:inline [&_svg]:h-3.5 [&_svg]:w-auto [&_svg]:align-[-0.15em]"

const MARKS: Readonly<Record<BorderGrade, { readonly shape: () => JSX.Element; readonly look: string }>> = {
  crowned: { shape: () => <CrownIcon />, look: `text-mark-gold ${DRAWN}` },
  shining: { shape: () => <StarIcon />, look: `text-mark-gold motion-safe:animate-[shine_2.4s_ease-in-out_3] ${DRAWN}` },
  outstanding: { shape: () => <StarIcon />, look: `text-mark-gold ${DRAWN}` },
  excellent: { shape: () => <StarIcon />, look: `text-mark-red ${DRAWN}` },
  strong: { shape: () => <TriangleUpIcon />, look: `text-mark-purple ${DRAWN}` },
  professional: { shape: () => <TriangleUpIcon />, look: `text-mark-green ${DRAWN}` },
  modest: { shape: () => <TriangleUpIcon />, look: `text-mark-blue ${DRAWN}` },
  near: { shape: () => <TrianglesDownIcon count={1} />, look: `text-mark-yellow ${DRAWN}` },
  short: { shape: () => <TrianglesDownIcon count={1} />, look: `text-mark-red ${DRAWN}` },
  shorter: { shape: () => <TrianglesDownIcon count={2} />, look: `text-mark-red ${DRAWN}` },
  deep: { shape: () => <TrianglesDownIcon count={3} />, look: `text-mark-red ${DRAWN}` },
  deepest: { shape: () => <TrianglesDownIcon count={4} />, look: `text-mark-red ${DRAWN}` },
}

/** A mark that says where the play stands against its border and how far, by its shape and colour and, for whoever cannot see them, in words. */
export function StandingMark(props: { readonly mark: BorderMark }): JSX.Element {
  return (
    <span role="img" aria-label={borderMarkSays(props.mark)} title={borderMarkSays(props.mark)} class={`ml-1 align-middle text-xs ${MARKS[props.mark.grade].look}`}>
      {MARKS[props.mark.grade].shape()}
    </span>
  )
}

/** Every mark a play's spin performance can wear, the best first, as a table of two columns: the mark, and the hour's worth it stands for. */
export function StandingMarksLegend(): JSX.Element {
  return (
    <table class="w-full text-xs">
      <thead>
        <tr class="border-b border-border text-left text-text-muted">
          <th scope="col" class="w-12 py-1 font-normal">記号</th>
          <th scope="col" class="py-1 font-normal">時給換算</th>
        </tr>
      </thead>
      <tbody>
        <For each={BORDER_GRADES}>
          {(grade: BorderGrade) => (
            <tr class="border-b border-border/50 last:border-b-0">
              <td class="py-1">
                <StandingMark mark={{ standing: BORDER_GRADES.indexOf(grade) < BORDER_GRADES.indexOf("near") ? "above" : "below", grade }} />
              </td>
              <td class="py-1 tabular-nums">{gradeFloorText(grade)}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}
