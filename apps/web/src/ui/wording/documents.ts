import type { DocumentKind } from "../../core/document/document"

const TITLES: Readonly<Record<DocumentKind, string>> = { terms: "利用規約", privacy: "プライバシーポリシー" }

/** What a document is called wherever it is linked to. */
export const documentTitle = (kind: DocumentKind): string => TITLES[kind]
