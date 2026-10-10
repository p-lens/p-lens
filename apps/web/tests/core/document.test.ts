import { describe, expect, test } from "bun:test"

import { blocksOf, isDocumentKind } from "../../src/core/document/document"

describe("a document", () => {
  test("is read into headings to three deep, lists and paragraphs, each set off by a blank line", () => {
    const text = "# 利用規約\n\n最終更新日：2026年10月10日\n\n## 1. はじめに\n\n一行目。\n二行目。\n\n- ひとつ\n- ふたつ\n\n### 補足\n\n#### 深すぎる見出しは段落\n"
    expect(blocksOf(text)).toEqual([
      { type: "heading", level: 1, text: "利用規約" },
      { type: "paragraph", text: "最終更新日：2026年10月10日" },
      { type: "heading", level: 2, text: "1. はじめに" },
      { type: "paragraph", text: "一行目。二行目。" },
      { type: "list", items: ["ひとつ", "ふたつ"] },
      { type: "heading", level: 3, text: "補足" },
      { type: "paragraph", text: "#### 深すぎる見出しは段落" },
    ])
  })

  test("with nothing written has no blocks, and lines of a list mixed with others are a paragraph", () => {
    expect(blocksOf("  \n\n\n")).toEqual([])
    expect(blocksOf("- 項目\n続きの文")).toEqual([{ type: "paragraph", text: "- 項目続きの文" }])
  })

  test("is one of the kinds the app has a place for", () => {
    expect([isDocumentKind("terms"), isDocumentKind("privacy"), isDocumentKind("settings")]).toEqual([true, true, false])
  })
})
