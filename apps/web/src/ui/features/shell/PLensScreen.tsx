import { useLocation, useSearchParams } from "@solidjs/router"
import { createMemo, createResource, onMount, Show, untrack, type JSX } from "solid-js"
import { createArrangement, GatheringShell, MainContent, TopBar } from "solid-gathering-shell"

import type { Outcome } from "../../../application/errors"
import { destinationsOf } from "../../../application/sending"
import type { ListedBook } from "../../../core/book/book"
import type { Destination } from "../../../sync/port/destination-store"
import { useApp } from "../../context"
import { bookOf, focusOf, inConsolidation, inHuddleRoom, inOddPrizeCalculator, inSettings, placeOf, screenOf, type Place } from "../../navigation/place"
import { EmptyState } from "../../primitives/states"
import { ActivityView } from "../activity/ActivityView"
import { CabinetView } from "../live/CabinetView"
import { DestinationSide } from "../live/DestinationSide"
import { HoldingsView } from "../holdings/HoldingsView"
import { ParlorPassbookPanel } from "../holdings/ParlorPassbookPanel"
import { PassbookPanel } from "../holdings/PassbookPanel"
import { FinishPlayView } from "../live/FinishPlayView"
import { HuddlePlayView } from "../huddle/HuddlePlayView"
import { HuddleSettlementView } from "../huddle/HuddleSettlementView"
import { HuddleSide } from "../huddle/HuddleSide"
import { HuddleTotalView } from "../huddle/HuddleTotalView"
import { HuddleRunner } from "../huddle/HuddleRunner"
import { LivePlayView } from "../live/LivePlayView"
import { LiveSide } from "../live/LiveSide"
import { PlayLineRunner } from "../live/PlayLineRunner"
import * as PachinkoViews from "../pachinko"
import { FileDetail, FilesView } from "../files/FilesView"
import { StartFormProvider } from "../live/start-form"
import { StartPlayView } from "../live/StartPlayView"
import { SubmissionReturnView } from "../live/SubmissionReturnView"
import { DocumentView } from "../documents/DocumentView"
import { NotFound } from "../not-found/NotFound"
import { OddPrizeCalculatorSide } from "../odd-prize-calculator/OddPrizeCalculatorSide"
import { WelcomeProvider } from "../onboarding/welcome"
import { useSampleBook } from "../../../sample-book"
import * as PachislotViews from "../pachislot"
import { TallyDetail } from "../tallies/TallyDetail"
import { TalliesView } from "../tallies/TalliesView"
import { ReviseTallyView } from "../record-tally/ReviseTallyView"
import { AddTallyView } from "../record-tally/AddTallyView"
import { DayEntryView, ResultCalendarView } from "../result-calendar"
import { AppearanceSettings } from "../settings/AppearanceSettings"
import { BackupSettings } from "../settings/BackupSettings"
import { BreakdownView } from "../breakdown/BreakdownView"
import { ConsolidatedBreakdownView } from "../consolidated/ConsolidatedBreakdownView"
import { ConsolidatedHoldingsView } from "../consolidated/ConsolidatedHoldingsView"
import { ConsolidatedResultCalendarView } from "../consolidated/ConsolidatedResultCalendarView"
import { ConsolidatedSide } from "../consolidated/ConsolidatedSide"
import { ClearDataSettings } from "../settings/ClearDataSettings"
import { ConsolidationSettings } from "../settings/ConsolidationSettings"
import { ExportSettings } from "../settings/ExportSettings"
import { ImportSettings } from "../settings/ImportSettings"
import { BooksSettings } from "../settings/BooksSettings"
import { BusinessDaySettings } from "../settings/BusinessDaySettings"
import { LicensesView } from "../settings/LicensesView"
import { UnderTheHoodView } from "../settings/UnderTheHoodView"
import { SharingSettings } from "../settings/SharingSettings"
import { SyncSettings } from "../settings/SyncSettings"
import { AboutButton } from "./AboutButton"
import { MummingMark } from "../mummer/MummingMark"
import { MummerSettings } from "../mummer/MummerSettings"
import { BackupNotice } from "./BackupNotice"
import { BookSpaceSide } from "./BookSpaceSide"
import { SettingsSide } from "./SettingsSide"
import { StoppedNotice } from "../consolidated/StoppedNotice"
import { SpacesRail } from "./SpacesRail"
import { ToastRegion } from "../../primitives/toast"
import { ViewHeader } from "./ViewHeader"
import { RefreshButton } from "./RefreshButton"
import { UpdateNotice } from "./UpdateNotice"
import { ODD_PRIZE_CALCULATOR_LABEL } from "../../wording/odd-prize-calculator"
import { bookTitle } from "../../wording/book"

