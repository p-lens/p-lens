import { isDocumentKind, type Documents } from "../core/document/document"

/**
 * The documents this deployment puts before people, as the files beside
 * this one: `terms.md` and `privacy.md`. They are whoever runs the
 * deployment's own — a fork writes its own in their place, or takes them
 * away, and the app shows whichever are here and offers no other.
 */
const TEXTS = import.meta.glob<string>("./*.md", { query: "?raw", import: "default", eager: true })

export const brandedDocuments = (): Documents =>
  Object.fromEntries(
    Object.entries(TEXTS).flatMap(([path, text]) => {
      const name = path.replace(/^\.\//, "").replace(/\.md$/, "")
      return isDocumentKind(name) && text.trim() !== "" ? [[name, text]] : []
    }),
  )
