import { createMemo, createResource, type Accessor } from "solid-js"

import { loadUnsentMarks } from "../../../application/catalog"
import { useApp } from "../../context"

const NONE: ReadonlySet<string> = new Set()

/**
 * The formulas and 設定配分 whose marks put on here — イチオシ, 非推奨, a
 * check or a heart — wait to be sent to the shared catalog, read from what
 * the device keeps to send: after each write, and each time a refresh,
 * which sends them, ends. A screen showing a mark says quietly that it has
 * not gone yet, and is counted by nobody else until it has.
 */
export const useUnsentMarks = (): Accessor<ReadonlySet<string>> => {
  const app = useApp()
  const [read] = createResource(
    () => ({ revision: app.revision(), delivery: app.delivery.state().type }),
    () => loadUnsentMarks(app.services.catalog),
  )
  return createMemo(() => {
    const found = read.latest
    return found?.ok === true ? found.value : NONE
  })
}
