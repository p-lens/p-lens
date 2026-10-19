import { onMount, type JSX } from "solid-js"

import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { toast } from "../../primitives/toast"
import { STOPPED_AT_WORK } from "../../wording/consolidated"

/**
 * The word, told once as the page opens, that the page before stopped while
 * the consolidation read its books on several hledgers — most likely out of
 * the device's memory — with the way to back the books up while they are
 * safe. It is not told again; this page reads on one hledger.
 */
export function StoppedNotice(): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  onMount(() => {
    if (!app.services.consolidationStopped.stopped()) return
    toast({
      title: STOPPED_AT_WORK.title,
      description: STOPPED_AT_WORK.description,
      tone: "warning",
      action: { label: STOPPED_AT_WORK.action, onPress: () => moves.go({ kind: "settings-section", section: "backup" }) },
    })
    app.services.consolidationStopped.told()
  })
  return <></>
}
