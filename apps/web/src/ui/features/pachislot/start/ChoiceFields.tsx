import { Show, type JSX } from "solid-js"

import { ranked, sameWorth, type Selection } from "../../../../core/formula/standing"
import type { Formula, FormulaId, SettingDistributionId } from "../../../../core/pachislot/formula"
import { STOCK_SPREADS, type ChosenPrior, type PriorSelection, type StockSpreadKey } from "../../../../core/pachislot/prior"
import type { PachislotMachineDetail } from "../../../../core/catalog/catalog"
import { copyText } from "../../../primitives/clipboard"
import { CopyIcon, HeartIcon, MedalIcon, PointerIcon, QuestionIcon } from "../../../primitives/icons"
import { createNudge, redRing } from "../../../primitives/nudge"
import { HintedIconButton } from "../../../primitives/popover"
import { Select, type SelectOption } from "../../../primitives/select"
import { toast } from "../../../primitives/toast"
import { useMoves } from "../../../navigation/moves"
import { EVEN_PRIOR_NAME, formulaHandle, formulaNameAmong, STOCK_SPREAD_NAMES } from "../../../wording/pachislot/formula"
import { KindMark } from "../formulas/KindMark"

type Reason = Selection<Formula>["by"] | PriorSelection["by"]

const REASONS: Readonly<Record<Exclude<Reason, "default">, { readonly icon: () => JSX.Element; readonly label: string }>> = {
  favorite: { icon: () => <HeartIcon filled />, label: "お気に入りから選ばれました" },
  ranking: { icon: () => <MedalIcon />, label: "検証とイチオシの順位で選ばれました" },
  person: { icon: () => <PointerIcon />, label: "自分で選びました" },
}

/** Why a formula or a prior is the one chosen, as a small icon that arrives with it, set after the field's label; nothing for an even spread nobody chose. */
export function ChoiceReason(props: { readonly by: Reason }): JSX.Element {
  return (
    <Show when={props.by === "default" ? undefined : REASONS[props.by]} keyed>
      {(reason) => (
        <span
          class="flex size-3.5 shrink-0 items-center justify-center text-accent animate-[arrive_420ms_ease-out] [&_svg]:size-full"
          role="img"
          aria-label={reason.label}
          title={reason.label}
        >
          {reason.icon()}
        </span>
      )}
    </Show>
  )
}

/**
 * The formula a pachislot play will be weighed against, beside its machine:
 * chosen for you — your favourite, or else the best ranked — with an icon
 * saying which, or chosen by hand on the machine's page, which pressing it
 * opens: the machine's formulas side by side, one of them taken with
 * 「これを使う」. The question mark opens the one chosen, and the copy button
 * puts its id and name on the clipboard for passing on. Before a machine is chosen
 * it is there, waiting: pressing it nudges the machine — or the field
 * itself, while the machine chosen is still being read — and the two
 * buttons each say what they are for.
 */
