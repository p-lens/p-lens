import { type Body, oneOf, text } from "../domain/body"
import { describeMachine } from "../repositories/machines"
import { HIDDEN_TARGETS, hideAllBy, recentlyRegistered, setHidden } from "../repositories/moderation"
import { descriptionOf, type Handler, noContent, ok, param, readBody } from "./handlers"
import type { Route } from "./router"

const RECENT_DEFAULT = 100

const RECENT_MOST = 1000

/** Why it is hidden, if the administrator said; a reason is for them, never shown to anyone else. */
const reasonOf = (body: Body): string | undefined => {
  const read = text(body, "reason")
  return read.ok ? read.value : undefined
}

const limitOf = (url: URL): number => {
  const asked = Number(url.searchParams.get("limit") ?? RECENT_DEFAULT)
  return Number.isInteger(asked) && asked > 0 ? Math.min(asked, RECENT_MOST) : RECENT_DEFAULT
}

const getRecent: Handler = async (context) => {
  const found = await recentlyRegistered(context.database, limitOf(context.url))
  return found.ok ? ok(found.value) : found
}

const hiding =
  (hidden: boolean): Handler =>
  async (context) => {
    const target = oneOf({ target: param(context, "target") }, "target", HIDDEN_TARGETS)
    if (!target.ok) return target
    const body = await readBody(context.request)
    if (!body.ok) return body
    return noContent(await setHidden(context.database, context.effects, target.value, param(context, "id"), reasonOf(body.value), hidden))
  }

const hideDevice: Handler = async (context) => {
  const body = await readBody(context.request)
  if (!body.ok) return body
  const hidden = await hideAllBy(context.database, context.effects, param(context, "device"), reasonOf(body.value))
  return hidden.ok ? ok(hidden.value) : hidden
}

const describe: Handler = async (context) => {
  const body = await readBody(context.request)
  if (!body.ok) return body
  const described = descriptionOf(body.value)
  if (!described.ok) return described
  return noContent(await describeMachine(context.database, context.effects, param(context, "id"), described.value))
}

/**
 * What an administrator does, with the deployment's admin token: look over
 * what was registered lately, hide what vandals registered — one thing, or
 * everything one device registered — and set right how a machine is
 * described, when someone writes in: its name, its model name, its
 * 大当り確率 and the words it is searched by. Nothing is ever deleted;
 * whatever is hidden can be shown again, and a formula is never changed. A
 * device's route comes first, as its path also fits the one for a single
 * thing.
 */
export const ADMIN_ROUTES: readonly Route<Handler>[] = [
  { method: "GET", path: "/admin/recent", handler: getRecent },
  { method: "PUT", path: "/admin/devices/:device/hidden", handler: hideDevice },
  { method: "PUT", path: "/admin/machines/:id/description", handler: describe },
  { method: "PUT", path: "/admin/:target/:id/hidden", handler: hiding(true) },
  { method: "DELETE", path: "/admin/:target/:id/hidden", handler: hiding(false) },
]
