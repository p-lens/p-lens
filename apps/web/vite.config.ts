import { readdirSync, readFileSync } from "node:fs"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import solid from "vite-plugin-solid"

import { DEPLOYMENT } from "./src/branding/deployment"

/**
 * How large a file the service worker will keep for offline use. The hledger
 * engine is one ~7 MB file; Workbox skips anything over 2 MiB by default,
 * which would leave the app unable to work offline with nothing to say why.
 */
const LARGEST_PRECACHED_FILE = 16 * 1024 * 1024

/**
 * The card a link to the app is shown as where it is shared: read by
 * whoever draws the link, never by the app, so it is left out of the
 * precache.
 */
const SHARING_CARD = "og.png"

/**
 * The pachinko engine — its worker, its glue and its wasm — is not part of
 * starting the app. It is left out of the precache and kept the first time
 * a pachinko formula or play needs it, so it works offline from then on
 * without being downloaded by everyone who never needs it. The service
 * worker claims the page that installed it (`clientsClaim`), so a first visit
 * that needs it caches it too. The pattern is written inside the function
 * because Workbox copies the function's text into the service worker, where
 * nothing from this file exists.
 */
const PACHINKO_ASSETS = "**/pachinko*"

/**
 * The reasoner — its worker and Trealla Prolog with its wasm, over a
 * megabyte — is kept the same way: left out of the precache, and cached the
 * first time a formula's grounds are opened.
 */
const REASONER_ASSETS = ["**/reasoner*", "**/trealla*"]

/**
 * The pachislot engine is kept the same way: left out of the precache, and
 * cached the first time a pachislot formula or play needs it.
 */
const PACHISLOT_ASSETS = "**/pachislot*"

/**
 * The app's version, as its package says it: what a person reads in the
 * app is what was built, never a number typed a second time.
 */
const VERSION = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { readonly version: string }).version

/**
 * The deployment's own files that are served at the site's root as they
 * are: its icons and the card a link to it is shown as. They are kept with
 * the rest of what is the deployment's, in `src/branding/served/`, and not
 * among the app's public files, so a fork replaces one folder.
 */
const SERVED = fileURLToPath(new URL("./src/branding/served/", import.meta.url))

const SERVED_TYPES: Readonly<Record<string, string>> = { ".png": "image/png", ".ico": "image/x-icon" }

/**
 * Serves the deployment's files at the root while the app is developed,
 * puts them at the root of what is built, and writes the deployment's name,
 * what it says of itself and its address into the page where the page
 * names them.
 */
const branding = (): Plugin => ({
  name: "p-lens-branding",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const name = decodeURIComponent((request.url ?? "").split("?")[0] ?? "").slice(1)
      if (!readdirSync(SERVED).includes(name)) {
        next()
        return
      }
      response.setHeader("Content-Type", SERVED_TYPES[extname(name)] ?? "application/octet-stream")
      response.end(readFileSync(join(SERVED, name)))
    })
  },
  generateBundle() {
    readdirSync(SERVED).forEach((name) => this.emitFile({ type: "asset", fileName: name, source: readFileSync(join(SERVED, name)) }))
  },
  transformIndexHtml: (html) =>
    html
      .replaceAll("%DEPLOYMENT_NAME_IN_JAPANESE%", DEPLOYMENT.nameInJapanese)
      .replaceAll("%DEPLOYMENT_NAME%", DEPLOYMENT.name)
      .replaceAll("%DEPLOYMENT_DESCRIPTION%", DEPLOYMENT.description)
      .replaceAll("%DEPLOYMENT_TAGLINE%", DEPLOYMENT.tagline)
      .replaceAll("%DEPLOYMENT_ADDRESS%", DEPLOYMENT.address),
})

export default defineConfig({
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(VERSION) },
  server: { port: 8136, strictPort: true },
  preview: { port: 8136, strictPort: true },
  plugins: [
    solid(),
    tailwindcss(),
    branding(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: DEPLOYMENT.nameInJapanese,
        short_name: DEPLOYMENT.nameInJapanese,
        description: DEPLOYMENT.description,
        lang: "ja",
        theme_color: "#102075",
        background_color: "#313338",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: LARGEST_PRECACHED_FILE,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,webmanifest}"],
        globIgnores: [PACHINKO_ASSETS, ...REASONER_ASSETS, PACHISLOT_ASSETS, SHARING_CARD],
        runtimeCaching: [
          { urlPattern: ({ url }) => /\/assets\/pachinko[^/]*$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "pachinko" } },
          { urlPattern: ({ url }) => /\/assets\/(reasoner|trealla)[^/]*$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "reasoner" } },
          { urlPattern: ({ url }) => /\/assets\/pachislot[^/]*$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "pachislot" } },
        ],
        navigateFallback: "/index.html",
        clientsClaim: true,
      },
    }),
  ],
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@p-lens/pachinko-engine", "@p-lens/pachislot-engine"] },
})
