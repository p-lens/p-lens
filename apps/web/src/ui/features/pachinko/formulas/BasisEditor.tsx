import { For, Index, Show, type JSX } from "solid-js"

import { Button } from "../../../primitives/button"
import { PlusIcon, TrashIcon } from "../../../primitives/icons"
import { Select, type SelectOption } from "../../../primitives/select"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { modeTitle } from "../../../wording/pachinko/formula"
import { type AllotmentRow, type BasisForm, type EarlyEndRow, EMPTY_ROUNDS, EMPTY_ROW, type ModeForm, type ModeKindName, REGULAR, type RoundsRow, freshModeKey, newMode } from "./formula-form"

const KINDS: readonly { readonly kind: ModeKindName; readonly label: string }[] = [
  { kind: "rushing", label: "継続率" },
  { kind: "special-time", label: "ST" },
  { kind: "rapid", label: "時短" },
  { kind: "leftover-queue", label: "残保留" },
  { kind: "until-hit", label: "次回まで" },
]

const isKind = (value: string | null): value is ModeKindName => KINDS.some((entry) => entry.kind === value)

/** The modes as choices, each named by its title: `all` is every mode of the form, so one not yet named keeps its place's number wherever it is listed. */
const modeOptions = (modes: readonly ModeForm[], all: readonly ModeForm[]): readonly SelectOption[] =>
  modes.map((mode) => ({ value: mode.key, label: modeTitle(mode.label, all.findIndex((each) => each.key === mode.key) + 1) }))

const destinations = (modes: readonly ModeForm[], all: readonly ModeForm[]): readonly SelectOption[] => [{ value: REGULAR, label: "通常" }, ...modeOptions(modes, all)]

const replaced = <T,>(items: readonly T[], index: number, item: T): readonly T[] => items.map((existing, at) => (at === index ? item : existing))

/** The rounds a jackpot opens through one attacker: how many, and that attacker's prize and count where they are not the machine's. */
function RoundsFields(props: {
  readonly row: RoundsRow
  readonly labelHidden: boolean
  readonly prizeBalls: string
  readonly count: string
  readonly onChange: (row: RoundsRow) => void
  readonly children: JSX.Element
}): JSX.Element {
  return (
    <div class="grid grid-cols-[repeat(3,minmax(0,1fr))_2.25rem] items-end gap-1.5 [&>*]:min-w-0">
      <TextField label="R数" labelHidden={props.labelHidden} value={props.row.rounds} onChange={(rounds) => props.onChange({ ...props.row, rounds })} inputMode="numeric" suffix="R" compact />
      <TextField label="賞球" labelHidden={props.labelHidden} value={props.row.prize} onChange={(prize) => props.onChange({ ...props.row, prize })} inputMode="numeric" placeholder={props.prizeBalls} suffix="個" compact />
      <TextField label="カウント" labelHidden={props.labelHidden} value={props.row.count} onChange={(count) => props.onChange({ ...props.row, count })} inputMode="numeric" placeholder={props.count} suffix="C" compact />
      {props.children}
    </div>
  )
}

