import { createBookSession } from "../../application/book-session"
import { consolidationPorts, createOutdatedNotice } from "../../application/consolidation"
import { createBrowserHandover } from "../../backup/browser/browser-handover"
import { createGoogleAuthorizer } from "../../backup/google-drive/google-authorizer"
import { createGoogleDriveStore, DRIVE_SCOPE } from "../../backup/google-drive/google-drive-store"
import { createIndexedDbDestinationStore } from "../../sync/local/indexed-db-destination-store"
import { keepingHistory } from "../../application/draft-history"
import { createIndexedDbInvitationStore } from "../../sync/local/indexed-db-invitation-store"
import { createIndexedDbReceiptStore } from "../../backup/local/indexed-db-receipt-store"
import { createWebCryptoDigest } from "../../backup/web-crypto/web-crypto-digest"
import { createZipArchiver } from "../../backup/zip/zip-archiver"
import type { Services } from "../../application/services"
import type { BookId, Member, MemberId } from "../../core/book/book"
import { unnamedTitle } from "../../core/book/unnamed-title"
import { firstBook } from "./first-book"
import { businessDayOf, localDayOf } from "../../core/calendar/calendar"
import type { PlayId } from "../../core/play/play"
import { createHledgerClient } from "../../hledger/client/client"
import { createIndexedDbHistory } from "../../history/adapters/indexed-db-history"
import { createAbsentCatalogApi } from "../../catalog/absent/absent-catalog-api"
import { createDeliveredCatalog } from "../../catalog/delivered/delivered-catalog"
import { createHttpCatalogApi } from "../../catalog/http/http-catalog-api"
import { createIndexedDbDevice } from "../../catalog/local/indexed-db-device"
import { createTurnstileCheck } from "../../catalog/turnstile/turnstile"
import { createAbsentDirectory } from "../../parlors/absent/absent-directory"
import { createJsonlDirectory } from "../../parlors/jsonl/jsonl-directory"
import { browserLocator } from "../../location/browser/geolocation"
import { createIndexedDbParlorCache } from "../../parlors/local/indexed-db-cache"
import { createIndexedDbSubmissions } from "../../parlors/local/indexed-db-submissions"
import { createReasonerClient } from "../../reasoning/client/client"
import * as PachinkoEngine from "../../pachinko-engine/client/client"
import * as PachislotEngine from "../../pachislot-engine/client/client"
import { createSampleMakerClient } from "../../sample-book/client/client"
import type { UuidV7 } from "@p-lens/uuidv7"

import { DEPLOYMENT } from "../../branding/deployment"
import { brandedDocuments } from "../../branding/documents"
import { freshFraction, freshSeed, freshUuidV7, uuidV7On, voterOf } from "./ids"
import { createConnection } from "../../storage/browser/database"
import { createBrowserStorageKeeper } from "../../storage/browser/storage-keeper"
import { createBrowserDeviceData } from "../../storage/browser/device-data"
import { createLocalStoragePreferences } from "../../preferences/local/local-storage-preferences"
import { createIndexedDbDrafts, createIndexedDbStorage } from "../../storage/browser/indexed-db"
import { createHttpRelay } from "../../sync/http/http-relay"
import { createIndexedDbLinkStore } from "../../sync/local/indexed-db-link-store"
import { createWebCryptoSealer } from "../../sync/web-crypto/web-crypto-sealer"
import { createIndexedDbSummaries } from "../../consolidation/local/indexed-db-summaries"
import { createMemorySummaries } from "../../consolidation/memory/memory-summaries"
import { createTieredSummaries } from "../../consolidation/tiered/tiered-summaries"
import { webCryptoJournalsDigest } from "../../consolidation/web-crypto/journals-digest"

/**
 * The person using this device, as every book on it knows them. One fixed
 * member until identities exist; a book shared later names its members by
 * the identities sync brings.
 */
const LOCAL_MEMBER = "local" as MemberId

/**
 * The relay a book starts syncing through, named at build time. A build that
 * names none starts no sync of its own; a book is still joined by its code,
 * which names its relay itself.
 */
const RELAY_URL: string | undefined = import.meta.env.VITE_RELAY_URL