/** Below this width the panes are shown one at a time. */
const NARROW_BELOW = 768


/** What the main pane shows for a place that is not itself a screen of its own. */
function ChooseFromList(props: { readonly place: Place; readonly title: string; readonly hint: string }): JSX.Element {
  return (
    <MainContent header={<ViewHeader place={props.place} title={props.title} />}>
      <div class="max-w-5xl">
        <EmptyState title={props.hint} />
      </div>
    </MainContent>
  )
}

/**
 * The main pane for a place. Called once per screen (`screenOf`); the
 * query, and what the place is narrowed to, are read through accessors so
 * either refreshes the view without rebuilding it.
 */
/**
 * The place a view drawn for one is at now: the same screen, narrowed as
 * the address now says — read where it is used, so the view follows a
 * narrowing without being drawn again.
 */
const liveAs = <P extends Place>(live: () => Place, drawnFor: P): P => ((now) => (now.kind === drawnFor.kind ? (now as P) : drawnFor))(live())

const mainFor = (place: Place, query: () => string, live: () => Place): JSX.Element => {
  switch (place.kind) {
    case "live":
      return <ChooseFromList place={place} title="ライブ計測" hint="本日の稼働を選ぶか、新しく始めてください。" />
    case "live-new":
      return <StartPlayView place={place} game={place.game} />
    case "live-play":
      return <LivePlayView place={place} playId={place.playId} />
    case "live-record":
      return <FinishPlayView place={place} playId={place.playId} />
    case "live-cabinet":
      return <CabinetView place={place} playId={place.playId} />
    case "huddle":
      return <ChooseFromList place={place} title="ノリ打ち" hint="左のリストから稼働を選ぶか、メンバー合算を開いてください。" />
    case "huddle-total":
      return <HuddleTotalView place={place} />
    case "huddle-settlement":
      return <HuddleSettlementView place={place} />
    case "huddle-play":
      return <HuddlePlayView place={place} member={place.member} playId={place.playId} />
    case "book":
      return <ChooseFromList place={place} title="帳簿" hint="左のリストからビューを選んでください。" />
    case "book-view":
      return bookViewFor(place, query, live)
    case "book-breakdown":
      return <BreakdownView place={place} bookId={place.bookId} by={place.by} query={query()} />
    case "tally":
      return <TalliesView place={place} bookId={place.bookId} query={query()} />
    case "tally-new":
      return <AddTallyView place={place} bookId={place.bookId} />
    case "tally-days":
      return <DayEntryView place={place} bookId={place.bookId} />
    case "tally-revise":
      return <ReviseTallyView place={place} bookId={place.bookId} playId={place.playId} />
    case "book-file":
      return <FilesView place={place} bookId={place.bookId} />
    case "passbook":
    case "parlor-passbook":
      return <HoldingsView place={place} bookId={place.bookId} parlors={undefined} query={query()} />
    case "pachinko-machine-search":
      return <PachinkoViews.MachineSearchView place={place} query={query()} />
    case "parlor-submitted":
      return <SubmissionReturnView place={place} />
    case "pachinko-machine":
      return <PachinkoViews.MachineView place={place} machineId={place.machineId} />
    case "pachinko-formula":
    case "pachinko-formula-value":
      return (
        <PachinkoViews.FormulaView
          place={{ kind: "pachinko-formula", machineId: place.machineId, formulaId: place.formulaId }}
          machineId={place.machineId}
          formulaId={place.formulaId}
          valueShown={live().kind === "pachinko-formula-value"}
        />
      )
    case "pachinko-machine-value":
      return <PachinkoViews.MachineValueView place={place} machineId={place.machineId} />
    case "pachinko-formula-grounds":
      return <PachinkoViews.GroundsView place={place} machineId={place.machineId} formulaId={place.formulaId} />
    case "pachinko-formula-basis":
      return <PachinkoViews.BasisView place={place} machineId={place.machineId} formulaId={place.formulaId} />
    case "pachinko-formula-new":
      return <PachinkoViews.FormulaEditorView place={place} />
    case "pachislot-machine-search":
      return <PachislotViews.MachineSearchView place={place} query={query()} />
    case "pachislot-machine":
      return <PachislotViews.MachineView place={place} machineId={place.machineId} />
    case "pachislot-formula":
    case "pachislot-formula-value":
      return (
        <PachislotViews.FormulaView
          place={{ kind: "pachislot-formula", machineId: place.machineId, formulaId: place.formulaId }}
          machineId={place.machineId}
          formulaId={place.formulaId}
          valueShown={live().kind === "pachislot-formula-value"}
        />
      )
    case "pachislot-machine-value":
      return <PachislotViews.MachineValueView place={place} machineId={place.machineId} />
    case "pachislot-formula-grounds":
      return <PachislotViews.GroundsView place={place} machineId={place.machineId} formulaId={place.formulaId} />
    case "pachislot-formula-basis":
      return <PachislotViews.BasisView place={place} machineId={place.machineId} formulaId={place.formulaId} />
    case "pachislot-formula-new":
      return <PachislotViews.FormulaEditorView place={place} />
    case "pachislot-distribution-new":
      return <PachislotViews.SettingDistributionEditorView place={place} machineId={place.machineId} />
    case "destination":
      return <ChooseFromList place={place} title="稼働の送り先" hint="左のリストから、本日の稼働を送れます。" />
    case "consolidated":
      return <ChooseFromList place={place} title="連結" hint="左のリストからビューを選んでください。" />
    case "consolidated-holdings":
      return <ConsolidatedHoldingsView place={liveAs(live, place)} bookIds={liveAs(live, place).bookIds} query={query()} />
    case "consolidated-result-calendar":
      return <ConsolidatedResultCalendarView place={liveAs(live, place)} bookIds={liveAs(live, place).bookIds} />
    case "consolidated-breakdown":
      return <ConsolidatedBreakdownView place={liveAs(live, place)} by={place.by} bookIds={liveAs(live, place).bookIds} query={query()} />
    case "odd-prize-calculator":
      return <ChooseFromList place={place} title={ODD_PRIZE_CALCULATOR_LABEL} hint="左のリストからパチンコかスロットを選んでください。" />
    case "odd-prize-calculator-game":
      return place.game === "pachinko" ? <PachinkoViews.OddPrizeCalculator place={place} /> : <PachislotViews.OddPrizeCalculator place={place} />
    case "settings":
      return <ChooseFromList place={place} title="設定" hint="左のリストから項目を選んでください。" />
    case "settings-section":
      return settingsFor(place)
    case "document":
      return <DocumentView place={place} document={place.document} />
    case "not-found":
      return <NotFound place={place} path={place.path} />
  }
}