export function FormulaPicker(props: {
  readonly detail: PachislotMachineDetail | undefined
  readonly machineChosen: boolean
  readonly selection: Selection<Formula> | undefined
  /** Opens the machine's page, where its formulas are chosen from. */
  readonly onOpenMachine: (machineId: string) => void
  readonly onWaitingOnMachine: () => void
}): JSX.Element {
  const moves = useMoves()
  const empty = createNudge()
  const press = (): void => {
    if (!props.machineChosen) props.onWaitingOnMachine()
    else if (props.detail === undefined) empty.nudge()
    else props.onOpenMachine(props.detail.machine.id)
  }
  const waitingText = (): string => (props.machineChosen ? "算出条件を選ぶ" : "先に機種を選んでください")
  const nameOf = (chosen: Selection<Formula>): string =>
    formulaNameAmong(
      chosen.listing.formula,
      (props.detail?.formulas ?? []).map((listing) => listing.formula),
    )
  const open = (formulaId: FormulaId): void => {
    if (props.detail !== undefined) moves.go({ kind: "pachislot-formula", machineId: props.detail.machine.id, formulaId })
  }
  /** The chosen formula's id and name, put on the clipboard for passing on — "pick this one" — to whoever plays beside you. */
  const copyChosen = async (chosen: Selection<Formula>): Promise<void> => {
    const handle = formulaHandle(chosen.listing.formula)
    const copied = await copyText(handle)
    toast(copied.ok ? { title: "算出条件のIDと名前をコピーしました", description: handle } : { title: "コピーできませんでした", tone: "error" })
  }
  const copySelected = async (): Promise<void> => {
    if (props.selection !== undefined) await copyChosen(props.selection)
  }
  const openSelected = (): void => {
    if (props.selection !== undefined) open(props.selection.listing.formula.id)
  }
  return (
    <div class="flex items-end gap-1">
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <span class="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-text-secondary" id="pachislot-formula-field-label">
          算出条件
          <Show when={props.selection} keyed>
            {(selected) => <ChoiceReason by={selected.by} />}
          </Show>
        </span>
        <button
          type="button"
          aria-labelledby="pachislot-formula-field-label"
          aria-invalid={empty.red()}
          onClick={press}
          onFocus={empty.settle}
          classList={redRing(empty.red())}
          class="flex h-10 items-center justify-between gap-2 rounded-[3px] bg-surface-input px-3 text-left focus:outline-2 focus:outline-offset-0 focus:outline-focus-ring"
        >
          <Show when={props.selection} keyed fallback={<span class="truncate text-text-muted">{waitingText()}</span>}>
            {(selected) => (
              <span class="flex min-w-0 items-center gap-2 text-text-primary">
                <KindMark kind={selected.listing.formula.kind} />
                <span class="truncate">{nameOf(selected)}</span>
              </span>
            )}
          </Show>
          <span class="text-text-muted" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      <HintedIconButton label="算出条件のIDと名前をコピー" hint="算出条件のIDと名前をコピーできます" ready={props.selection !== undefined} onPress={() => void copySelected()}>
        <CopyIcon />
      </HintedIconButton>
      <HintedIconButton label="算出条件を見る" hint="算出条件の根拠が見れます" ready={props.selection !== undefined} onPress={openSelected} semipro>
        <QuestionIcon />
      </HintedIconButton>
    </div>
  )
}

const EVEN = "even"

/** What a stock spread's value in the list begins with, so that it is told from a 設定配分's id. */
const STOCK = "stock:"

const stockValue = (key: StockSpreadKey): string => `${STOCK}${key}`

/**
 * The prior a pachislot play's setting level is inferred from: an ordinary
 * day's stock spread unless a 設定配分 is kept as the favourite or one is chosen
 * here by hand. It is there from the first, like the formula beside it:
 * before a machine is chosen it waits, and pressing it nudges the machine.
 */
export function PriorPicker(props: {
  /** The machine chosen, with its 設定配分; none until one is, and the field then waits on it. */
  readonly detail: PachislotMachineDetail | undefined
  readonly selection: PriorSelection | undefined
  readonly onChoose: (prior: ChosenPrior) => void
  readonly onWaitingOnMachine: () => void
}): JSX.Element {
  const options = (): readonly SelectOption[] => {
    const detail = props.detail
    if (detail === undefined || props.selection === undefined) return []
    return [
      ...STOCK_SPREADS.map((key) => ({ value: stockValue(key), label: STOCK_SPREAD_NAMES[key] })),
      { value: EVEN, label: EVEN_PRIOR_NAME },
      ...ranked(detail.distributions, sameWorth).map((listing) => ({ value: listing.formula.id, label: listing.formula.label })),
    ]
  }
  const chosen = (): string | undefined => {
    const prior = props.selection?.prior
    if (prior === undefined) return undefined
    if (prior.type === "distribution") return prior.id
    return prior.type === "stock" ? stockValue(prior.key) : EVEN
  }
  const choose = (value: string): ChosenPrior => {
    if (value === EVEN) return { type: "even" }
    return value.startsWith(STOCK) ? { type: "stock", key: value.slice(STOCK.length) } : { type: "distribution", id: value as SettingDistributionId }
  }
  return (
    <div class="flex items-end gap-1">
      <div class="min-w-0 flex-1">
        <Select
          label="設定配分"
          placeholder="先に機種を選んでください"
          options={options()}
          value={chosen()}
          onChange={(value) => props.onChoose(choose(value))}
          onEmptyPress={props.onWaitingOnMachine}
          labelMark={() => (
            <Show when={props.selection} keyed>
              {(selected) => <ChoiceReason by={selected.by} />}
            </Show>
          )}
        />
      </div>
    </div>
  )
}
