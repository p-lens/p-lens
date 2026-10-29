import { Err, Ok, type Result } from "../../core/result/result"
import type { ArchiveBytes } from "../port/archiver"
import type { BackupStore, StoredBackup, StoreFailure } from "../port/backup-store"
import type { GoogleAuthorizer } from "./google-authorizer"

/**
 * All the app asks of a person's Drive: the files it made itself. Their
 * other files are neither listed to it nor readable by it.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"

const FILES = "https://www.googleapis.com/drive/v3/files"
const UPLOADS = "https://www.googleapis.com/upload/drive/v3/files"

const FOLDER_TYPE = "application/vnd.google-apps.folder"
const ARCHIVE_TYPE = "application/zip"

/** The properties, seen by this app alone, that say what a file of its is: the folder backups go in, or the backup put under a key. */
const FOLDER_MARK = "backupFolder"
const KEY_MARK = "backupKey"

/** The most files Drive lists at once. */
const PAGE = 1000

const FILE_FIELDS = "id,name,modifiedTime,appProperties"

export interface GoogleDrivePorts {
  readonly authorizer: GoogleAuthorizer
  readonly request: (url: string, init: RequestInit) => Promise<Response>
  /** How long Drive has to answer, in milliseconds. */
  readonly answerWithin: number
  /** The name of the folder, in the person's Drive, new backups are put in. */
  readonly folderName: string
  /** A fresh run of characters no archive holds, to part an upload's description from its bytes. */
  readonly newBoundary: () => string
}