const settingsFor = (place: Extract<Place, { kind: "settings-section" }>): JSX.Element => {
  switch (place.section) {
    case "appearance":
      return <AppearanceSettings place={place} />
    case "mummer":
      return <MummerSettings place={place} />
    case "business-day":
      return <BusinessDaySettings place={place} />
    case "sync":
      return <SyncSettings place={place} />
    case "sharing":
      return <SharingSettings place={place} />
    case "backup":
      return <BackupSettings place={place} />
    case "export":
      return <ExportSettings place={place} />
    case "import":
      return <ImportSettings place={place} />
    case "books":
      return <BooksSettings place={place} />
    case "consolidation":
      return <ConsolidationSettings place={place} />
    case "clear-data":
      return <ClearDataSettings place={place} />
    case "licenses":
      return <LicensesView place={place} />
    case "under-the-hood":
      return <UnderTheHoodView place={place} />
  }
}

const bookViewFor = (place: Extract<Place, { kind: "book-view" }>, query: () => string, live: () => Place): JSX.Element => {
  switch (place.view) {
    case "holdings":
      return <HoldingsView place={liveAs(live, place)} bookId={place.bookId} parlors={liveAs(live, place).parlors} query={query()} />
    case "tallies":
      return <TalliesView place={place} bookId={place.bookId} query={query()} />
    case "result-calendar":
      return <ResultCalendarView place={liveAs(live, place)} bookId={place.bookId} senders={liveAs(live, place).senders} />
    case "activity":
      return <ActivityView place={place} bookId={place.bookId} />
    case "files":
      return <FilesView place={place} bookId={place.bookId} />
  }
}

