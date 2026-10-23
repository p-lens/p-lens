import { isMumming } from "./mumming"
import { exposureOf, type Facet, type KindWith } from "./policy"
import { SEALED, type Secret } from "./secret"

/** What a secret is shown as: something to read or to measure by, never the value itself. */
type Shown = string | number

/** Whether a facet of a kind is shown now: always outside mumming, and inside it as the policy says. */
const showing = <F extends Facet>(kind: KindWith<F>, facet: F): boolean => !isMumming() || exposureOf(kind, facet) === "shown"

const facetOf =
  <F extends Facet>(facet: F) =>
  <K extends KindWith<F>, T, R extends Shown>(secret: Secret<K, T>, shown: (value: T) => R, veiled: R): R =>
    showing(secret.kind, facet) ? shown(secret[SEALED]) : veiled

/**
 * The one way out of a secret, facet by facet: what the value shows as
 * where the policy lets that facet be seen, and what stands in for it
 * where it does not. Called while a screen is drawn, it follows mumming
 * as it is turned.
 */
export const veil = {
  text: facetOf("text"),
  initial: facetOf("initial"),
  length: facetOf("length"),
  figure: facetOf("figure"),
  tone: facetOf("tone"),
  scale: facetOf("scale"),
} as const

/** Whether a part of a screen of this kind is shown now: everywhere outside mumming. */
export const isWholeShown = (kind: KindWith<"whole">): boolean => showing(kind, "whole")
