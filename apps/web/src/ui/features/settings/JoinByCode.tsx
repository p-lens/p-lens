import { createSignal, Show, type JSX } from "solid-js"

import type { ApplicationError } from "../../../application/errors"
import { joinByCode, kindOfCode } from "../../../application/sync"
import { useApp } from "../../context"
import { Button } from "../../primitives/button"
import { createNudge } from "../../primitives/nudge"
import { TextField } from "../../primitives/text-field"
import { toast } from "../../primitives/toast"
import { FailureNote } from "./FailureNote"
import { titleText } from "../../wording/book"

/** Where a press here is: nothing doing, at work, turned away for a code of the other kind, or failed. */
type Working = { readonly type: "idle" } | { readonly type: "working" } | { readonly type: "misplaced" } | { readonly type: "failed"; readonly error: ApplicationError }

/** What each place that takes a code says: what it takes, where it comes from, and where the other kind goes. */
const WORDS = {
  own: { label: "同期コード", placeholder: "もう一台の端末でコピーした同期コード", misplaced: "これは招待コードです。「設定 → 共有」の「招待コードを入れる」に貼ってください。" },
  invitation: { label: "招待コード", placeholder: "仲間からもらった招待コード", misplaced: "これは同期コードです。自分の端末どうしの同期は「設定 → 端末の同期」に貼ってください。" },
} as const

/**
 * A code typed in to put a book on this device, in one of two places that
 * each take one kind: a book's own code, where a person's devices are
 * synced, or an invitation, where books are shared. A code of the other
 * kind is turned away with where it goes — the two are different things to
 * the person holding them, whatever they share underneath.
 */
export function JoinByCode(props: { readonly takes: "own" | "invitation"; readonly onJoined: () => void }): JSX.Element {
  const app = useApp()
  const nudge = createNudge()
  const [code, setCode] = createSignal("")
  const [working, setWorking] = createSignal<Working>({ type: "idle" })
  const join = async (): Promise<void> => {
    if (working().type === "working") return
    if (code().trim() === "") {
      nudge.nudge()
      return
    }
    if (kindOfCode(code()) !== props.takes) {
      setWorking({ type: "misplaced" })
      return
    }
    setWorking({ type: "working" })
    const joined = await joinByCode({ ...app.services.sync, destinations: app.services.destinations }, code(), app.services.relayUrl)
    setWorking(joined.ok ? { type: "idle" } : { type: "failed", error: joined.error })
    if (!joined.ok) return
    setCode("")
    toast(
      joined.value.type === "book"
        ? { title: "帳簿を追加しました", description: "この端末でも同じ帳簿を使えます。" }
        : { title: "送り先を追加しました", description: `左の列か「本日の稼働」から「${titleText(joined.value.title)}」に送れます。` },
    )
    props.onJoined()
  }
  return (
    <div class="flex flex-col gap-2">
      <TextField
        label={WORDS[props.takes].label}
        value={code()}
        onChange={(typed) => {
          setCode(typed)
          setWorking({ type: "idle" })
        }}
        placeholder={WORDS[props.takes].placeholder}
        required
        invalid={(nudge.red() && code().trim() === "") || working().type === "misplaced"}
        onFocus={nudge.settle}
      />
      <div>
        <Button size="small" onClick={() => void join()}>
          この端末に追加
        </Button>
      </div>
      <Show when={working().type === "misplaced"}>
        <p role="alert" class="text-xs text-negative">
          {WORDS[props.takes].misplaced}
        </p>
      </Show>
      <Show when={working()} keyed>
        {(state) => (state.type === "failed" ? <FailureNote error={state.error} /> : undefined)}
      </Show>
    </div>
  )
}
