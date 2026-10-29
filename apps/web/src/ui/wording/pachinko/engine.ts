import type { EngineErrorDto, LocationDto } from "@p-lens/contracts/pachinko"

import type { EngineFailure } from "../../../pachinko-engine/protocol/messages"
import { ENGINE_UNLOADED } from "../connection"

const where = (at: LocationDto): string => (at.type === "regular" ? "通常時" : `「${at.mode}」`)

const COMPONENT_NAMES: Readonly<Record<string, string>> = {
  regularGame: "通常時の確率",
  label: "名前",
  allotment: "振分",
  specialTime: "ST",
  rapid: "時短",
  leftoverQueue: "残保留",
  rushing: "継続率",
  untilHit: "次回まで",
  onMiss: "終了後の行き先",
  luckyTrigger: "ラッキートリガー",
  reliefDrive: "遊タイム",
}

/** A component's name as the form calls it. */
const componentName = (component: string): string => COMPONENT_NAMES[component] ?? component

const describeEngineError = (error: EngineErrorDto): string => {
  switch (error.type) {
    case "malformed-request":
      return `計算エンジンが入力を読めませんでした: ${error.detail}`
    case "invalid-value":
      return `値が正しくありません（${error.field}）。`
    case "unsupported-component":
      return `この計算エンジンが知らない種類の基礎値があります（${error.field}）。アプリを更新してください。`
    case "unsupported-spec-version":
      return `この基礎値は別の版の形式（v${error.version}）で書かれています。この計算エンジンが読めるのは v${error.known} です。アプリを更新してください。`
    case "unsupported-schema-version":
      return `この算出条件は新しい計算エンジンで作られています（形式 v${error.version}）。この計算エンジンが読めるのは v${error.known} までです。アプリを更新してください。`
    case "invalid-probability":
      return error.problem === "zero" ? `${where(error.at)}の確率が 0 です。` : `${where(error.at)}の確率が正しくありません。`
    case "invalid-distribution":
      return `${where(error.at)}の振分の合計が ${(error.sumBasisPoints / 100).toFixed(2)}% です。100% にしてください。`
    case "duplicate-mode":
      return `「${error.mode}」という名前のモードが2つあります。`
    case "no-regular-game":
      return "通常時がありません。"
    case "several-regular-games":
      return "通常時が2つ以上あります。"
    case "missing-component":
      return `「${error.entity}」に${componentName(error.component)}がありません。`
    case "missing-kind":
      return `モード「${error.entity}」の種類（ST、時短、残保留、継続率、次回まで）がありません。`
    case "conflicting-components":
      return `モード「${error.entity}」に${componentName(error.first)}と${componentName(error.second)}が両方あります。`
    case "stray-component":
      return `「${error.entity}」に付けられない${componentName(error.component)}があります。`
    case "unknown-mode":
      return `${where(error.at)}から、存在しないモード「${error.mode}」へ移っています。`
    case "unreachable-state":
      return `モード「${error.mode}」には、どこからも入れません。`
    case "non-absorbing-model":
      return `モード「${error.mode}」から通常時に戻れず、連チャンが終わりません。`
    case "unsupported-spec":
      switch (error.reason.type) {
        case "too-many-states":
          return `このスペックは計算エンジンの対応範囲を超えています（状態数 ${error.reason.states}、上限 ${error.reason.limit}）。`
        case "lucky-trigger-to-itself":
          return "ラッキートリガーの移行先が同じモードです。"
        case "lucky-trigger-on-entry":
          return "ラッキートリガーは2連目以降にしてください。1連目はそのモードに入った大当りです。"
      }
    case "solve-failed":
      return "計算できませんでした。スペックに終わらない連チャンがあります。"
  }
}

export const describeEngineFailure = (failure: EngineFailure): string =>
  failure.type === "engine" ? describeEngineError(failure.error) : ENGINE_UNLOADED

