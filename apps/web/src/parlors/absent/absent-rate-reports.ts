import { Ok } from "../../core/result/result"
import type { RateReports } from "../port/rate-reports"

/** The rate reports of a P-Lens built with no parlor list: none, so no rate is ever filled in and none asked for. */
export const createAbsentRateReports = (): RateReports => ({ rates: async () => Ok(new Map()) })
