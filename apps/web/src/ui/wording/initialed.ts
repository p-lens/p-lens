import { leadingGraphemesOf } from "../../core/text/leading-graphemes"
import { veil, type KindWith, type Secret } from "../../mummer"

/** What stands for a name after its first character while it is veiled: one shape, whatever the name, and with the first character four, as many as the rail ever shows of a book. */
const VEILED_REST = "•••"

/** A name a person gave — a book's, a member's — as a screen shows it: `🌱•••` while mumming, its first character kept, an emoji counted as one. */
export const initialedText = (name: Secret<KindWith<"initial">, string>): string =>
  veil.text(name, (shown) => shown, `${veil.initial(name, (shown) => leadingGraphemesOf(shown.trim(), 1), "")}${VEILED_REST}`)
