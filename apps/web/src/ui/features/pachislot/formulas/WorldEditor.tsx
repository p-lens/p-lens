import { createSignal, Index, Show, untrack, type JSX } from "solid-js"

import { Button } from "../../../primitives/button"
import { TrashIcon } from "../../../primitives/icons"
import { Select, type SelectOption } from "../../../primitives/select"
import { TextField } from "../../../primitives/text-field"
import { ToggleGroup, ToggleGroupItem } from "../../../primitives/toggle-group"
import { bonusTitle } from "../../../wording/pachislot/formula"
import {
  ALL_SETTING_LEVELS,
  type AtLawForm,
  EMPTY_GATE,
  EMPTY_LAW,
  EMPTY_OTHER_NET,
  EMPTY_PAYOUT_ROW,
  type PayoutRowForm,
  type PayoutShape,
  type CzTrigger,
  type EntityKindName,
  type EntityRow,
  type GateForm,
  hasAtCeiling,
  hasCz,
  hasModes,
  isAtMachine,
  type ManualForm,
  newRow,
  restartsAtBonus,
  STARTING_AT_MANUAL,
  STARTING_MANUAL,
  takesGates,
  type WorldForm,
} from "./world-form"

const KINDS: readonly SelectOption[] = [
  { value: "bonus", label: "ボーナス" },
  { value: "part", label: "ボーナスの内訳（単独・重複）" },
  { value: "role", label: "小役" },
  { value: "replay", label: "リプレイ" },
  { value: "watch", label: "ボーナス中に見る場面" },
  { value: "cue", label: "示唆" },
]

const isKind = (value: string): value is EntityKindName => KINDS.some((kind) => kind.value === value)

const replaced = <T,>(items: readonly T[], index: number, item: T): readonly T[] => items.map((existing, at) => (at === index ? item : existing))

const LABEL = "text-xs font-bold uppercase tracking-wide text-text-secondary"

/** Which setting levels the machine has: all six, or some of them. */
function LevelPicker(props: { readonly levels: readonly number[]; readonly onChange: (levels: readonly number[]) => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5">
      <span class={LABEL}>設定</span>
      <ToggleGroup
        multiple
        value={props.levels.map(String)}
        onChange={(values: string[]) => props.onChange(ALL_SETTING_LEVELS.filter((level) => values.includes(String(level))))}
      >
        <Index each={ALL_SETTING_LEVELS}>{(level) => <ToggleGroupItem value={String(level())}>{level()}</ToggleGroupItem>}</Index>
      </ToggleGroup>
    </div>
  )
}

/** A value for each setting level, side by side: a chance, or a 機械割. */
function LevelCells(props: {
  readonly name: string
  readonly levels: readonly number[]
  readonly values: Readonly<Record<string, string>>
  readonly suffix?: string
  readonly placeholder: string
  readonly onChange: (values: Readonly<Record<string, string>>) => void
}): JSX.Element {
  return (
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <Index each={props.levels}>
        {(level) => (
          <TextField
            label={`${props.name} 設定${level()}`}
            labelHidden
            compact
            value={props.values[String(level())] ?? ""}
            onChange={(value) => props.onChange({ ...props.values, [String(level())]: value })}
            inputMode="decimal"
            placeholder={`設定${level()} ${props.placeholder}`}
            {...(props.suffix === undefined ? {} : { suffix: props.suffix })}
          />
        )}
      </Index>
    </div>
  )
}

/**
 * A CZ's ceilings and スルー天井, behind its 合算 and success rate: open once
 * asked for, or while one of them is typed. Its ceilings are its modes' on a
 * machine of modes.
 */
/** A CZ row's trigger from the toggle's value. */
const czTriggerNamed = (value: string): CzTrigger => (value === "bonus" || value === "cz-then-bonus" ? value : "cz")

/** What a CZ row brings play as on the AT間天井: a bonus where it is one, otherwise a CZ. */
const ceilingTriggerWord = (form: WorldForm): string => (form.rows.find((each) => each.kind === "cz")?.trigger === "bonus" ? "ボーナス" : "CZ")

