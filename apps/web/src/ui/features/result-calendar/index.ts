/**
 * The result calendar (収支カレンダー): a month of a book, each day with what
 * its plays made. It is a guest in this app, kept whole in this folder so
 * that it can be taken out again in one go. Nothing here is imported by
 * anything but the lines that put it on screen — a book's:
 *
 * - `"result-calendar"` among `BOOK_VIEWS` in `ui/navigation/place.ts`;
 * - its case in `bookViewFor`, in `ui/features/shell/PLensScreen.tsx`;
 * - its line in `VIEWS`, in `ui/features/shell/BookSpaceSide.tsx`;
 *
 * and several books' together, which is this calendar given their results
 * added (`ui/features/consolidated/ConsolidatedResultCalendarView.tsx`,
 * with its place, its case in `PLensScreen` and its line in
 * `ConsolidatedSide`).
 *
 * Taking it out is deleting this folder, `tests/ui/result-calendar`, those
 * lines and its section of `ARCHITECTURE.md`. It asks hledger nothing
 * of its own: its figures are the breakdown's, by day and by month —
 * how much of the month's theoretical value was inferred among them — and
 * whether the book keeps theoretical values is asked as the breakdown asks.
 */
export { ResultCalendarIcon } from "./icons"
export { monthQuery } from "./month"
export { ResultCalendar } from "./ResultCalendar"
export { ResultCalendarView } from "./ResultCalendarView"
export { RESULT_CALENDAR } from "./wording"
