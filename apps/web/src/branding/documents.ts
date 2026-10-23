import { isDocumentKind, type Documents } from "../core/document/document"

/**
 * The documents this deployment puts before people, as the files in the
 * branding the build took: `terms.md` and `privacy.md`. They are whoever
 * runs the deployment's own — a fork writes its own there, or leaves them
 * out, and the app shows whichever are there and offers no other.
 */
const TEXTS = import.meta.glob<string>("@branding/*.md", { query: "?raw", import: "default", eager: true })

export const brandedDocuments = (): Documents =>
  Object.fromEntries(
    Object.entries(TEXTS).flatMap(([path, text]) => {
      const name = (path.split("/").pop() ?? "").replace(/\.md$/, "")
      return isDocumentKind(name) && text.trim() !== "" ? [[name, text]] : []
    }),
  )
