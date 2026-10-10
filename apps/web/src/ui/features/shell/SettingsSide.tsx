import type { JSX } from "solid-js"
import { SidePanel } from "solid-gathering-shell"

import { BackupIcon, BooksIcon, ClosingIcon, ConsolidatedIcon, ExportIcon, FileIcon, ImportIcon, PaletteIcon, RefreshIcon } from "../../primitives/icons"
import { DOCUMENT_KINDS } from "../../../core/document/document"
import { useApp } from "../../context"
import { useMoves } from "../../navigation/moves"
import { documentTitle } from "../../wording/documents"
import type { Place } from "../../navigation/place"
import { SideList } from "./SideList"

/**
 * The settings, as a list: the app's own first, then what is done to the
 * books, then what is read — the licences and the deployment's documents —
 * and at its foot the version of the app this copy was built from.
 */
export function SettingsSide(props: { readonly place: Place }): JSX.Element {
  const moves = useMoves()
  const app = useApp()
  return (
    <SidePanel header={<span class="font-semibold text-text-primary">設定</span>} resizeLabel="サイドパネルの幅を変える">
      <SideList
        heading="アプリの設定"
        items={[
          {
            id: "appearance",
            label: "テーマ",
            icon: <PaletteIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "appearance",
            onSelect: () => moves.go({ kind: "settings-section", section: "appearance" }),
          },
          {
            id: "business-day",
            label: "日付の区切り",
            icon: <ClosingIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "business-day",
            onSelect: () => moves.go({ kind: "settings-section", section: "business-day" }),
          },
          {
            id: "sync",
            label: "同期",
            icon: <RefreshIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "sync",
            onSelect: () => moves.go({ kind: "settings-section", section: "sync" }),
          },
          {
            id: "backup",
            label: "バックアップ",
            icon: <BackupIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "backup",
            onSelect: () => moves.go({ kind: "settings-section", section: "backup" }),
          },
          {
            id: "export",
            label: "エクスポート",
            icon: <ExportIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "export",
            onSelect: () => moves.go({ kind: "settings-section", section: "export" }),
          },
          {
            id: "import",
            label: "インポート",
            icon: <ImportIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "import",
            onSelect: () => moves.go({ kind: "settings-section", section: "import" }),
          },
        ]}
      />
      <hr class="mx-4 mt-4 border-border" />
      <SideList
        items={[
          {
            id: "books",
            label: "帳簿の管理",
            icon: <BooksIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "books",
            onSelect: () => moves.go({ kind: "settings-section", section: "books" }),
          },
          {
            id: "consolidation",
            label: "連結会計",
            icon: <ConsolidatedIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "consolidation",
            onSelect: () => moves.go({ kind: "settings-section", section: "consolidation" }),
          },
        ]}
      />
      <hr class="mx-4 mt-4 border-border" />
      <SideList
        items={[
          {
            id: "licenses",
            label: "ライセンス",
            icon: <FileIcon />,
            selected: props.place.kind === "settings-section" && props.place.section === "licenses",
            onSelect: () => moves.go({ kind: "settings-section", section: "licenses" }),
          },
          ...DOCUMENT_KINDS.filter((kind) => app.services.documents[kind] !== undefined).map((kind) => ({
            id: kind,
            label: documentTitle(kind),
            icon: <FileIcon />,
            selected: props.place.kind === "document" && props.place.document === kind,
            onSelect: () => moves.go({ kind: "document", document: kind }),
          })),
        ]}
      />
      <p class="px-4 pt-4 text-xs tabular-nums text-text-muted">バージョン {app.services.version}</p>
    </SidePanel>
  )
}
