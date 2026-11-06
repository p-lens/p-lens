import { Err, Ok, type Result } from "../../core/result/result"
import { answerOf, encodeClientMessage, readRelayMessage, type Answer, type ClientMessage, type Filter } from "../core/messages"
import type { Connection, ConnectionState, PublishFailure, Relays, Subscription, SubscriptionHandlers } from "../port/relay"

/** The wait before opening again: from a second, doubling to a minute, with up to a quarter more at random. */
export const backoffMs = (attempts: number, random: number): number => {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1))
  return Math.round(base * (1 + random / 4))
}

type Waiting = { readonly resolve: (result: Result<Answer, PublishFailure>) => void; readonly timer: ReturnType<typeof setTimeout> }

type Held = {
  socket: WebSocket | undefined
  state: ConnectionState
  reconnect: ReturnType<typeof setTimeout> | undefined
  lastOpenAt: number | undefined
  attempts: number
  next: number
  readonly subscriptions: Map<string, { readonly asked: () => readonly Filter[]; readonly handlers: SubscriptionHandlers }>
  readonly unsent: Map<string, string>
  readonly waiting: Map<string, Waiting>
  readonly listeners: Set<(state: ConnectionState) => void>
}

const connectTo = (url: string, WebSocketOf: typeof WebSocket): Connection => {
  const held: Held = {
    socket: undefined,
    state: { type: "connecting" },
    reconnect: undefined,
    lastOpenAt: undefined,
    attempts: 0,
    next: 0,
    subscriptions: new Map(),
    unsent: new Map(),
    waiting: new Map(),
    listeners: new Set(),
  }

  const setState = (state: ConnectionState): void => {
    held.state = state
    held.listeners.forEach((listener) => listener(state))
  }

  const sendNow = (message: ClientMessage): boolean => {
    if (held.socket?.readyState !== WebSocketOf.OPEN) return false
    held.socket.send(encodeClientMessage(message))
    return true
  }

  const onMessage = (raw: unknown): void => {
    const message = typeof raw === "string" ? readRelayMessage(raw) : undefined
    if (message === undefined) return
    switch (message.type) {
      case "event":
        held.subscriptions.get(message.subscription)?.handlers.onEvent(message.event)
        return
      case "eose":
        held.subscriptions.get(message.subscription)?.handlers.onCaughtUp?.()
        return
      case "closed":
        held.subscriptions.get(message.subscription)?.handlers.onEnded?.(message.reason)
        held.subscriptions.delete(message.subscription)
        return
      case "ok": {
        const waiting = held.waiting.get(message.id)
        held.unsent.delete(message.id)
        if (waiting === undefined) return
        clearTimeout(waiting.timer)
        held.waiting.delete(message.id)
        waiting.resolve(Ok(answerOf(message.accepted, message.reason)))
        return
      }
      case "notice":
        return
    }
  }

  const open = (): void => {
    if (held.state.type === "closed" || held.state.type === "paused") return
    const socket = new WebSocketOf(url)
    held.socket = socket
    socket.onopen = () => {
      held.attempts = 0
      held.lastOpenAt = Date.now()
      setState({ type: "open" })
      held.subscriptions.forEach(({ asked }, subscription) => sendNow({ type: "req", subscription, filters: asked() }))
      held.unsent.forEach((raw) => socket.send(raw))
    }
    socket.onmessage = (message) => onMessage(message.data)
    socket.onclose = () => {
      if (held.socket !== socket || held.state.type === "closed" || held.state.type === "paused") return
      held.socket = undefined
      held.attempts += 1
      setState({ type: "failing", attempts: held.attempts, lastOpenAt: held.lastOpenAt })
      held.reconnect = setTimeout(open, backoffMs(held.attempts, Math.random()))
    }
  }

  open()

  return {
    state: () => held.state,
    onState: (listener) => {
      held.listeners.add(listener)
      return () => held.listeners.delete(listener)
    },
    subscribe: (asked, handlers): Subscription => {
      const subscription = `s${held.next++}`
      held.subscriptions.set(subscription, { asked, handlers })
      sendNow({ type: "req", subscription, filters: asked() })
      return {
        close: () => {
          if (held.subscriptions.delete(subscription)) sendNow({ type: "close", subscription })
        },
      }
    },
    publish: (event, timeoutMs) =>
      new Promise((resolve) => {
        if (held.state.type === "closed") return resolve(Err({ type: "closed" }))
        const raw = encodeClientMessage({ type: "event", event })
        held.unsent.set(event.id, raw)
        const timer = setTimeout(() => {
          held.waiting.delete(event.id)
          held.unsent.delete(event.id)
          resolve(Err({ type: "no-answer" }))
        }, timeoutMs)
        held.waiting.set(event.id, { resolve, timer })
        sendNow({ type: "event", event })
      }),
    reopen: () => {
      if (held.state.type !== "failing" && held.state.type !== "paused") return
      clearTimeout(held.reconnect)
      setState({ type: "connecting" })
      open()
    },
    pause: () => {
      if (held.state.type === "closed" || held.state.type === "paused") return
      clearTimeout(held.reconnect)
      setState({ type: "paused" })
      held.socket?.close()
      held.socket = undefined
    },
    close: () => {
      clearTimeout(held.reconnect)
      setState({ type: "closed" })
      held.waiting.forEach((waiting) => {
        clearTimeout(waiting.timer)
        waiting.resolve(Err({ type: "closed" }))
      })
      held.waiting.clear()
      held.socket?.close()
      held.socket = undefined
    },
  }
}

/** Relays reached by the browser's WebSocket. */
export const createWebSocketRelays = (WebSocketOf: typeof WebSocket = WebSocket): Relays => ({
  connect: (url) => connectTo(url, WebSocketOf),
})