function AllotmentEditor(props: {
  readonly title: string
  readonly rows: readonly AllotmentRow[]
  readonly modes: readonly ModeForm[]
  /** The machine's own prize and count, shown waiting in rounds that name none. */
  readonly prizeBalls: string
  readonly count: string
  readonly onChange: (rows: readonly AllotmentRow[]) => void
}): JSX.Element {
  const set = (index: number, row: AllotmentRow): void => props.onChange(replaced(props.rows, index, row))
  return (
    <div class="flex flex-col gap-2">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">{props.title}</span>
      <Index each={props.rows}>
        {(row, index) => (
          <div class="flex flex-col gap-1.5">
            <div class="grid grid-cols-[4.5rem_minmax(0,1fr)_4.75rem_2.25rem] items-end gap-1.5 [&>*]:min-w-0">
              <TextField label="振分" labelHidden={index > 0} value={row().share} onChange={(share) => set(index, { ...row(), share })} inputMode="decimal" suffix="%" compact />
              <Select label="その後" labelHidden={index > 0} placeholder="行き先" options={destinations(props.modes, props.modes)} value={row().next} onChange={(next) => set(index, { ...row(), next })} />
              <TextField label="大当り回数" labelHidden={index > 0} value={row().jackpots} onChange={(jackpots) => set(index, { ...row(), jackpots })} inputMode="numeric" placeholder="1" suffix="回" compact />
              <Show when={props.rows.length > 1} fallback={<span />}>
                <Button variant="outline" size="icon" aria-label={`${index + 1}行目の振分を削除`} title="この振分を削除" onClick={() => props.onChange(props.rows.filter((_, at) => at !== index))}>
                  <TrashIcon />
                </Button>
              </Show>
            </div>
            <div class="ml-2 flex flex-col gap-1.5 border-l border-border pl-2">
              <RoundsFields row={row()} labelHidden={index > 0} prizeBalls={props.prizeBalls} count={props.count} onChange={(rounds) => set(index, { ...row(), ...rounds })}>
                <Button variant="outline" size="icon" aria-label={`${index + 1}行目に別アタッカーのラウンドを追加`} title="別アタッカーのラウンドを追加" onClick={() => set(index, { ...row(), others: [...row().others, EMPTY_ROUNDS] })}>
                  <PlusIcon />
                </Button>
              </RoundsFields>
              <Index each={row().others}>
                {(other, at) => (
                  <RoundsFields row={other()} labelHidden prizeBalls={props.prizeBalls} count={props.count} onChange={(rounds) => set(index, { ...row(), others: replaced(row().others, at, rounds) })}>
                    <Button variant="outline" size="icon" aria-label={`${index + 1}行目の別アタッカー${at + 1}を削除`} title="この別アタッカーのラウンドを削除" onClick={() => set(index, { ...row(), others: row().others.filter((_, each) => each !== at) })}>
                      <TrashIcon />
                    </Button>
                  </RoundsFields>
                )}
              </Index>
            </div>
          </div>
        )}
      </Index>
      <div>
        <Button variant="outline" size="small" onClick={() => props.onChange([...props.rows, EMPTY_ROW])}>
          <PlusIcon />
          振分
        </Button>
      </div>
    </div>
  )
}

/**
 * A 時短's early end, a c時短: its chance on each spin, empty where it has
 * none, and the shares of where play goes then — a shorter 時短 most often.
 */
function EarlyEndEditor(props: {
  readonly mode: ModeForm
  readonly destinations: readonly SelectOption[]
  readonly onChange: (change: Pick<ModeForm, "earlyEndChance" | "earlyEndTo">) => void
}): JSX.Element {
  const rows = (): readonly EarlyEndRow[] => props.mode.earlyEndTo
  const setRows = (earlyEndTo: readonly EarlyEndRow[]): void => props.onChange({ earlyEndChance: props.mode.earlyEndChance, earlyEndTo })
  return (
    <div class="flex flex-col gap-2">
      <div class="w-40">
        <TextField label="c時短の確率 1/" value={props.mode.earlyEndChance} onChange={(earlyEndChance) => props.onChange({ earlyEndChance, earlyEndTo: rows() })} inputMode="decimal" placeholder="なし" />
      </div>
      <Index each={rows()}>
        {(row, index) => (
          <div class="grid max-w-md grid-cols-[4.5rem_minmax(0,1fr)_2.25rem] items-end gap-1.5 [&>*]:min-w-0">
            <TextField label="振分" labelHidden={index > 0} value={row().share} onChange={(share) => setRows(replaced(rows(), index, { ...row(), share }))} inputMode="decimal" suffix="%" compact />
            <Select label="c時短の行き先" labelHidden={index > 0} placeholder="行き先" options={props.destinations} value={row().next} onChange={(next) => setRows(replaced(rows(), index, { ...row(), next }))} />
            <Show when={rows().length > 1} fallback={<span />}>
              <Button variant="outline" size="icon" aria-label={`c時短の${index + 1}行目の行き先を削除`} title="この行き先を削除" onClick={() => setRows(rows().filter((_, at) => at !== index))}>
                <TrashIcon />
              </Button>
            </Show>
          </div>
        )}
      </Index>
      <div>
        <Button variant="outline" size="small" onClick={() => setRows([...rows(), { share: "", next: REGULAR }])}>
          <PlusIcon />
          c時短の行き先
        </Button>
      </div>
      <p class="text-xs text-text-muted">時短中の1回転ごとに、この確率で大当りなしに時短が終わり、行き先へ移ります。終わるまでの回転も遊タイムまでの回転数に数えます。空欄なら c時短はありません。</p>
    </div>
  )
}

