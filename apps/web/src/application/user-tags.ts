import { SOURCE_TAGS } from "../core/tally/source-tags"
import { mapOk } from "../core/result/result"
import { TALLY_TAGS } from "../core/tally/tally"
import { userTagsByUse } from "../core/tally/user-tags"
import { tallyHeadsRequest } from "../hledger/query/requests"
import { combine, taggedWithAnyTerm } from "../hledger/query/terms"
import type { JournalAccess } from "../hledger/client/client"
import type { Outcome } from "./errors"
import { fromHledger } from "./lift"
import type { BookId } from "../core/book/book"
import type { BookSession } from "./book-session"

/** The tags whose words a person tags tallies with: their own, and those another app's labels were taken in as, counted as one. */
export const USER_TAG_NAMES: readonly string[] = [TALLY_TAGS.userTag, SOURCE_TAGS.label]

/** The words a book's tallies of a query — all of them where none is given — are tagged with, those used most first: asked of hledger once, of the tallies tagged at all. */
export const askUserTags = async (journal: JournalAccess, query = ""): Promise<Outcome<readonly string[]>> =>
  mapOk(fromHledger(await journal.ask(tallyHeadsRequest(combine(query, taggedWithAnyTerm(USER_TAG_NAMES))))), (page) => userTagsByUse(page.items.map((head) => head.ttags), USER_TAG_NAMES))

/** The words a book's tallies of a query are tagged with, those used most first: what its breakdown can be narrowed to by tag. */
export const loadUserTags = (session: BookSession, bookId: BookId, query: string): Promise<Outcome<readonly string[]>> => session.read(bookId, (journal) => askUserTags(journal, query))
