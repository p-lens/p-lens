import { createSignal, type Accessor } from "solid-js"

type InputEventOf<E> = E & { readonly currentTarget: HTMLInputElement }

/** A field whose text gives way to the first key typed, and what it needs to hear of to do so. */
export interface TypedOver {
  /** Whether the text is waiting to be typed over, for showing it marked. */
  readonly waiting: Accessor<boolean>
  readonly onFocus: (event: InputEventOf<FocusEvent>) => void
  readonly onBlur: () => void
  readonly onPointerDown: (event: InputEventOf<PointerEvent>) => void
  readonly onKeyDown: (event: InputEventOf<KeyboardEvent>) => void
  readonly onCompositionStart: (event: InputEventOf<CompositionEvent>) => void
  readonly onBeforeInput: (event: InputEventOf<InputEvent>) => void
}

const CARET_KEYS: ReadonlySet<string> = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])

/** The field holding `text` and nothing else, said as an input would say it, the caret after it. */
const holding = (input: HTMLInputElement, text: string): void => {
  input.value = input.maxLength > 0 ? text.slice(0, input.maxLength) : text
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
}

const emptied = (input: HTMLInputElement): void => holding(input, "")

/** The text an insertion brings, where it says: a key's own, or what is pasted or put in its place. None for an insertion that says nothing of it. */
const insertedBy = (event: InputEvent): string | undefined => event.data ?? event.dataTransfer?.getData("text/plain") ?? undefined

/**
 * A filled field that the first key typed replaces, as a selection would
 * have it, without selecting anything: a selection made for the person
 * brings up a phone's copy-and-paste bubble over the very field they are
 * about to type in. Taking the focus marks the text as waiting; the first
 * insertion or deletion is made here in the browser's stead, the field
 * left holding what was inserted and no more; a second press in the field,
 * or a caret key, means the text is to be edited, and it waits no more.
 *
 * The insertion is not left to the browser over a field emptied under it:
 * WebKit drops an insertion whose field changed while it was being asked
 * about, so the first key typed on an iPhone came to nothing. Text being
 * composed cannot be made here — it is the keyboard's until it settles —
 * so the field is emptied as the composing starts, as before.
 */
export const createTypedOver = (wanted: Accessor<boolean>): TypedOver => {
  const [waiting, setWaiting] = createSignal(false)
  return {
    waiting,
    onFocus: (event) => setWaiting(wanted() && event.currentTarget.value !== ""),
    onBlur: () => setWaiting(false),
    onPointerDown: (event) => {
      if (document.activeElement === event.currentTarget) setWaiting(false)
    },
    onKeyDown: (event) => {
      if (CARET_KEYS.has(event.key)) setWaiting(false)
    },
    onCompositionStart: (event) => {
      if (!waiting()) return
      setWaiting(false)
      emptied(event.currentTarget)
    },
    onBeforeInput: (event) => {
      if (!waiting() || event.isComposing) return
      setWaiting(false)
      if (event.inputType.startsWith("delete")) {
        event.preventDefault()
        emptied(event.currentTarget)
        return
      }
      if (!event.inputType.startsWith("insert")) return
      const inserted = insertedBy(event)
      if (inserted === undefined) {
        event.currentTarget.value = ""
        return
      }
      event.preventDefault()
      holding(event.currentTarget, inserted)
    },
  }
}