/** The side panel for a place: the live space's plays, the huddle's room, a book's views, the plays to send to a book that is only sent to, the odd-prize calculator's games, or settings. */
const sideFor = (place: Place, books: Outcome<readonly ListedBook[]> | undefined, destinations: Outcome<readonly Destination[]> | undefined): JSX.Element => {
  if (inSettings(place)) return <SettingsSide place={place} />
  if (inOddPrizeCalculator(place)) return <OddPrizeCalculatorSide place={place} />
  if (place.kind === "destination") return <DestinationSide lineId={place.lineId} destinations={destinations} />
  if (inConsolidation(place)) return <ConsolidatedSide place={place} />
  if (inHuddleRoom(place)) return <HuddleSide place={place} />
  const bookId = bookOf(place)
  if (bookId === undefined) return <LiveSide place={place} />
  const book = books?.ok === true ? books.value.find((candidate) => candidate.id === bookId) : undefined
  return <BookSpaceSide place={place} bookId={bookId} book={book} />
}

/** The detail pane: a tally's, a pool's or a parlor's passbook, or a file's text. */
const auxFor = (place: Place, query: () => string): JSX.Element | undefined => {
  if (place.kind === "tally") return <TallyDetail place={place} bookId={place.bookId} playId={place.playId} query={query()} />
  if (place.kind === "passbook") return <PassbookPanel place={place} bookId={place.bookId} account={place.account} />
  if (place.kind === "parlor-passbook") return <ParlorPassbookPanel place={place} bookId={place.bookId} parlorName={place.parlorName} />
  return place.kind === "book-file" ? <FileDetail place={place} bookId={place.bookId} path={place.path} /> : undefined
}

/** Whether a place lays a formula's 期待値算出 over the screen, or is the way in to one from outside. */
const valueSheetShown = (place: Place): boolean =>
  place.kind === "pachinko-formula-value" || place.kind === "pachinko-machine-value" || place.kind === "pachislot-formula-value" || place.kind === "pachislot-machine-value"

/**
 * The whole screen, read off the address: which place, which hledger query,
 * and from those which panes show what. The books are asked for once here,
 * since the rail and a book's side panel both name them, and the books that
 * are only sent to likewise. Making a sample book is held here too, since
 * both the rail and the welcome open it. Once past `/`, the tab is called
 * by the app's name alone: the page's title is for the way in a search finds.
 */
export function PLensScreen(): JSX.Element {
  const location = useLocation()
  const [search] = useSearchParams<{ q?: string }>()
  const arrangement = createArrangement({ narrowBelow: NARROW_BELOW })
  const place = createMemo(() => placeOf(location.pathname))
  const query = (): string => search.q ?? ""
  const app = useApp()
  const [books] = createResource(() => app.revision(), () => app.services.session.books())
  const [destinations] = createResource(() => app.revision(), () => destinationsOf(app.services.destinations))
  onMount(() => {
    document.title = app.services.screenTitle
  })
  const sampleBook = useSampleBook(() => ((listed) => (listed?.ok === true ? listed.value.map(bookTitle) : []))(books()))

  return (
    <StartFormProvider>
      <WelcomeProvider onSample={sampleBook.open} held={valueSheetShown(place())}>
        <GatheringShell
          arrangement={arrangement()}
          focus={focusOf(place())}
          topBar={
            <TopBar
              title={app.services.name}
              leading={<MummingMark />}
              trailing={
                <div class="flex items-center gap-1">
                  <BackupNotice />
                  <UpdateNotice />
                  <RefreshButton />
                  <AboutButton />
                </div>
              }
            />
          }
          rail={<SpacesRail place={place()} books={books()} destinations={destinations()} sampleBook={sampleBook.item()} />}
          side={sideFor(place(), books(), destinations())}
          aux={auxFor(place(), query)}
        >
          <Show when={screenOf(place())} keyed>
            {(_screen) => mainFor(untrack(place), query, place)}
          </Show>
        </GatheringShell>
        {sampleBook.view()}
      </WelcomeProvider>
      <ToastRegion />
      <StoppedNotice />
      <HuddleRunner place={place()} />
      <PlayLineRunner place={place()} />
    </StartFormProvider>
  )
}