/**
 * The OAuth client id books are backed up to Google Drive under, made in
 * Google Cloud for the app's own origin and named at build time. A build
 * that names none backs a book up to a file only.
 */
const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID

/** The folder, in a person's Google Drive, their backups are put in. */
const BACKUP_FOLDER = `${DEPLOYMENT.name} バックアップ`

/** How long Google Drive is waited for: an archive goes up whole, on whatever network a hall has. */
const DRIVE_ANSWERS_WITHIN = 120_000

/**
 * Where the parlor list is published — parlors.p-lens.jp for app.p-lens.jp
 * — named at build time, ending in a slash. A build that names none has no
 * parlors to choose: someone setting P-Lens up for themselves needs no list
 * for it to work.
 */
const PARLORS_URL: string | undefined = import.meta.env.VITE_PARLORS_URL

/** Where a parlor not on the list is submitted — survey.p-lens.jp for app.p-lens.jp — named at build time. */
const SURVEY_URL: string | undefined = import.meta.env.VITE_SURVEY_URL

/**
 * Where the shared catalog of machines and formulas answers, named at build
 * time; the API takes writes only from the pages it is told serve the app.
 * A build that names none has no catalog delivered: plays are still
 * recorded, by their result.
 */
const CATALOG_URL: string | undefined = import.meta.env.VITE_CATALOG_URL

/** The deployment's Turnstile site key, named at build time; with none, registering carries no check. */
const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY

/** How long the parlor list, or the shared catalog, is waited for before the device makes do with its copy. */
const ANSWER_WITHIN = 8000

/** How long a reading of the parlor list stands before it is read again behind the device's copy: the list changes a few times a week. */
const PARLORS_FRESH_FOR = 10 * 60 * 1000

/** How long after the consolidation shows what each book was last answered it reads the books to check them: once the screen is drawn. */
const CHECKED_AFTER_SHOWN = 300

/**
 * The one place that names concrete adapters. Everything else knows ports.
 * The engines' and the reasoner's workers are only spawned the first time
 * they are asked something, so none of them is fetched at startup.
 */
