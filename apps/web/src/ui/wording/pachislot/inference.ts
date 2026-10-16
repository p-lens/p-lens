import type { TriggerWords } from "./trigger"
import type { SettingInference } from "../../../application/pachislot/setting-inference"

/** The press that reads a told play's setting level, as its button says it at rest. */
const SETTING_INFERENCE_PRESS = "設定をベイズ推定する"

/** What the press says, as the reading stands. */
export const settingInferenceButtonText = (inference: SettingInference): string => {
  switch (inference.type) {
    case "resting":
    case "failed":
      return SETTING_INFERENCE_PRESS
    case "inferring":
      return "推論中…"
    case "inferred":
      return "推論完了"
  }
}

/** That an AT machine's history read better with the triggers missed on the way to each AT counted. */
export const missesSharpen = (trigger: TriggerWords): string => `${trigger.name}スルー回数を入力すると、さらに精度が上がります。`
