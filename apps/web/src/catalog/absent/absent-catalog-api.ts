import { Err } from "../../core/result/result"
import type { ApiFailure, CatalogApi } from "../port/catalog-api"

const NONE: ApiFailure = { type: "absent" }

/**
 * The shared catalog of a P-Lens built with none — one set up by someone for
 * themselves. Nothing is delivered and nothing can be registered; plays are
 * still recorded, by their result.
 */
export const createAbsentCatalogApi = (): CatalogApi => ({
  version: async () => Err(NONE),
  catalog: async () => Err(NONE),
  quota: async () => Err(NONE),
  register: async () => Err(NONE),
  addFormula: async () => Err(NONE),
  addDistribution: async () => Err(NONE),
  send: async () => Err(NONE),
})
