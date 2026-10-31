import { Err, Ok, type Result } from "../../core/result/result"
import type { StoreFailure } from "../port/backup-store"

/** What the Picker hands its callback, as far as it is read. */
interface PickerAnswer {
  readonly action?: string
  readonly docs?: readonly { readonly id?: unknown }[]
}

interface Picker {
  readonly setVisible: (visible: boolean) => void
  readonly dispose: () => void
}

interface DocsView {
  readonly setMimeTypes: (types: string) => DocsView
  readonly setIncludeFolders: (include: boolean) => DocsView
  readonly setMode: (mode: string) => DocsView
}

interface PickerBuilder {
  readonly addView: (view: DocsView) => PickerBuilder
  readonly enableFeature: (feature: string) => PickerBuilder
  readonly setOAuthToken: (token: string) => PickerBuilder
  readonly setDeveloperKey: (key: string) => PickerBuilder
  readonly setAppId: (id: string) => PickerBuilder
  readonly setLocale: (locale: string) => PickerBuilder
  readonly setTitle: (title: string) => PickerBuilder
  readonly setCallback: (callback: (answer: PickerAnswer) => void) => PickerBuilder
  readonly build: () => Picker
}

/** The part of the Google Picker this uses, as its script leaves it on the page. */
interface GooglePicker {
  readonly PickerBuilder: new () => PickerBuilder
  readonly DocsView: new () => DocsView
  readonly DocsViewMode: { readonly LIST: string }
  readonly Feature: { readonly MULTISELECT_ENABLED: string }
  readonly Action: { readonly PICKED: string; readonly CANCEL: string }
}

interface GoogleApiLoader {
  readonly load: (name: string, settings: { readonly callback: () => void; readonly onerror: () => void }) => void
}

/** Where Google publishes the loader the Picker comes by; it is not to be bundled or served from elsewhere. */
const LOADER_SCRIPT = "https://apis.google.com/js/api.js"

/** How long Google's scripts are waited on, in milliseconds, as the sign-in's are. */
const LOADED_WITHIN = 20_000

/** The kinds of file a backup can be: a zip, as Drive names one put up from most browsers and from Windows. */
const ZIP_TYPES = "application/zip,application/x-zip-compressed"

export interface GooglePickerConfig {
  /** The OAuth client id of the deployment: the Cloud project's number heads it, and it is that number the files picked are opened to. */
  readonly clientId: string
  /** The deployment's browser key for the Picker, where it has one. */
  readonly apiKey: string | undefined
  /** What the Picker's window is headed with. */
  readonly title: string
}

/**
 * Google's own window for choosing files in a person's Drive. Under the
 * `drive.file` scope the app sees only the files it made; a file chosen
 * here is opened to it as well — a backup put up again by hand, or moved
 * there from elsewhere.
 */
export interface GoogleFilePicker {
  /** The ids of the files the person chose, none where they closed the window. */
  readonly pick: (token: string) => Promise<Result<readonly string[], StoreFailure>>
}

const pickerOnPage = (): GooglePicker | undefined => (globalThis as { readonly google?: { readonly picker?: GooglePicker } }).google?.picker

const loaderOnPage = (): GoogleApiLoader | undefined => (globalThis as { readonly gapi?: GoogleApiLoader }).gapi

const unavailable = (detail: string): StoreFailure => ({ type: "sign-in-unavailable", detail })

const loadScript = (): Promise<Result<GoogleApiLoader, StoreFailure>> =>
  new Promise((settle) => {
    const found = loaderOnPage()
    if (found !== undefined) {
      settle(Ok(found))
      return
    }
    const script = document.createElement("script")
    const given = (result: Result<GoogleApiLoader, StoreFailure>): void => {
      clearTimeout(waiting)
      if (!result.ok) script.remove()
      settle(result)
    }
    const waiting = setTimeout(() => given(Err(unavailable("the Google API loader did not load in time"))), LOADED_WITHIN)
    script.src = LOADER_SCRIPT
    script.async = true
    script.onload = () => {
      const loader = loaderOnPage()
      given(loader === undefined ? Err(unavailable("the Google API loader did not start")) : Ok(loader))
    }
    script.onerror = () => given(Err(unavailable("the Google API loader could not be loaded")))
    document.head.append(script)
  })

const loadPicker = async (): Promise<Result<GooglePicker, StoreFailure>> => {
  const found = pickerOnPage()
  if (found !== undefined) return Ok(found)
  const loader = await loadScript()
  if (!loader.ok) return loader
  return new Promise((settle) => {
    const waiting = setTimeout(() => settle(Err(unavailable("the Google Picker did not load in time"))), LOADED_WITHIN)
    const given = (result: Result<GooglePicker, StoreFailure>): void => {
      clearTimeout(waiting)
      settle(result)
    }
    loader.value.load("picker", {
      callback: () => {
        const picker = pickerOnPage()
        given(picker === undefined ? Err(unavailable("the Google Picker did not start")) : Ok(picker))
      },
      onerror: () => given(Err(unavailable("the Google Picker could not be loaded"))),
    })
  })
}

/** The Cloud project's number an OAuth client id is headed with, as Google makes them: `<number>-<…>.apps.googleusercontent.com`. */
export const projectNumberOf = (clientId: string): string | undefined => /^(\d+)-/.exec(clientId)?.[1]

const idsOf = (answer: PickerAnswer): readonly string[] => (answer.docs ?? []).flatMap((doc) => (typeof doc.id === "string" ? [doc.id] : []))

const shown = (picker: GooglePicker, config: GooglePickerConfig, token: string): Promise<Result<readonly string[], StoreFailure>> =>
  new Promise((settle) => {
    const view = new picker.DocsView().setMimeTypes(ZIP_TYPES).setIncludeFolders(true).setMode(picker.DocsViewMode.LIST)
    const opened: { picker: Picker | undefined } = { picker: undefined }
    const answered = (answer: PickerAnswer): void => {
      if (answer.action !== picker.Action.PICKED && answer.action !== picker.Action.CANCEL) return
      opened.picker?.dispose()
      settle(Ok(answer.action === picker.Action.PICKED ? idsOf(answer) : []))
    }
    const keyed = config.apiKey === undefined || config.apiKey === "" ? new picker.PickerBuilder() : new picker.PickerBuilder().setDeveloperKey(config.apiKey)
    const project = projectNumberOf(config.clientId)
    const builder = (project === undefined ? keyed : keyed.setAppId(project))
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setLocale("ja")
      .setTitle(config.title)
      .setCallback(answered)
    opened.picker = builder.build()
    opened.picker.setVisible(true)
  })

/**
 * The Picker, its scripts loaded the first time it is asked for, never when
 * the app starts, and shown with the token the person signed in with.
 */
export const createGooglePicker = (config: GooglePickerConfig): GoogleFilePicker => {
  const kept: { picker: Promise<Result<GooglePicker, StoreFailure>> | undefined } = { picker: undefined }
  const picker = (): Promise<Result<GooglePicker, StoreFailure>> => {
    const loading =
      kept.picker ??
      loadPicker().then((loaded) => {
        if (!loaded.ok) kept.picker = undefined
        return loaded
      })
    kept.picker = loading
    return loading
  }
  return {
    pick: async (token) => {
      const loaded = await picker()
      return loaded.ok ? shown(loaded.value, config, token) : loaded
    },
  }
}