function ModeEditor(props: {
  readonly mode: ModeForm
  readonly modes: readonly ModeForm[]
  readonly prizeBalls: string
  readonly count: string
  readonly onChange: (mode: ModeForm) => void
  readonly onRemove: () => void
}): JSX.Element {
  const set =
    <K extends keyof ModeForm>(key: K) =>
    (value: ModeForm[K]): void =>
      props.onChange({ ...props.mode, [key]: value })
  const others = (): readonly ModeForm[] => props.modes.filter((mode) => mode.key !== props.mode.key)
  return (
    <section class="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <TextField label="モード名" value={props.mode.label} onChange={set("label")} placeholder="RUSH・LT・時短…" />
        </div>
        <Button variant="outline" size="icon" aria-label="このモードを削除" title="このモードを削除" onClick={() => props.onRemove()}>
          <TrashIcon />
        </Button>
      </div>
      <ToggleGroup
        value={props.mode.kind}
        onChange={(value: string | null) => {
          if (isKind(value)) set("kind")(value)
        }}
        aria-label="続き方"
      >
        <For each={KINDS}>
          {(entry) => (
            <ToggleGroupItem value={entry.kind} class="px-2 sm:px-3">
              {entry.label}
            </ToggleGroupItem>
          )}
        </For>
      </ToggleGroup>
      <Show when={props.mode.kind === "rushing"}>
        <div class="w-40">
          <TextField label="継続率" value={props.mode.continuationRate} onChange={set("continuationRate")} inputMode="decimal" suffix="%" />
        </div>
      </Show>
      <Show when={props.mode.kind === "special-time"}>
        <div class="grid max-w-md grid-cols-2 gap-3">
          <TextField label="回転数" value={props.mode.spins} onChange={set("spins")} inputMode="numeric" suffix="回転" />
          <TextField label="大当り確率 1/" value={props.mode.chance} onChange={set("chance")} inputMode="decimal" />
        </div>
      </Show>
      <Show when={props.mode.kind === "rapid"}>
        <div class="grid max-w-md grid-cols-2 gap-3">
          <TextField label="回転数" value={props.mode.spins} onChange={set("spins")} inputMode="numeric" suffix="回転" />
          <TextField label="大当り確率 1/" value={props.mode.chance} onChange={set("chance")} inputMode="decimal" />
        </div>
        <p class="text-xs text-text-muted">大当り確率が空欄なら通常時と同じです。一種二種混合機で、時短中は小当りも合わせた確率になる機種は、その確率を入れてください。時短の回転は遊タイムまでの回転数に数えます。</p>
        <EarlyEndEditor mode={props.mode} destinations={destinations(others(), props.modes)} onChange={(change) => props.onChange({ ...props.mode, ...change })} />
      </Show>
      <Show when={props.mode.kind === "leftover-queue"}>
        <div class="w-40">
          <TextField label="残保留" value={props.mode.draws} onChange={set("draws")} inputMode="numeric" suffix="個" />
        </div>
        <p class="text-xs text-text-muted">通常時の確率で抽選します。高確率のまま消化する機種は、STの回転数に含めてください。</p>
      </Show>
      <AllotmentEditor title="このモード中の大当り振分" rows={props.mode.allotment} modes={props.modes} prizeBalls={props.prizeBalls} count={props.count} onChange={set("allotment")} />
      <div class="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3 [&>*]:min-w-0">
        <Select label="終了後" placeholder="行き先" options={destinations(others(), props.modes)} value={props.mode.onMiss} onChange={set("onMiss")} />
        <Select
          label="ラッキートリガー先"
          placeholder="なし"
          options={[{ value: "", label: "なし" }, ...modeOptions(others(), props.modes)]}
          value={props.mode.triggerTo}
          onChange={set("triggerTo")}
        />
        <Show when={props.mode.triggerTo !== ""}>
          <TextField label="何連目で移行" value={props.mode.triggerCombo} onChange={set("triggerCombo")} inputMode="numeric" suffix="連目" />
        </Show>
      </div>
      <label class="flex cursor-pointer items-center gap-2 self-start text-sm text-text-primary">
        <input type="checkbox" checked={props.mode.withoutSupport} onChange={(event) => set("withoutSupport")(event.currentTarget.checked)} class="size-5 shrink-0 accent-accent" />
        電サポなし・ヘソで打つ（CZ・潜確など。回数のあるモードは通常時と同じく玉を使う。残保留はいつも電サポなし）
      </label>
    </section>
  )
}

/**
 * The 遊タイム, if the machine has one: its count, and the mode it leads to.
 * Its last choice is always a new one — a 時短 — made and chosen at once.
 */
/** The choice that makes a new 時短 for the 遊タイム rather than naming a mode. */
const NEW_RAPID_MODE = "new-rapid-mode"

