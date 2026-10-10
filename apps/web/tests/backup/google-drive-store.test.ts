import { describe, expect, test } from "bun:test"

import type { GoogleAuthorizer } from "../../src/backup/google-drive/google-authorizer"
import { createGoogleDriveStore } from "../../src/backup/google-drive/google-drive-store"
import type { StoreFailure } from "../../src/backup/port/backup-store"
import { Err, Ok } from "../../src/core/result/result"

interface DriveFile {
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly modifiedTime: string
  readonly appProperties: Readonly<Record<string, string>>
  readonly parents: readonly string[]
  readonly trashed: boolean
  readonly bytes: Uint8Array<ArrayBuffer>
}

const FOLDER_TYPE = "application/vnd.google-apps.folder"

const indexOf = (bytes: Uint8Array, mark: Uint8Array, from: number): number =>
  bytes.findIndex((_, at) => at >= from && mark.every((byte, offset) => bytes[at + offset] === byte))

/** The description and the bytes of a multipart upload, as Drive would part them. */
const partsOf = async (init: RequestInit): Promise<{ readonly description: Record<string, unknown>; readonly bytes: Uint8Array<ArrayBuffer> }> => {
  const boundary = /boundary=(.+)$/.exec((init.headers as Record<string, string>)["Content-Type"] ?? "")?.[1] ?? ""
  const body = new Uint8Array(await (init.body as Blob).arrayBuffer())
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text)
  const blank = encode("\r\n\r\n")
  const firstBody = indexOf(body, blank, 0) + blank.length
  const firstEnd = indexOf(body, encode(`\r\n--${boundary}`), firstBody)
  const secondBody = indexOf(body, blank, firstEnd) + blank.length
  const secondEnd = body.length - encode(`\r\n--${boundary}--`).length
  return { description: JSON.parse(new TextDecoder().decode(body.slice(firstBody, firstEnd))) as Record<string, unknown>, bytes: body.slice(secondBody, secondEnd) }
}

const matches = (file: DriveFile, query: string): boolean => {
  const type = /mimeType='([^']+)'/.exec(query)?.[1]
  const mark = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(query)
  return !file.trashed && query.includes("trashed=false") && (type === undefined || file.mimeType === type) && (mark === null || file.appProperties[mark[1] ?? ""] === mark[2])
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** As much of Drive as the store asks of it, held in memory, taking only the token it is told to. */
const fakeDrive = (token: string) => {
  const held: { files: readonly DriveFile[]; asked: readonly string[]; ticks: number } = { files: [], asked: [], ticks: 0 }
  const described = (file: DriveFile) => ({ id: file.id, name: file.name, modifiedTime: file.modifiedTime, appProperties: file.appProperties })
  const stamp = (): string => `2026-10-07T03:00:${String((held.ticks += 1)).padStart(2, "0")}.000Z`
  const made = (description: Record<string, unknown>, bytes: Uint8Array<ArrayBuffer>): DriveFile => {
    const file: DriveFile = {
      id: `id-${held.files.length + 1}`,
      name: String(description["name"]),
      mimeType: String(description["mimeType"]),
      modifiedTime: stamp(),
      appProperties: (description["appProperties"] as Record<string, string> | undefined) ?? {},
      parents: (description["parents"] as string[] | undefined) ?? [],
      trashed: false,
      bytes,
    }
    held.files = [...held.files, file]
    return file
  }
  const request = async (address: string, init: RequestInit): Promise<Response> => {
    const url = new URL(address)
    const method = init.method ?? "GET"
    held.asked = [...held.asked, `${method} ${url.pathname}`]
    if ((init.headers as Record<string, string>)["Authorization"] !== `Bearer ${token}`) return json({ error: { message: "Invalid Credentials" } }, 401)
    if (method === "GET" && url.pathname === "/drive/v3/files") return json({ files: held.files.filter((file) => matches(file, url.searchParams.get("q") ?? "")).map(described) })
    if (method === "POST" && url.pathname === "/drive/v3/files") return json(described(made(JSON.parse(String(init.body)) as Record<string, unknown>, new Uint8Array())))
    if (method === "POST" && url.pathname === "/upload/drive/v3/files") {
      const parts = await partsOf(init)
      return json(described(made(parts.description, parts.bytes)))
    }
    const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "")
    const existing = held.files.find((file) => file.id === id && !file.trashed)
    if (existing === undefined) return json({ error: { message: "File not found" } }, 404)
    if (method === "PATCH" && url.pathname.startsWith("/upload/drive/v3/files/")) {
      const parts = await partsOf(init)
      const updated: DriveFile = { ...existing, name: String(parts.description["name"]), bytes: parts.bytes, modifiedTime: stamp() }
      held.files = held.files.map((file) => (file.id === id ? updated : file))
      return json(described(updated))
    }
    if (method === "GET" && url.searchParams.get("alt") === "media") return new Response(existing.bytes)
    return json({ error: { message: "unexpected request" } }, 400)
  }
  return {
    request,
    files: () => held.files,
    asked: () => held.asked,
    trash: (id: string) => {
      held.files = held.files.map((file) => (file.id === id ? { ...file, trashed: true } : file))
    },
  }
}

const authorizerGiving = (token: string | StoreFailure): GoogleAuthorizer & { readonly forgotten: () => number } => {
  const held = { forgotten: 0 }
  return {
    forgotten: () => held.forgotten,
    token: async () => (typeof token === "string" ? Ok(token) : Err(token)),
    warm: () => undefined,
    forget: () => {
      held.forgotten += 1
    },
  }
}