/** A file as Drive describes it, as far as it is asked to. */
interface DriveFile {
  readonly id: string
  readonly name: string
  readonly modifiedTime: string
  readonly appProperties?: Readonly<Record<string, string>>
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const isDriveFile = (value: unknown): value is DriveFile =>
  isRecord(value) && typeof value["id"] === "string" && typeof value["name"] === "string" && typeof value["modifiedTime"] === "string"

/** The files a listing names, or none where it does not read as a listing: a listing read as empty would put a second file, or folder, beside the first. */
const filesOf = (body: unknown): readonly DriveFile[] | undefined => (isRecord(body) && Array.isArray(body["files"]) && body["files"].every(isDriveFile) ? body["files"] : undefined)

const reasonOf = (body: unknown): string => {
  const error = isRecord(body) ? body["error"] : undefined
  return isRecord(error) && typeof error["message"] === "string" ? error["message"] : "unknown"
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** An answer's body as JSON — none where it is not — or no connection, where it was cut short or not read in time. */
const bodyOf = async (response: Response): Promise<Result<unknown, StoreFailure>> => {
  try {
    return Ok(parsed(await response.text()))
  } catch (cause) {
    return Err({ type: "unreachable", detail: String(cause) })
  }
}

/** Statuses a gateway or a hall's network answers with in the store's place, when it could not reach it or wants a login first: as good as no connection. */
const IN_ITS_PLACE: ReadonlySet<number> = new Set([408, 502, 504, 511])

/** What a store's refusal is, by its status: the sign-in let go, no connection, the store's own trouble, or a no. */
const refusalOf = (status: number, body: unknown): StoreFailure => {
  if (status === 401) return { type: "signed-out" }
  if (IN_ITS_PLACE.has(status)) return { type: "unreachable", detail: `answered ${status}` }
  if (status === 429 || status >= 500) return { type: "store-trouble", status }
  return { type: "refused", status, reason: reasonOf(body) }
}

const storedOf = (file: DriveFile): readonly StoredBackup[] => {
  const key = file.appProperties?.[KEY_MARK]
  return key === undefined ? [] : [{ id: file.id, key, name: file.name, savedAt: file.modifiedTime }]
}

/** A value inside a Drive search, with what would end it early written as Drive reads it. */
const quoted = (value: string): string => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`

const marked = (mark: string, value: string): string => `appProperties has { key=${quoted(mark)} and value=${quoted(value)} }`

const searching = (query: string): string => `${FILES}?${new URLSearchParams({ q: `${query} and trashed=false`, fields: `files(${FILE_FIELDS})`, pageSize: String(PAGE), spaces: "drive" }).toString()}`

/**
 * Backups in a person's Google Drive, through the Drive API: one zip a key,
 * in a folder of the app's own that they can open, move and delete like any
 * other. A backup put again under its key replaces the bytes of the file
 * already there — Drive keeps the earlier ones as that file's versions —
 * wherever the person has moved it to since.
 */
export const createGoogleDriveStore = (ports: GoogleDrivePorts): BackupStore => {
  const answered = async (url: string, init: RequestInit): Promise<Result<Response, StoreFailure>> => {
    const token = await ports.authorizer.token()
    if (!token.ok) return token
    try {
      const response = await ports.request(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token.value}` }, signal: AbortSignal.timeout(ports.answerWithin) })
      if (response.ok) return Ok(response)
      if (response.status === 401) ports.authorizer.forget()
      const body = await bodyOf(response)
      return Err(refusalOf(response.status, body.ok ? body.value : undefined))
    } catch (cause) {
      return Err({ type: "unreachable", detail: String(cause) })
    }
  }

  const described = async (url: string, init: RequestInit): Promise<Result<unknown, StoreFailure>> => {
    const response = await answered(url, init)
    return response.ok ? bodyOf(response.value) : response
  }

  const found = async (query: string): Promise<Result<readonly DriveFile[], StoreFailure>> => {
    const listed = await described(searching(query), { method: "GET" })
    if (!listed.ok) return listed
    const files = filesOf(listed.value)
    return files === undefined ? Err({ type: "unreadable-answer" }) : Ok(files)
  }

  const folder = async (): Promise<Result<string, StoreFailure>> => {
    const kept = await found(`mimeType=${quoted(FOLDER_TYPE)} and ${marked(FOLDER_MARK, "true")}`)
    if (!kept.ok) return kept
    const first = kept.value[0]
    if (first !== undefined) return Ok(first.id)
    const made = await described(`${FILES}?fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ports.folderName, mimeType: FOLDER_TYPE, appProperties: { [FOLDER_MARK]: "true" } }),
    })
    if (!made.ok) return made
    return isDriveFile(made.value) ? Ok(made.value.id) : Err({ type: "unreadable-answer" })
  }

  /** An upload of a file's description and its bytes in one request, as Drive's multipart upload takes them. */
  const upload = async (method: "POST" | "PATCH", url: string, description: Readonly<Record<string, unknown>>, bytes: ArchiveBytes): Promise<Result<StoredBackup, StoreFailure>> => {
    const boundary = ports.newBoundary()
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(description)}\r\n--${boundary}\r\nContent-Type: ${ARCHIVE_TYPE}\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ])
    const kept = await described(`${url}?uploadType=multipart&fields=${FILE_FIELDS}`, { method, headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body })
    if (!kept.ok) return kept
    const stored = isDriveFile(kept.value) ? storedOf(kept.value)[0] : undefined
    return stored === undefined ? Err({ type: "unreadable-answer" }) : Ok(stored)
  }

  return {
    destination: "google-drive",

    warm: ports.authorizer.warm,

    signIn: async () => {
      const token = await ports.authorizer.token()
      return token.ok ? Ok(undefined) : token
    },

    list: async () => {
      const files = await found(`mimeType=${quoted(ARCHIVE_TYPE)}`)
      return files.ok ? Ok(files.value.flatMap(storedOf)) : files
    },

    put: async (archive) => {
      const already = await found(marked(KEY_MARK, archive.key))
      if (!already.ok) return already
      const existing = already.value[0]
      if (existing !== undefined) return upload("PATCH", `${UPLOADS}/${encodeURIComponent(existing.id)}`, { name: archive.name }, archive.bytes)
      const parent = await folder()
      if (!parent.ok) return parent
      return upload("POST", UPLOADS, { name: archive.name, mimeType: ARCHIVE_TYPE, parents: [parent.value], appProperties: { [KEY_MARK]: archive.key } }, archive.bytes)
    },

    fetch: async (id) => {
      const response = await answered(`${FILES}/${encodeURIComponent(id)}?alt=media`, { method: "GET" })
      if (!response.ok) return response
      try {
        return Ok(new Uint8Array(await response.value.arrayBuffer()))
      } catch (cause) {
        return Err({ type: "unreachable", detail: String(cause) })
      }
    },

    remove: async (id) => {
      const trashed = await described(`${FILES}/${encodeURIComponent(id)}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) })
      return trashed.ok ? Ok(undefined) : trashed
    },
  }
}
