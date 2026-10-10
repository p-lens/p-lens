import { createResource, Show, type JSX } from "solid-js"

import { bookStandings } from "../../../application/backup"
import { type Note, noteOf } from "../../../core/backup/standing"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { BackupIcon } from "../../primitives/icons"
import { noteText } from "../../wording/backup"

/**
 * A quiet word in the top bar's corner while a book on the device has never
 * been backed up, or has changed since it was. It only says so: pressed, it
 * opens the backup settings, and nothing is ever sent because it showed.
 * Where the books' standing cannot be read, it says nothing. A narrow
 * window's corner has no room for the words, so there it is the backup's
 * mark alone, named by them.
 */
export function BackupNotice(): JSX.Element {
  const app = useApp()
  const moves = useMoves()
  const [note] = createResource(
    () => ({ revision: app.revision(), made: app.backups.count() }),
    async (): Promise<Note | undefined> => {
      const standings = await bookStandings(app.services.backup)
      return standings.ok ? noteOf(standings.value.map((each) => each.standing)) : undefined
    },
  )
  return (
    <Show when={note.latest} keyed>
      {(found) => (
        <button
          type="button"
          onClick={() => moves.go({ kind: "settings-section", section: "backup" })}
          aria-label={noteText(found)}
          title={noteText(found)}
          class="flex h-7 min-w-7 shrink-0 items-center justify-center rounded text-xs text-text-muted hover:bg-surface-3 sm:px-2 [&_svg]:size-5"
        >
          <span class="hidden whitespace-nowrap sm:inline">{noteText(found)}</span>
          <span class="sm:hidden">
            <BackupIcon />
          </span>
        </button>
      )}
    </Show>
  )
}