const storeOver = (drive: ReturnType<typeof fakeDrive>, authorizer: GoogleAuthorizer) =>
  createGoogleDriveStore({ authorizer, request: drive.request, answerWithin: 1000, folderName: "バックアップ", newBoundary: () => "boundary-of-the-test" })

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values)

describe("backups in Google Drive", () => {
  test("a first backup makes the folder, and the archive in it under its key", async () => {
    const drive = fakeDrive("token")
    const put = await storeOver(drive, authorizerGiving("token")).put({ key: "book-1", name: "帳簿.zip", bytes: bytes(80, 75, 3, 4, 13, 10, 45, 45, 0, 255) })
    const [folder, archive] = drive.files()
    expect(folder).toMatchObject({ name: "バックアップ", mimeType: FOLDER_TYPE, appProperties: { backupFolder: "true" } })
    expect(archive).toMatchObject({ name: "帳簿.zip", mimeType: "application/zip", parents: [folder?.id], appProperties: { backupKey: "book-1" } })
    expect(archive?.bytes).toEqual(bytes(80, 75, 3, 4, 13, 10, 45, 45, 0, 255))
    expect(put).toEqual({ ok: true, value: { id: archive?.id ?? "", key: "book-1", name: "帳簿.zip", savedAt: archive?.modifiedTime ?? "" } })
  })

  test("a backup put again replaces the bytes of the file already there, and takes its new name", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving("token"))
    const first = await store.put({ key: "book-1", name: "帳簿.zip", bytes: bytes(1, 2, 3) })
    const second = await store.put({ key: "book-1", name: "改名した帳簿.zip", bytes: bytes(4, 5) })
    expect(drive.files().filter((file) => file.mimeType === "application/zip")).toHaveLength(1)
    expect(second.ok && first.ok && second.value.id === first.value.id && second.value.savedAt > first.value.savedAt).toBe(true)
    expect(drive.files()[1]).toMatchObject({ name: "改名した帳簿.zip", bytes: bytes(4, 5), appProperties: { backupKey: "book-1" } })
  })

  test("a second book goes into the same folder", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving("token"))
    await store.put({ key: "book-1", name: "一.zip", bytes: bytes(1) })
    await store.put({ key: "book-2", name: "二.zip", bytes: bytes(2) })
    const folders = drive.files().filter((file) => file.mimeType === FOLDER_TYPE)
    expect(folders).toHaveLength(1)
    expect(drive.files().filter((file) => file.parents[0] === folders[0]?.id).map((file) => file.name)).toEqual(["一.zip", "二.zip"])
  })

  test("a backup the person threw away is made anew", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving("token"))
    const first = await store.put({ key: "book-1", name: "帳簿.zip", bytes: bytes(1) })
    drive.trash(first.ok ? first.value.id : "")
    const second = await store.put({ key: "book-1", name: "帳簿.zip", bytes: bytes(2) })
    expect(second.ok && first.ok && second.value.id !== first.value.id).toBe(true)
    expect(await store.list()).toEqual({ ok: true, value: second.ok ? [second.value] : [] })
  })

  test("lists the backups, and neither the folder nor a zip that is not one", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving("token"))
    const put = await store.put({ key: "book-1", name: "帳簿.zip", bytes: bytes(1) })
    await drive.request("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { Authorization: "Bearer token" }, body: JSON.stringify({ name: "ほかの.zip", mimeType: "application/zip" }) })
    expect(await store.list()).toEqual({ ok: true, value: put.ok ? [put.value] : [] })
  })

  test("fetches a backup's bytes as they were put", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving("token"))
    const put = await store.put({ key: "book-1", name: "帳簿.zip", bytes: bytes(0, 255, 13, 10, 45, 45) })
    expect(await store.fetch(put.ok ? put.value.id : "")).toEqual({ ok: true, value: bytes(0, 255, 13, 10, 45, 45) })
  })

  test("asks nothing of Drive when the person does not sign in", async () => {
    const drive = fakeDrive("token")
    const store = storeOver(drive, authorizerGiving({ type: "sign-in-declined", reason: "popup_closed" }))
    expect(await store.list()).toEqual({ ok: false, error: { type: "sign-in-declined", reason: "popup_closed" } })
    expect(drive.asked()).toEqual([])
  })

  test("lets go of a token Drive no longer takes, and says it was refused", async () => {
    const drive = fakeDrive("token")
    const authorizer = authorizerGiving("stale")
    expect(await storeOver(drive, authorizer).list()).toEqual({ ok: false, error: { type: "refused", status: 401, reason: "Invalid Credentials" } })
    expect(authorizer.forgotten()).toBe(1)
  })

  test("says a backup that is gone was refused", async () => {
    const drive = fakeDrive("token")
    expect(await storeOver(drive, authorizerGiving("token")).fetch("nowhere")).toEqual({ ok: false, error: { type: "refused", status: 404, reason: "File not found" } })
  })

  test("says Drive could not be reached when the request fails", async () => {
    const store = createGoogleDriveStore({
      authorizer: authorizerGiving("token"),
      request: async () => {
        throw new TypeError("Failed to fetch")
      },
      answerWithin: 1000,
      folderName: "バックアップ",
      newBoundary: () => "boundary-of-the-test",
    })
    expect(await store.list()).toEqual({ ok: false, error: { type: "unreachable", detail: "TypeError: Failed to fetch" } })
  })
})
