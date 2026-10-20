import type { DocumentKind } from "../../core/document/document"

const TITLES: Readonly<Record<DocumentKind, string>> = { terms: "利用規約", privacy: "プライバシーポリシー" }

/** What a document is called wherever it is linked to. */
export const documentTitle = (kind: DocumentKind): string => TITLES[kind]

/** What the link to the page of whoever runs the deployment is called: who they are, and how to write to them. */
export const OPERATOR_PAGE = "運営元・お問い合わせ"
