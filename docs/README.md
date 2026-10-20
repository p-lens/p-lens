# docs

P-Lens の会計モデルを定める文書です。**日本語版（`ja/`）が正本**で、英語版（`en/`）はその翻訳です。内容が食い違うときは日本語版に従います。

The documents that lay down P-Lens's accounting model. **The Japanese text (`ja/`) is the original**; the English text (`en/`) is its translation, and where the two differ the Japanese holds.

| 文書 / Document | 日本語（正本） | English (translation) |
|---|---|---|
| Pレンズ遊技会計基準（PLAS）本則：前文、全7章19条、附則、改正履歴 | [ja/accounting-policy.md](ja/accounting-policy.md) | [en/accounting-policy.md](en/accounting-policy.md) |
| 付録A　公式会計解釈集（Q1〜Q21） | [ja/accounting-faq.md](ja/accounting-faq.md) | [en/accounting-faq.md](en/accounting-faq.md) |
| 付録B　会計処理に関する重要な宣言 | [ja/accounting-declaration.md](ja/accounting-declaration.md) | [en/accounting-declaration.md](en/accounting-declaration.md) |

## 公式サイトとの関係

このリポジトリの文書が正本です。公式サイトは、ビルドのたびにここから取り込んで掲載します。サイト側で文言を書き換えることはありません。改正はこのリポジトリで行い、本則の「改正履歴」に記録します。

取り込みやすいよう、各ファイルは次の形に揃えています。

- 同じ文書は、言語のディレクトリが違うだけで同じファイル名です（`ja/accounting-policy.md` と `en/accounting-policy.md`）。
- 先頭に YAML のフロントマターがあります。

  | 項目 | 内容 |
  |---|---|
  | `title` | 文書の題名 |
  | `lang` | 本文の言語（`ja` または `en`） |
  | `version` | 対応する基準の版（文字列） |
  | `enacted` | その版の制定日（`YYYY-MM-DD`、文字列） |
  | `translationOf` | 翻訳にだけあり、正本の言語（`ja`）を示す |

- 本文は見出し1（`#`）ひとつで始まり、それが文書の題名です。章は見出し2、条と問いは見出し3です。
- 条の中の項は番号付きリスト、号はその中の番号付きリストです。「前項」「第9条第2項」などの参照は、この番号を指します。
- 本文に他の文書へのリンクや画像はありません。