function ReliefDriveEditor(props: { readonly form: BasisForm; readonly onChange: (form: BasisForm) => void }): JSX.Element {
  const makeRapidMode = (): void => {
    const key = freshModeKey(props.form.modes)
    const rapidMode: ModeForm = { ...newMode(key, "遊タイム"), kind: "rapid", allotment: [{ ...EMPTY_ROW, share: "100", rounds: "10" }] }
    props.onChange({ ...props.form, modes: [...props.form.modes, rapidMode], reliefDriveTo: key })
  }
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-bold uppercase tracking-wide text-text-secondary">遊タイム</span>
      <div class="grid max-w-md grid-cols-[8rem_minmax(0,1fr)] items-end gap-2">
        <TextField label="発動まで" value={props.form.reliefDriveGauge} onChange={(reliefDriveGauge) => props.onChange({ ...props.form, reliefDriveGauge })} inputMode="numeric" suffix="回転" placeholder="なし" />
        <Select
          label="移行先"
          placeholder="選ぶ"
          options={[...modeOptions(props.form.modes, props.form.modes), { value: NEW_RAPID_MODE, label: "＋ 時短モードを作る" }]}
          value={props.form.reliefDriveTo === "" ? undefined : props.form.reliefDriveTo}
          onChange={(reliefDriveTo) => (reliefDriveTo === NEW_RAPID_MODE ? makeRapidMode() : props.onChange({ ...props.form, reliefDriveTo }))}
        />
      </div>
      <p class="text-xs text-text-muted">大当り後、通常の確率でこの回転数ハマると移行先のモードへ。時短と残保留の回転も数え、ST中は数えません。大当りで0に戻り、遊タイムは大当り間に1回だけです。</p>
    </div>
  )
}

/**
 * The 期待値基礎値 being entered, in the words of a spec sheet: the regular
 * game, the first jackpot's allotment, each mode, and how a round pays.
 */
export function BasisEditor(props: { readonly form: BasisForm; readonly onChange: (form: BasisForm) => void }): JSX.Element {
  const set =
    <K extends keyof BasisForm>(key: K) =>
    (value: BasisForm[K]): void =>
      props.onChange({ ...props.form, [key]: value })
  return (
    <div class="flex flex-col gap-5">
      <div class="w-48">
        <TextField label="通常時の大当り確率 1/" value={props.form.regularOneIn} onChange={set("regularOneIn")} inputMode="decimal" />
      </div>
      <AllotmentEditor title="初当りの振分" rows={props.form.firstHit} modes={props.form.modes} prizeBalls={props.form.prizeBalls} count={props.form.count} onChange={set("firstHit")} />
      <Index each={props.form.modes}>
        {(mode, index) => (
          <ModeEditor
            mode={mode()}
            modes={props.form.modes}
            prizeBalls={props.form.prizeBalls}
            count={props.form.count}
            onChange={(changed) => set("modes")(replaced(props.form.modes, index, changed))}
            onRemove={() => set("modes")(props.form.modes.filter((_, at) => at !== index))}
          />
        )}
      </Index>
      <div>
        <Button variant="outline" size="small" onClick={() => set("modes")([...props.form.modes, newMode(freshModeKey(props.form.modes), "")])}>
          <PlusIcon />
          モード
        </Button>
      </div>
      <ReliefDriveEditor form={props.form} onChange={props.onChange} />
      <div class="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField label="賞球（機種）" value={props.form.prizeBalls} onChange={set("prizeBalls")} inputMode="numeric" suffix="個" />
        <TextField label="カウント" value={props.form.count} onChange={set("count")} inputMode="numeric" />
        <TextField label="実測の1R出玉" value={props.form.measuredPayout} onChange={set("measuredPayout")} inputMode="decimal" suffix="玉" placeholder="スペック通り" />
        <TextField label="電サポ中の出玉増減" value={props.form.supportGain} onChange={set("supportGain")} inputMode="text" suffix="%" placeholder="0" />
        <TextField label="1時間の回転数" value={props.form.spinsPerHour} onChange={set("spinsPerHour")} inputMode="numeric" />
      </div>
      <p class="text-xs text-text-muted">電サポ中の出玉増減は、初当り以外で電サポ中に取った大当りの出玉を、右打ち中のこぼれなどの分だけ増減させます（-10%なら-10）。初当りと、電サポなしのモード（残保留・潜確など）の大当りは変わりません。</p>
    </div>
  )
}