export const createServices = (): Services => {
  const clock = (): Date => new Date()
  const database = createConnection()
  const history = createIndexedDbHistory(database, freshUuidV7)
  const preferences = createLocalStoragePreferences()
  const storage = createIndexedDbStorage(database)
  const me: Member = { id: LOCAL_MEMBER, displayName: "自分", role: "owner" }
  const session = createBookSession({
    hledger: createHledgerClient(() => new Worker(new URL("../../hledger/worker/worker.ts", import.meta.url), { type: "module" })),
    storage,
    history,
    clock,
    newId: freshUuidV7,
    member: LOCAL_MEMBER,
  })
  const links = createIndexedDbLinkStore(database)
  const drafts = keepingHistory(createIndexedDbDrafts(database), () => clock().toISOString())
  const receipts = createIndexedDbReceiptStore(database)
  const handover = createBrowserHandover()
  const archiver = createZipArchiver()
  return {
    session,
    consolidation: consolidationPorts({
      session,
      summaries: createTieredSummaries(createMemorySummaries(), createIndexedDbSummaries(database, import.meta.env.VITE_APP_VERSION as string)),
      digest: webCryptoJournalsDigest,
      today: () => businessDayOf(clock(), preferences.businessDayTurn()),
      afterShown: (work) => void setTimeout(work, CHECKED_AFTER_SHOWN),
      outdated: createOutdatedNotice(),
    }),
    history,
    sync: {
      session,
      history,
      links,
      relay: createHttpRelay({ request: (url, init) => fetch(url, init), answerWithin: ANSWER_WITHIN }),
      sealer: createWebCryptoSealer(),
      me,
      now: () => clock().toISOString(),
      newCommitId: freshUuidV7,
    },
    invitations: createIndexedDbInvitationStore(database),
    destinations: createIndexedDbDestinationStore(database),
    relayUrl: RELAY_URL === undefined || RELAY_URL === "" ? undefined : RELAY_URL.replace(/\/+$/, ""),
    backup: {
      storage,
      session,
      archiver,
      digest: createWebCryptoDigest(),
      receipts,
      handover,
      me,
      now: () => clock().toISOString(),
      today: () => localDayOf(clock()),
    },
    export: { session, archiver, handover, today: () => localDayOf(clock()) },
    backupStore:
      GOOGLE_CLIENT_ID === undefined || GOOGLE_CLIENT_ID === ""
        ? undefined
        : createGoogleDriveStore({
            authorizer: createGoogleAuthorizer({ clientId: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE }),
            request: (url, init) => fetch(url, init),
            answerWithin: DRIVE_ANSWERS_WITHIN,
            folderName: BACKUP_FOLDER,
            newBoundary: () => `backup-${freshUuidV7()}`,
          }),
    drafts,
    member: LOCAL_MEMBER,
    voter: voterOf,
    documents: brandedDocuments(),
    name: DEPLOYMENT.name,
    operatorPage: DEPLOYMENT.operatorPage,
    landingPage: DEPLOYMENT.landingPage,
    version: import.meta.env.VITE_APP_VERSION as string,
    today: () => localDayOf(clock()),
    businessDay: () => businessDayOf(clock(), preferences.businessDayTurn()),
    preferences,
    now: () => clock().toISOString(),
    newPlayId: () => freshUuidV7() as string as PlayId,
    unnamedTitle: (taken) => unnamedTitle(taken, freshFraction()),
    firstBook: () => firstBook(freshUuidV7() as string as BookId, LOCAL_MEMBER, unnamedTitle([], freshFraction())),
    storageKeeper: createBrowserStorageKeeper(),
    deviceData: createBrowserDeviceData(database),
    deletion: { storage, history, links, receipts, drafts },
    playIdOn: (fresh, date) => uuidV7On(fresh as string as UuidV7, date) as string as PlayId,
    newSeed: freshSeed,
    catalog: createDeliveredCatalog(
      database,
      CATALOG_URL === undefined
        ? createAbsentCatalogApi()
        : createHttpCatalogApi({
            base: CATALOG_URL.replace(/\/+$/, ""),
            request: (url, init) => fetch(url, init),
            answerWithin: ANSWER_WITHIN,
            device: createIndexedDbDevice(database, freshUuidV7),
            humanCheck: TURNSTILE_SITE_KEY === undefined || TURNSTILE_SITE_KEY === "" ? undefined : createTurnstileCheck(TURNSTILE_SITE_KEY),
          }),
      { newId: freshUuidV7, now: () => clock().toISOString() },
    ),
    catalogShared: CATALOG_URL !== undefined,
    submissions: createIndexedDbSubmissions(database),
    locate: browserLocator,
    surveyUrl: PARLORS_URL === undefined ? undefined : SURVEY_URL,
    parlors:
      PARLORS_URL === undefined
        ? createAbsentDirectory()
        : createJsonlDirectory({
            base: PARLORS_URL.endsWith("/") ? PARLORS_URL : `${PARLORS_URL}/`,
            request: (url, init) => fetch(url, init),
            answerWithin: ANSWER_WITHIN,
            freshFor: PARLORS_FRESH_FOR,
            now: () => clock().getTime(),
            cache: createIndexedDbParlorCache(database),
          }),
    pachinko: PachinkoEngine.createEngineClient(
      () => new Worker(new URL("../../pachinko-engine/worker/pachinko-worker.ts", import.meta.url), { type: "module" }),
    ),
    pachinkoReasoner: createReasonerClient(() => new Worker(new URL("../../reasoning/pachinko/reasoner-worker.ts", import.meta.url), { type: "module" })),
    pachislot: PachislotEngine.createEngineClient(
      () => new Worker(new URL("../../pachislot-engine/worker/pachislot-worker.ts", import.meta.url), { type: "module" }),
    ),
    pachislotReasoner: createReasonerClient(() => new Worker(new URL("../../reasoning/pachislot/reasoner-worker.ts", import.meta.url), { type: "module" })),
    sampleMaker: createSampleMakerClient(() => new Worker(new URL("../../sample-book/worker/sample-worker.ts", import.meta.url), { type: "module" })),
  }
}