function CzDepths(props: { readonly row: EntityRow; readonly form: WorldForm; readonly onChange: (row: EntityRow) => void }): JSX.Element {
  const [asked, setAsked] = createSignal(false)
  const typed = (): boolean =>
    [props.row.ceiling, props.row.resetCeiling, props.row.unitCeiling, props.row.resetUnitCeiling, props.row.misses, props.row.sinceAtCeiling, props.row.resetSinceAtCeiling].some((text) => text.trim() !== "")
  const forcedFromAt = (): boolean => props.row.sinceAtCeiling.trim() !== "" || props.form.rows.some((each) => each.kind === "mode" && each.sinceAtCeiling.trim() !== "")
  return (
    <Show
      when={asked() || typed()}
      fallback={
        <div>
          <Button variant="ghost" size="small" onClick={() => setAsked(true)}>
            CZの天井・スルー天井を入れる
          </Button>
        </div>
      }
    >
      <div class="flex flex-wrap items-end gap-3">
        <Show when={!hasModes(props.form)}>
          <div class="w-28">
            <TextField label="CZ天井" value={props.row.ceiling} onChange={(ceiling) => props.onChange({ ...props.row, ceiling })} inputMode="numeric" suffix="G" placeholder="なし" />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-32">
              <TextField
                label={`CZ天井（${props.form.unitName.trim()}）`}
                value={props.row.unitCeiling}
                onChange={(unitCeiling) => props.onChange({ ...props.row, unitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="なし"
              />
            </div>
          </Show>
          <div class="w-36">
            <TextField
              label="リセット後のCZ天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-40">
              <TextField
                label={`リセット後のCZ天井（${props.form.unitName.trim()}）`}
                value={props.row.resetUnitCeiling}
                onChange={(resetUnitCeiling) => props.onChange({ ...props.row, resetUnitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="同じ"
              />
            </div>
          </Show>
        </Show>
        <div class="w-36">
          <TextField
            label="スルー天井"
            value={props.row.misses}
            onChange={(misses) => props.onChange({ ...props.row, misses })}
            inputMode="numeric"
            suffix="回"
            placeholder="なし"
          />
        </div>
        <div class="w-40">
          <TextField
            label="ATから数える天井"
            value={props.row.sinceAtCeiling}
            onChange={(sinceAtCeiling) => props.onChange({ ...props.row, sinceAtCeiling })}
            inputMode="numeric"
            suffix="G"
            placeholder="なし"
          />
        </div>
        <Show when={!hasModes(props.form)}>
          <div class="w-48">
            <TextField
              label="リセット後のATから数える天井"
              value={props.row.resetSinceAtCeiling}
              onChange={(resetSinceAtCeiling) => props.onChange({ ...props.row, resetSinceAtCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
        </Show>
        <Show when={forcedFromAt()}>
          <div class="flex flex-col gap-1.5">
            <span class={LABEL}>その天井のCZ</span>
            <ToggleGroup value={props.row.forcedCz} onChange={(value: string | null) => value !== null && props.onChange({ ...props.row, forcedCz: value === "wins" ? "wins" : "drawn" })}>
              <ToggleGroupItem value="drawn">成功率どおり</ToggleGroupItem>
              <ToggleGroupItem value="wins">必ず成功</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </Show>
        <p class="basis-full text-xs text-text-muted">
          スルー天井は、AT後にCZをこの回数失敗すると次のCZで必ずATに当たる、という回数です。ATから数える天井は、ATに入らなかったボーナスでは数え直さず、AT後このゲーム数で1回だけ必ずCZ（ボーナス）が来る、という天井です。AT間天井と同じか手前にしてください。モードのある機種では、モードごとに入れると、そのモードではCZのものに代わります。
        </p>
      </div>
    </Show>
  )
}

function RowEditor(props: {
  readonly row: EntityRow
  readonly form: WorldForm
  /** Typed in by hand: only bonuses, and a payout that may be left out. */
  readonly manual: boolean
  readonly onChange: (row: EntityRow) => void
  readonly onRemove: () => void
}): JSX.Element {
  const bonuses = (): readonly SelectOption[] =>
    props.form.rows.filter((row) => row.kind === "bonus").map((row, index) => ({ value: row.key, label: bonusTitle(row.label, index + 1) }))
  const watches = (): readonly SelectOption[] =>
    props.form.rows.filter((row) => row.kind === "watch").map((row, index) => ({ value: row.key, label: row.label.trim() === "" ? `場面${index + 1}` : row.label }))
  const split = (): boolean => props.row.kind === "bonus" && props.form.rows.some((row) => row.kind === "part" && row.of === props.row.key)
  /** Whether the row is asked its medals: a bonus and an AT; a small win where its medals are its own, never on a sheet typed in by hand, whose small wins are counted on an AT machine and pay through its ベース. */
  const paid = (): boolean => props.row.kind === "bonus" || props.row.kind === "at" || props.row.kind === "cz" || (props.row.kind === "role" && !props.manual)
  const brought = (): boolean => props.row.kind === "at" && hasCz(props.form)
  const fixed = (): boolean => props.row.kind === "at" || props.row.kind === "cz"
  const name = (fallback: string): string => (props.row.label.trim() === "" ? fallback : props.row.label)
  const payoutLabel = (): string => {
    if (props.row.kind === "at") return "平均獲得枚数"
    if (props.row.kind === "cz") return "ボーナスの獲得（任意）"
    if (props.manual) return "獲得枚数（任意）"
    return props.row.kind === "bonus" ? "獲得枚数" : "払い出し"
  }
  return (
    <section class="flex flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <div class="flex flex-wrap items-end gap-2">
        <div class="min-w-24 flex-1">
          <TextField label="名前" value={props.row.label} onChange={(label) => props.onChange({ ...props.row, label })} placeholder="BIG・ブドウ…" />
        </div>
        <Show when={!props.manual && !fixed()}>
          <div class="w-28">
            <Select
              label="種類"
              placeholder="種類"
              options={KINDS}
              value={props.row.kind}
              onChange={(kind) => {
                if (isKind(kind)) props.onChange({ ...props.row, kind })
              }}
            />
          </div>
        </Show>
        <Show when={props.row.kind === "part"}>
          <div class="min-w-32 flex-1">
            <Select label="どのボーナスの内訳か" placeholder="ボーナス" options={bonuses()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
        </Show>
        <Show when={props.row.kind === "watch"}>
          <div class="min-w-32 flex-1">
            <Select label="どのボーナスで見るか" placeholder="ボーナス" options={bonuses()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
          <div class="w-36">
            <TextField
              label="ボーナス1回の回数"
              value={props.row.trials}
              onChange={(trials) => props.onChange({ ...props.row, trials })}
              inputMode="numeric"
              suffix="回"
              placeholder="1"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "cue"}>
          <div class="min-w-32 flex-1">
            <Select label="どの場面の示唆か" placeholder="場面" options={watches()} value={props.row.of} onChange={(of) => props.onChange({ ...props.row, of })} />
          </div>
        </Show>
        <Show when={paid() && (props.row.kind !== "at" || props.row.law.shape === "average")}>
          <div class="w-28">
            <TextField
              label={payoutLabel()}
              value={props.row.payout}
              onChange={(payout) => props.onChange({ ...props.row, payout })}
              inputMode="decimal"
              suffix="枚"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "cz"}>
          <div class="w-36">
            <TextField
              label="ボーナスの純増（任意）"
              value={props.row.net}
              onChange={(net) => props.onChange({ ...props.row, net })}
              inputMode="decimal"
              suffix="枚/G"
              placeholder="なし"
            />
          </div>
        </Show>
        <Show when={(props.row.kind === "at" && !brought() && !hasModes(props.form)) || props.row.kind === "mode"}>
          <div class="w-28">
            <TextField
              label={props.row.kind === "mode" && hasCz(props.form) ? "CZ天井" : "天井"}
              value={props.row.ceiling}
              onChange={(ceiling) => props.onChange({ ...props.row, ceiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-32">
              <TextField
                label={`${props.row.kind === "mode" && hasCz(props.form) ? "CZ天井" : "天井"}（${props.form.unitName.trim()}）`}
                value={props.row.unitCeiling}
                onChange={(unitCeiling) => props.onChange({ ...props.row, unitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="なし"
              />
            </div>
          </Show>
        </Show>
        <Show when={props.row.kind === "mode" && hasCz(props.form)}>
          <div class="w-36">
            <TextField
              label="スルー天井（任意）"
              value={props.row.misses}
              onChange={(misses) => props.onChange({ ...props.row, misses })}
              inputMode="numeric"
              suffix="回"
              placeholder="CZと同じ"
            />
          </div>
        </Show>
        <Show when={props.row.kind === "mode" && hasCz(props.form)}>
          <div class="w-28">
            <TextField
              label="AT間天井"
              value={props.row.atCeiling}
              onChange={(atCeiling) => props.onChange({ ...props.row, atCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="ATと同じ"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-32">
              <TextField
                label={`AT間天井（${props.form.unitName.trim()}）`}
                value={props.row.atUnitCeiling}
                onChange={(atUnitCeiling) => props.onChange({ ...props.row, atUnitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="ATと同じ"
              />
            </div>
          </Show>
          <div class="w-40">
            <TextField
              label="ATから数える天井"
              value={props.row.sinceAtCeiling}
              onChange={(sinceAtCeiling) => props.onChange({ ...props.row, sinceAtCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="CZと同じ"
            />
          </div>
        </Show>
        <Show when={brought()}>
          <div class="w-36">
            <TextField
              label="AT間天井（任意）"
              value={props.row.ceiling}
              onChange={(ceiling) => props.onChange({ ...props.row, ceiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-32">
              <TextField
                label={`AT間天井（${props.form.unitName.trim()}）`}
                value={props.row.unitCeiling}
                onChange={(unitCeiling) => props.onChange({ ...props.row, unitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="なし"
              />
            </div>
          </Show>
          <Show when={restartsAtBonus(props.form)}>
            <div class="w-64">
              <TextField
                label="ATから数えるAT間天井（ボーナスで戻らない）"
                value={props.row.ceilingAcrossBonuses}
                onChange={(ceilingAcrossBonuses) => props.onChange({ ...props.row, ceilingAcrossBonuses })}
                inputMode="numeric"
                suffix="G"
                placeholder="なし"
              />
            </div>
          </Show>
        </Show>
        <Show when={brought() && !hasModes(props.form)}>
          <div class="w-40">
            <TextField
              label="リセット後のAT間天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-40">
              <TextField
                label={`リセット後のAT間天井（${props.form.unitName.trim()}）`}
                value={props.row.resetUnitCeiling}
                onChange={(resetUnitCeiling) => props.onChange({ ...props.row, resetUnitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="同じ"
              />
            </div>
          </Show>
        </Show>
        <Show when={props.row.kind === "at" && !brought() && !hasModes(props.form)}>
          <div class="w-36">
            <TextField
              label="リセット後の天井"
              value={props.row.resetCeiling}
              onChange={(resetCeiling) => props.onChange({ ...props.row, resetCeiling })}
              inputMode="numeric"
              suffix="G"
              placeholder="同じ"
            />
          </div>
          <Show when={props.form.unitName.trim() !== ""}>
            <div class="w-40">
              <TextField
                label={`リセット後の天井（${props.form.unitName.trim()}）`}
                value={props.row.resetUnitCeiling}
                onChange={(resetUnitCeiling) => props.onChange({ ...props.row, resetUnitCeiling })}
                inputMode="numeric"
                suffix={props.form.unitName.trim()}
                placeholder="同じ"
              />
            </div>
          </Show>
        </Show>
        <Show when={props.row.kind !== "at"}>
          <Button variant="outline" size="icon" class="ml-auto" aria-label={`${name("この行")}を削除`} title="この行を削除" onClick={() => props.onRemove()}>
            <TrashIcon />
          </Button>
        </Show>
      </div>
      <Show when={props.row.kind === "at" && !brought()}>
        <p class="text-xs text-text-muted">初当たりは解析サイトの公表値（天井込み）をそのまま入れてください。</p>
      </Show>
      <Show when={brought()}>
        <p class="text-xs text-text-muted">ATの初当たりは、CZ合算と成功率・天井から正確に計算します。</p>
        <Show when={restartsAtBonus(props.form)}>
          <p class="text-xs text-text-muted">
            ATなしボーナスで天井を数え直す機種では、AT間天井もボーナスから数え直します。ボーナスでは戻らず、ATからだけ数えるAT間天井（ボーナス間800G・AT間1600Gの1600G）があれば「ATから数えるAT間天井」に入れます。どちらか早いほうでATに当たります。
          </p>
        </Show>
        <Show when={hasAtCeiling(props.form)}>
          <div class="flex flex-col gap-1.5">
            <span class={LABEL}>AT間天井での当選</span>
            <ToggleGroup value={props.row.ceilingAt} onChange={(value: string | null) => value !== null && props.onChange({ ...props.row, ceilingAt: value === "triggered" ? "triggered" : "outright" })}>
              <ToggleGroupItem value="outright">ATに直接</ToggleGroupItem>
              <ToggleGroupItem value="triggered">{`天井で${ceilingTriggerWord(props.form)}当選（合算に含む）`}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p class="text-xs text-text-muted">
            AT間天井で、ATが確定した{ceilingTriggerWord(props.form)}が来る機種は「天井で{ceilingTriggerWord(props.form)}当選」を選びます。その{ceilingTriggerWord(props.form)}は公表の合算に含まれ、ボーナスなら枚数も獲得するものとして計算します。
          </p>
        </Show>
        <span class={LABEL}>直撃AT（任意）</span>
        <LevelCells name={`${name("AT")} 直撃`} levels={props.form.settingLevels} values={props.row.chances} placeholder="なし" onChange={(chances) => props.onChange({ ...props.row, chances })} />
        <p class="text-xs text-text-muted">CZやボーナスを通らずにATに当たる確率（1Gあたり）です。公表されている直撃の確率を入れます。</p>
      </Show>
      <Show when={props.row.kind === "watch"}>
        <p class="text-xs text-text-muted">ボーナス1回で何回見るかを入れます。BIG中のスイカならBIGのゲーム数、REG中のランプなら1回です。示唆の確率は、その1回あたりで入れてください。</p>
      </Show>
      <Show when={props.row.kind === "cz"}>
        <div class="flex flex-col gap-1.5">
          <span class={LABEL}>ATを抽選するのは</span>
          <ToggleGroup value={props.row.trigger} onChange={(value: string | null) => value !== null && props.onChange({ ...props.row, trigger: czTriggerNamed(value) })}>
            <ToggleGroupItem value="cz">CZ</ToggleGroupItem>
            <ToggleGroupItem value="bonus">ボーナス</ToggleGroupItem>
            <ToggleGroupItem value="cz-then-bonus">CZ→ボーナス</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <span class={LABEL}>CZ合算（公表値・天井込み）</span>
        <LevelCells name={`${name("CZ")} 合算`} levels={props.form.settingLevels} values={props.row.chances} placeholder="1/" onChange={(chances) => props.onChange({ ...props.row, chances })} />
        <span class={LABEL}>CZ成功率</span>
        <LevelCells
          name={`${name("CZ")} 成功率`}
          levels={props.form.settingLevels}
          values={props.row.success}
          suffix="%"
          placeholder=""
          onChange={(success) => props.onChange({ ...props.row, success })}
        />
        <Show when={props.row.trigger === "cz-then-bonus"}>
          <div class="flex flex-col gap-1.5">
            <span class={LABEL}>ATに入らなかったボーナスのあと</span>
            <ToggleGroup value={props.row.bonusMiss} onChange={(value: string | null) => value !== null && props.onChange({ ...props.row, bonusMiss: value === "restarts" ? "restarts" : "counted" })}>
              <ToggleGroupItem value="counted">そのまま数える</ToggleGroupItem>
              <ToggleGroupItem value="restarts">数え直す</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <span class={LABEL}>ボーナスからのAT率（任意）</span>
          <LevelCells
            name={`${name("CZ")} ボーナスからのAT率`}
            levels={props.form.settingLevels}
            values={props.row.bonusShares}
            suffix="%"
            placeholder="100"
            onChange={(bonusShares) => props.onChange({ ...props.row, bonusShares })}
          />
        </Show>
        <CzDepths row={props.row} form={props.form} onChange={props.onChange} />
        <Show
          when={props.row.trigger === "cz-then-bonus"}
          fallback={
            <p class="text-xs text-text-muted">
              ボーナスがATを抽選する機種は「ボーナス」を選び、ここに入れます。CZ合算にボーナス合算、CZ成功率にボーナスからATに入る割合、天井にボーナス間天井を入れ、ボーナスの獲得と純増を足すと、ATに入らなかったボーナスの枚数も期待値に入ります。
            </p>
          }
        >
          <p class="text-xs text-text-muted">
            CZに成功するとボーナスに入り、ボーナスからATを抽選する機種は「CZ→ボーナス」を選びます。枚数と純増にはボーナスの獲得を入れます。CZ成功率とボーナスからのAT率が公表されていなければ、予想で入れてもかまいません。ボーナスからのAT率を空けると、ボーナスは必ずATに入るものとして計算し、ボーナスの枚数を入れなければCZのように計算します。ATに入らなかったボーナスは、「そのまま数える」ならスルー天井で1回のスルーと数えます。「数え直す」なら、そのボーナスからATのあとと同じように天井・スルー・モードを数え直します（ボーナス&AT間天井の機種）。
          </p>
        </Show>
      </Show>
      <Show
        when={props.row.kind !== "mode" && props.row.kind !== "cz" && props.row.kind !== "watch" && !brought()}
        fallback={
          <Show when={props.row.kind === "mode"}>
            <div class="flex flex-col gap-2">
              <span class={LABEL}>AT後の振り分け</span>
              <LevelCells
                name={`${props.row.label.trim() === "" ? "モード" : props.row.label} 振り分け`}
                levels={props.form.settingLevels}
                values={props.row.chances}
                suffix="%"
                placeholder=""
                onChange={(chances) => props.onChange({ ...props.row, chances })}
              />
              <span class={LABEL}>リセット時の振り分け（任意）</span>
              <LevelCells
                name={`${props.row.label.trim() === "" ? "モード" : props.row.label} リセット時の振り分け`}
                levels={props.form.settingLevels}
                values={props.row.resetAllotment}
                suffix="%"
                placeholder="同じ"
                onChange={(resetAllotment) => props.onChange({ ...props.row, resetAllotment })}
              />
              <Show when={hasCz(props.form)}>
                <ModeChain row={props.row} form={props.form} onChange={props.onChange} />
              </Show>
            </div>
          </Show>
        }
      >
        <Show when={!split()} fallback={<p class="text-xs text-text-muted">確率は内訳の合計です。</p>}>
          <LevelCells
            name={props.row.label.trim() === "" ? "確率" : props.row.label}
            levels={props.form.settingLevels}
            values={props.row.chances}
            placeholder="1/"
            onChange={(chances) => props.onChange({ ...props.row, chances })}
          />
        </Show>
      </Show>
      <Show when={takesGates(props.form, props.row)}>
        <Zones name={name(props.row.kind === "cz" ? "CZ" : "モード")} levels={props.form.settingLevels} gates={props.row.gates} onChange={(gates) => props.onChange({ ...props.row, gates })} />
      </Show>
    </section>
  )
}

/**
 * What a failed CZ does in a mode, on a machine a CZ brings the AT on: the
 * mode's own CZ success where it is not the CZ's, and where play moves —
 * each mode with its share under each setting, all of them 100%. Left
 * empty, the CZ's success holds and play stays in the mode until the AT.
 * The modes are an `<Index>`, so typing never remounts a field.
 */
function ModeChain(props: { readonly row: EntityRow; readonly form: WorldForm; readonly onChange: (row: EntityRow) => void }): JSX.Element {
  const name = (): string => (props.row.label.trim() === "" ? "モード" : props.row.label)
  const modes = (): readonly EntityRow[] => props.form.rows.filter((row) => row.kind === "mode")
  return (
    <div class="flex flex-col gap-2">
      <span class={LABEL}>このモードのCZ確率（任意）</span>
      <LevelCells name={`${name()} CZ確率`} levels={props.form.settingLevels} values={props.row.triggerChances} placeholder="合算から" onChange={(triggerChances) => props.onChange({ ...props.row, triggerChances })} />
      <div class="flex flex-wrap items-end gap-3">
        <div class="w-36">
          <TextField
            label="抜けるまで（任意）"
            value={props.row.expiryGames}
            onChange={(expiryGames) => props.onChange({ ...props.row, expiryGames })}
            inputMode="numeric"
            suffix="G"
            placeholder="ずっと"
          />
        </div>
        <Show when={props.row.expiryGames.trim() !== ""}>
          <div class="min-w-32 flex-1">
            <Select
              label="抜けた先のモード"
              placeholder="モード"
              options={modes().map((to) => ({ value: to.key, label: to.label.trim() === "" ? "名前のないモード" : to.label }))}
              value={props.row.expiryTo}
              onChange={(expiryTo) => props.onChange({ ...props.row, expiryTo: expiryTo ?? "" })}
            />
          </div>
        </Show>
      </div>
      <span class={LABEL}>このモードのCZ成功率（任意）</span>
      <LevelCells name={`${name()} CZ成功率`} levels={props.form.settingLevels} values={props.row.success} suffix="%" placeholder="CZの" onChange={(success) => props.onChange({ ...props.row, success })} />
      <span class={LABEL}>CZに失敗したときの移り先（任意）</span>
      <Index each={modes()}>
        {(to) => (
          <div class="flex flex-col gap-1">
            <span class="text-xs text-text-secondary">→ {to().label.trim() === "" ? "名前のないモード" : to().label}</span>
            <LevelCells
              name={`${name()} → ${to().label.trim() === "" ? "モード" : to().label}`}
              levels={props.form.settingLevels}
              values={props.row.redraw[to().key] ?? {}}
              suffix="%"
              placeholder="0"
              onChange={(shares) => props.onChange({ ...props.row, redraw: { ...props.row.redraw, [to().key]: shares } })}
            />
          </div>
        )}
      </Index>
      <Show when={props.row.ceiling.trim() !== ""}>
        <span class={LABEL}>天井でCZに入って失敗したときの移り先（任意）</span>
        <Index each={modes()}>
          {(to) => (
            <div class="flex flex-col gap-1">
              <span class="text-xs text-text-secondary">→ {to().label.trim() === "" ? "名前のないモード" : to().label}</span>
              <LevelCells
                name={`${name()} 天井CZ → ${to().label.trim() === "" ? "モード" : to().label}`}
                levels={props.form.settingLevels}
                values={props.row.ceilingRedraw[to().key] ?? {}}
                suffix="%"
                placeholder="0"
                onChange={(shares) => props.onChange({ ...props.row, ceilingRedraw: { ...props.row.ceilingRedraw, [to().key]: shares } })}
              />
            </div>
          )}
        </Index>
      </Show>
      <p class="text-xs text-text-muted">
        CZに失敗するたびにモードを選び直す機種は、移り先ごとの割合を入れます（設定ごとに合計100%）。空けたモードは、失敗してもATまでそのままです。天井で入ったCZの失敗で次の天井が変わる機種は、その移り先を天井の欄に入れます（空けると普通の失敗と同じ）。CZ失敗後に成功率の上がる高確は、成功率を入れたモードにします。CZのあとしばらくCZが来やすいCZ連は、CZ確率と抜けるまでのゲーム数を入れたモードにして、CZ失敗の移り先にします。公表されていなければ予想で入れてかまいません。
      </p>
    </div>
  )
}

/**
 * A mode's zones, or a CZ's on a machine without modes: each the game since
 * the last AT it is on, the share of play still going there that the CZ
 * comes to, and the share that wins the AT outright, under each setting.
 * Zones are an `<Index>`, so typing never remounts a field.
 */
function Zones(props: { readonly name: string; readonly levels: readonly number[]; readonly gates: readonly GateForm[]; readonly onChange: (gates: readonly GateForm[]) => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-2">
      <Index each={props.gates}>
        {(gate, index) => (
          <div class="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <div class="flex items-end gap-3">
              <div class="w-32">
                <TextField
                  label="ゾーン（AT後）"
                  value={gate().game}
                  onChange={(game) => props.onChange(replaced(props.gates, index, { ...gate(), game }))}
                  inputMode="numeric"
                  suffix="G"
                  placeholder="100"
                />
              </div>
              <div class="w-24">
                <TextField
                  label="長さ（任意）"
                  value={gate().span}
                  onChange={(span) => props.onChange(replaced(props.gates, index, { ...gate(), span }))}
                  inputMode="numeric"
                  suffix="G"
                  placeholder="1"
                />
              </div>
              <Button variant="outline" size="icon" class="ml-auto" aria-label={`${props.name}のゾーンを削除`} title="このゾーンを削除" onClick={() => props.onChange(props.gates.filter((_, at) => at !== index))}>
                <TrashIcon />
              </Button>
            </div>
            <span class={LABEL}>CZに入る割合</span>
            <LevelCells name={`${props.name} ゾーン CZ`} levels={props.levels} values={gate().trigger} suffix="%" placeholder="" onChange={(trigger) => props.onChange(replaced(props.gates, index, { ...gate(), trigger }))} />
            <span class={LABEL}>ATに直撃する割合（任意）</span>
            <LevelCells name={`${props.name} ゾーン AT`} levels={props.levels} values={gate().at} suffix="%" placeholder="0" onChange={(at) => props.onChange(replaced(props.gates, index, { ...gate(), at }))} />
          </div>
        )}
      </Index>
      <div class="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="small" onClick={() => props.onChange([...props.gates, EMPTY_GATE])}>
          ゾーンを足す
        </Button>
        <p class="basis-full text-xs text-text-muted">
          100G・200Gのように、AT後のゲーム数で抽選する区切り（ゾーン）を入れます。そのゲームまでCZもATも来ていなければ、CZに入る割合とATに直撃する割合で抽選します。長さを入れると、その割合をそのゲーム数のあいだに均して抽選します（AT後66Gの引き戻しなら、1Gから長さ66G、ATに直撃する割合に引き戻し率）。公表されていなければ予想で入れてかまいません。
        </p>
      </div>
    </div>
  )
}

function Rows(props: { readonly form: WorldForm; readonly manual: boolean; readonly onChange: (form: WorldForm) => void }): JSX.Element {
  return (
    <Index each={props.form.rows}>
      {(row, index) => (
        <RowEditor
          row={row()}
          form={props.form}
          manual={props.manual}
          onChange={(changed) => props.onChange({ ...props.form, rows: replaced(props.form.rows, index, changed) })}
          onRemove={() => props.onChange({ ...props.form, rows: props.form.rows.filter((_, at) => at !== index) })}
        />
      )}
    </Index>
  )
}

const ADDABLE: readonly { readonly kind: EntityKindName; readonly label: string }[] = [
  { kind: "bonus", label: "ボーナスを追加" },
  { kind: "part", label: "内訳を追加" },
  { kind: "role", label: "小役を追加" },
  { kind: "replay", label: "リプレイを追加" },
  { kind: "watch", label: "見る場面を追加" },
  { kind: "cue", label: "示唆を追加" },
]

/**
 * A machine's 解析値: its setting levels, its bet, and each entity — a bonus,
 * a part of one, a small win, a replay, or what is watched over a bonus and
 * the cues it shows — with its chance under each level.
 * Chances are typed as an analysis sheet prints them: `1/273.1` or `16%`.
 */
export function WorldEditor(props: { readonly form: WorldForm; readonly onChange: (form: WorldForm) => void }): JSX.Element {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-4">
        <LevelPicker levels={props.form.settingLevels} onChange={(settingLevels) => props.onChange({ ...props.form, settingLevels })} />
        <div class="w-28">
          <TextField label="1Gの枚数" value={props.form.bet} onChange={(bet) => props.onChange({ ...props.form, bet })} inputMode="numeric" suffix="枚" />
        </div>
      </div>
      <Rows form={props.form} manual={false} onChange={props.onChange} />
      <div class="flex flex-wrap gap-2">
        <Index each={ADDABLE}>
          {(addable) => (
            <Button variant="secondary" size="small" onClick={() => props.onChange({ ...props.form, rows: [...props.form.rows, newRow(props.form.rows, addable().kind)] })}>
              {addable().label}
            </Button>
          )}
        </Index>
      </div>
    </div>
  )
}

/**
 * A machine whose AT a CZ now brings: a CZ row, placed after the AT, and the
 * AT's own 初当たり and ceiling after a setting change let go — the CZ's
 * figures give them.
 */
const withCz = (form: WorldForm): WorldForm => {
  const cz: EntityRow = { ...newRow(form.rows, "cz"), label: "CZ" }
  const rows = form.rows.flatMap((each) => (each.kind === "at" ? [{ ...each, chances: {}, ceiling: "", resetCeiling: "" }, cz] : [each]))
  return { ...form, rows }
}

const SHAPES: readonly { readonly value: PayoutShape; readonly label: string }[] = [
  { value: "average", label: "平均獲得枚数" },
  { value: "sets", label: "初期＋継続率" },
  { value: "table", label: "枚数の表" },
  { value: "rate", label: "機械割から" },
]

const isShape = (value: string): value is PayoutShape => SHAPES.some((shape) => shape.value === value)

/** Whether anything past an AT's average has been typed, so its depths start open; once open, they stay as the person leaves them. */
const typedDepths = (world: WorldForm, law: AtLawForm): boolean =>
  law.shape !== "average" || law.window.trim() !== "" || law.resetOnCap || world.cap.trim() !== ""

/** An AT's table of medals: a row for each so many medals, with how often each level gives it. */
function PayoutRows(props: { readonly world: WorldForm; readonly law: AtLawForm; readonly onChange: (law: AtLawForm) => void }): JSX.Element {
  const setRows = (rows: readonly PayoutRowForm[]): void => props.onChange({ ...props.law, rows })
  return (
    <div class="flex flex-col gap-3">
      <Index each={props.law.rows}>
        {(row, index) => (
          <div class="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
            <div class="flex items-end gap-3">
              <div class="w-32">
                <TextField
                  label={`${index + 1}行目の枚数`}
                  value={row().medals}
                  onChange={(medals) => setRows(replaced(props.law.rows, index, { ...row(), medals }))}
                  inputMode="decimal"
                  suffix="枚"
                />
              </div>
              <Button variant="ghost" size="small" onClick={() => setRows(props.law.rows.filter((_, at) => at !== index))}>
                削除
              </Button>
            </div>
            <LevelCells
              name={`${index + 1}行目`}
              levels={props.world.settingLevels}
              values={row().shares}
              suffix="%"
              placeholder=""
              onChange={(shares) => setRows(replaced(props.law.rows, index, { ...row(), shares }))}
            />
          </div>
        )}
      </Index>
      <div>
        <Button variant="secondary" size="small" onClick={() => setRows([...props.law.rows, EMPTY_PAYOUT_ROW])}>
          行を追加
        </Button>
      </div>
    </div>
  )
}

/**
 * What an AT gains past its average, and its 有利区間, folded behind the AT
 * and open once anything in it is typed: its medals as sets carried on at a
 * 継続率 or as a table, the cap on what a 有利区間 gains, the games it carries
 * on after an AT short of the cap, and how play starts again once an AT
 * reaches it.
 */
function AtDepths(props: { readonly world: WorldForm; readonly onChange: (world: WorldForm) => void }): JSX.Element {
  const index = (): number => props.world.rows.findIndex((row) => row.kind === "at")
  const law = (): AtLawForm => props.world.rows[index()]?.law ?? EMPTY_LAW
  const setLaw = (changed: AtLawForm): void => {
    const at = props.world.rows[index()]
    if (at !== undefined) props.onChange({ ...props.world, rows: replaced(props.world.rows, index(), { ...at, law: changed }) })
  }
  const startsOpen = untrack(() => typedDepths(props.world, law()))
  return (
    <details class="rounded-lg border border-border px-4 py-3" open={startsOpen}>
      <summary class="cursor-pointer text-sm font-semibold text-text-secondary">獲得の分布・有利区間</summary>
      <div class="mt-3 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <span class={LABEL}>ATの獲得</span>
          <ToggleGroup value={law().shape} onChange={(value: string | null) => value !== null && isShape(value) && setLaw({ ...law(), shape: value })}>
            <Index each={SHAPES}>{(shape) => <ToggleGroupItem value={shape().value}>{shape().label}</ToggleGroupItem>}</Index>
          </ToggleGroup>
        </div>
        <Show when={law().shape === "sets"}>
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-32">
              <TextField label="初期枚数" value={law().first} onChange={(first) => setLaw({ ...law(), first })} inputMode="decimal" suffix="枚" />
            </div>
            <div class="w-32">
              <TextField label="1セットの枚数" value={law().set} onChange={(set) => setLaw({ ...law(), set })} inputMode="decimal" suffix="枚" />
            </div>
          </div>
          <span class={LABEL}>継続率</span>
          <LevelCells name="継続率" levels={props.world.settingLevels} values={law().continuationRate} suffix="%" placeholder="" onChange={(continuationRate) => setLaw({ ...law(), continuationRate })} />
        </Show>
        <Show when={law().shape === "table"}>
          <PayoutRows world={props.world} law={law()} onChange={setLaw} />
        </Show>
        <Show when={law().shape === "rate"}>
          <div class="flex items-end gap-2">
            <div class="w-32">
              <TextField label="純増" value={law().net} onChange={(net) => setLaw({ ...law(), net })} inputMode="decimal" suffix="枚/G" />
            </div>
            <Button variant="secondary" size="small" onClick={() => setLaw({ ...law(), otherNets: [...law().otherNets, EMPTY_OTHER_NET] })}>
              別の純増を追加
            </Button>
          </div>
          <Index each={law().otherNets}>
            {(other, index) => (
              <div class="grid grid-cols-[8rem_minmax(0,1fr)_2.25rem] items-end gap-2 [&>*]:min-w-0">
                <TextField label="別の純増" labelHidden={index > 0} value={other().net} onChange={(net) => setLaw({ ...law(), otherNets: law().otherNets.map((each, at) => (at === index ? { ...each, net } : each)) })} inputMode="decimal" suffix="枚/G" />
                <TextField label="獲得枚数のうち" labelHidden={index > 0} value={other().share} onChange={(share) => setLaw({ ...law(), otherNets: law().otherNets.map((each, at) => (at === index ? { ...each, share } : each)) })} inputMode="decimal" suffix="%" />
                <Button variant="outline" size="icon" aria-label={`別の純増${index + 1}を削除`} title="この純増を削除" onClick={() => setLaw({ ...law(), otherNets: law().otherNets.filter((_, at) => at !== index) })}>
                  <TrashIcon />
                </Button>
              </div>
            )}
          </Index>
          <p class="text-xs text-text-muted">
            平均獲得枚数は、各設定の機械割・初当たり・ベースと純増から計算します。ATからATまでの通常ゲームとATのゲームを通して、払い出しの総数を投入の総数で割ると機械割になる、という関係を獲得枚数について解いたものです。上位ATなど純増の違う区間があるATは、その純増と、ATの獲得枚数のうちそこで取る割合を「別の純増」に入れます。残りは上の純増で取るものとして、同じ枚数にかかるゲーム数を合わせます。
          </p>
        </Show>
        <Show when={law().shape === "sets" || law().shape === "table"}>
          <p class="text-xs text-text-muted">平均獲得枚数は、この分布と有利区間の上限から計算します。</p>
        </Show>
        <div class="flex flex-wrap items-end gap-3">
          <div class="w-40">
            <TextField
              label="有利区間の上限"
              value={props.world.cap}
              onChange={(cap) => props.onChange({ ...props.world, cap })}
              inputMode="numeric"
              suffix="枚"
              placeholder="なし"
            />
          </div>
          <div class="w-40">
            <TextField
              label="引き戻しのゲーム数"
              value={law().window}
              onChange={(window) => setLaw({ ...law(), window })}
              inputMode="numeric"
              suffix="G"
              placeholder="なし"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class={LABEL}>完走したあと</span>
          <ToggleGroup value={law().resetOnCap ? "reset" : "at"} onChange={(value: string | null) => value !== null && setLaw({ ...law(), resetOnCap: value === "reset" })}>
            <ToggleGroupItem value="at">AT後と同じ</ToggleGroupItem>
            <ToggleGroupItem value="reset">リセット後と同じ</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p class="text-xs text-text-muted">
          有利区間の上限（例: 2400枚）に届いたATはそこで終わり、有利区間も終わります。届かずに終わったATの獲得は、引き戻しのゲーム数のあいだ持ち越され、その間に当たったATはその分だけ早く上限に届きます。上限・引き戻し・完走後の扱いは、上限を入れたときだけ使います。
        </p>
      </div>
    </details>
  )
}

const BONUS_MACHINE = "bonus"
const AT_MACHINE = "at"

/**
 * What a typed-in machine is: one of bonuses — BIG, REG and the like — or of
 * an AT with its ceiling and ベース. Choosing the other starts its rows over,
 * keeping the setting levels and the 機械割 typed.
 */
function MachineShape(props: { readonly form: ManualForm; readonly onChange: (form: ManualForm) => void }): JSX.Element {
  const shape = (): string => (isAtMachine(props.form.world) ? AT_MACHINE : BONUS_MACHINE)
  const choose = (value: string): void => {
    if (value === shape()) return
    const start = value === AT_MACHINE ? STARTING_AT_MANUAL : STARTING_MANUAL
    props.onChange({ ...props.form, world: { ...start.world, settingLevels: props.form.world.settingLevels, bet: props.form.world.bet } })
  }
  return (
    <div class="flex flex-col gap-1.5">
      <span class={LABEL}>機種のタイプ</span>
      <ToggleGroup value={shape()} onChange={(value: string | null) => value !== null && choose(value)}>
        <ToggleGroupItem value={BONUS_MACHINE}>ボーナス機</ToggleGroupItem>
        <ToggleGroupItem value={AT_MACHINE}>AT機</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

/**
 * A formula typed in by hand: its setting levels, its bonuses' odds — their
 * payout may be left out — and what is watched over them, or its AT's, with the AT's payout, its ceilings
 * and the machine's ベース; and each level's 機械割 as published or measured.
 */
export function ManualEditor(props: { readonly form: ManualForm; readonly onChange: (form: ManualForm) => void }): JSX.Element {
  const world = (): WorldForm => props.form.world
  const setWorld = (changed: WorldForm): void => props.onChange({ ...props.form, world: changed })
  return (
    <div class="flex flex-col gap-4">
      <MachineShape form={props.form} onChange={props.onChange} />
      <div class="flex flex-wrap items-end gap-4">
        <LevelPicker levels={world().settingLevels} onChange={(settingLevels) => setWorld({ ...world(), settingLevels })} />
        <Show when={isAtMachine(world())}>
          <div class="w-36">
            <TextField label="ベース" value={world().base} onChange={(base) => setWorld({ ...world(), base })} inputMode="decimal" suffix="G/50枚" />
          </div>
          <div class="w-44">
            <TextField
              label="液晶の加算（任意）"
              value={world().lcdRate}
              onChange={(lcdRate) => setWorld({ ...world(), lcdRate })}
              inputMode="decimal"
              suffix="倍"
              placeholder="なし"
            />
          </div>
          <div class="w-36">
            <TextField label="天井の単位（任意）" value={world().unitName} onChange={(unitName) => setWorld({ ...world(), unitName })} placeholder="pt・周期" />
          </div>
          <Show when={world().unitName.trim() !== ""}>
            <div class="w-40">
              <TextField
                label={`1${world().unitName.trim()}あたり`}
                value={world().unitGames}
                onChange={(unitGames) => setWorld({ ...world(), unitGames })}
                inputMode="decimal"
                suffix="G"
                placeholder="32"
              />
            </div>
          </Show>
        </Show>
      </div>
      <section class="flex flex-col gap-2 rounded-lg border border-border px-4 py-3">
        <span class={LABEL}>機械割</span>
        <LevelCells name="機械割" levels={world().settingLevels} values={props.form.rates} suffix="%" placeholder="" onChange={(rates) => props.onChange({ ...props.form, rates })} />
      </section>
      <Rows form={world()} manual onChange={setWorld} />
      <Show when={isAtMachine(world())}>
        <AtDepths world={world()} onChange={setWorld} />
      </Show>
      <Show when={isAtMachine(world())}>
        <p class="text-xs text-text-muted">
          天井の液晶ゲーム数がスイカなどで加算される機種は、液晶のゲーム数÷実ゲーム数の平均（例: 1.6倍）を入れると、天井を実ゲーム数に直して計算します。天井がptや周期で数えられる機種は、その単位の名前と1単位あたりの平均G数を入れます（液晶の加算とはどちらか一方）。モードを足すと、天井はモードごとに入れます。小役は、通常時に数える設定差のあるもの（共通ベルなど）を設定ごとの確率で入れます。払い出しはベースに含まれるので枚数は入れず、CZやATに直結する小役（強チェリーなど）は入れないでください。
        </p>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Show when={isAtMachine(world()) && !hasCz(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld(withCz(world()))}>
            CZを追加
          </Button>
        </Show>
        <Show when={isAtMachine(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "role")] })}>
            小役を追加
          </Button>
        </Show>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, isAtMachine(world()) ? "mode" : "bonus")] })}
        >
          {isAtMachine(world()) ? "モードを追加" : "ボーナスを追加"}
        </Button>
        <Show when={!isAtMachine(world())}>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "watch")] })}>
            見る場面を追加
          </Button>
          <Button variant="secondary" size="small" onClick={() => setWorld({ ...world(), rows: [...world().rows, newRow(world().rows, "cue")] })}>
            示唆を追加
          </Button>
        </Show>
      </div>
    </div>
  )
}
