-- P-Lens — hledger books for pachinko and pachislot play
-- Copyright (C) 2026  choai contributors, P-Lens contributors
--
-- Free software under the GNU General Public License, version 3 or later, and
-- distributed with no warranty of any kind. The full notice is in LICENSE at
-- the root of this repository, and at <https://www.gnu.org/licenses/>.

{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE JavaScriptFFI #-}

-- | What binds hledger to JavaScript.
--
-- Derived from choai's bindings. hledger does the accounting; this module only
-- makes it reachable from a browser and changes nothing about it. It holds one
-- piece of state, the parsed journal and its price oracle — and a few read
-- lately beside it — because parsing grows with the journal while answering
-- a report from one in memory does not.
--
-- Reports leave in the shape @hledger --output-format=json@ gives them, with
-- what P-Lens never reads of a transaction, a posting or an amount left out
-- ('Lean').
module Main (main) where

import Control.Exception (SomeException, displayException, try)
import Data.Aeson ((.:), (.:?), (.=))
import qualified Data.Aeson as A
import qualified Data.Aeson.Types as A
import Data.IORef (IORef, newIORef, readIORef, writeIORef)
import qualified Data.Map.Strict as M
import Data.MemoUgly (memo)
import Data.Decimal (decimalMantissa, decimalPlaces)
import Data.Text (Text)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import qualified Data.ByteString.Lazy as BL
import qualified Data.ByteString.Unsafe as BU
import Foreign.C.String (CString)
import GHC.Wasm.Prim (JSString (..), fromJSString)
import System.Directory (doesFileExist)
import System.IO.Unsafe (unsafePerformIO)

import Hledger
import Hledger.Data.Json ()

-- | Why a call did not produce an answer, as a tag and its particulars so the
-- caller chooses its own wording.
data Failure
  = NoJournal
  | FileMissing FilePath
  | ReadFailed Text
  | MalformedRequest Text
  | UnknownReport Text
  | Crashed Text

failureJson :: Failure -> A.Value
failureJson failure = case failure of
  NoJournal -> tagged "no-journal" []
  FileMissing path -> tagged "file-missing" ["path" .= path]
  ReadFailed detail -> tagged "read-failed" ["detail" .= detail]
  MalformedRequest detail -> tagged "malformed-request" ["detail" .= detail]
  UnknownReport name -> tagged "unknown-report" ["report" .= name]
  Crashed detail -> tagged "crashed" ["detail" .= detail]
  where
    tagged kind rest = A.object (("kind" .= (kind :: Text)) : rest)

-- | A journal as it is kept between questions: the journal, and the price
-- oracle every report values it with. hledger builds an oracle for each
-- report unless given one, and remembers each price it looks up only in
-- that oracle: kept with the journal, a price looked up for one question is
-- there for every one after, as hledger's own commands that run several
-- reports share one (@multiBalanceReportWith@).
--
-- And it keeps the journal valued at each posting's own day, by the
-- commodity it was valued into, once asked: @--value=then@ values a posting
-- at its date and nothing else, so a report of the journal so valued, asked
-- without a valuation, is the report asked with it — and the multiplying,
-- most of what valuing costs, is done once rather than for every report.
data Kept = Kept
  { keptJournal :: Journal
  , keptOracle :: PriceOracle
  , keptValuedThen :: CommoditySymbol -> Journal
  }

-- | A journal kept: its oracle made once, and its valuation at each
-- posting's day made the first time a commodity is asked for and remembered
-- ('memo', as hledger's oracle remembers its prices). The two other days
-- 'postingApplyValuation' takes are a period's last and today, which a
-- valuation at the posting's day reads neither of.
keep :: Journal -> Kept
keep journal = Kept journal oracle (memo valuedInto)
  where
    oracle = journalPriceOracle (infer_prices_ defreportopts) journal
    styles = journalCommodityStyles journal
    valuedInto commodity = journalMapPostings (\leg -> postingApplyValuation oracle styles (postingDate leg) (postingDate leg) (AtThen (Just commodity)) leg) journal

-- | The journal a request is answered from, and the request as it is asked of
-- it: one valued at each posting's own day is asked of the journal so valued,
-- with no valuation; any other, of the journal as it is.
answeredFrom :: Kept -> Request -> (Journal, Request)
answeredFrom kept request = case reqValuation request of
  Just (AtThen (Just commodity)) -> (keptValuedThen kept commodity, request {reqValuation = Nothing})
  _ -> (keptJournal kept, request)

{-# NOINLINE journalRef #-}
journalRef :: IORef (Maybe Kept)
journalRef = unsafePerformIO (newIORef Nothing)

-- | Journals read lately, each under the key its caller gave it — a digest
-- of its files — newest first, so that going back to a book read a moment
-- ago, or putting back the one a refused trial replaced, is no new parse.
-- Parsing is most of what opening costs, and a book does not change under
-- its key.
{-# NOINLINE keptRef #-}
keptRef :: IORef [(Text, Kept)]
keptRef = unsafePerformIO (newIORef [])

-- | How many journals are kept read at once: a few books and a trial.
keptAtMost :: Int
keptAtMost = 4

-- | A journal kept under its key, made the one questions are asked of, and
-- the oldest let go of past 'keptAtMost'.
keepUnder :: Text -> Kept -> IO ()
keepUnder key kept = do
  writeIORef journalRef (Just kept)
  lately <- readIORef keptRef
  writeIORef keptRef (take keptAtMost ((key, kept) : filter ((/= key) . fst) lately))

foreign export javascript "hledgerLoad" jsLoad :: JSString -> JSString -> IO JSString
foreign export javascript "hledgerSelect" jsSelect :: JSString -> IO JSString
foreign export javascript "hledgerQuery" jsQuery :: JSString -> IO JSString

-- | Parse the journal at this path on the WASI filesystem and keep it, under
-- the key given for it.
jsLoad :: JSString -> JSString -> IO JSString
jsLoad path key = respond (fmap (fmap summarise) (readAndKeep (fromJSString path) (T.pack (fromJSString key))))

-- | Make the journal kept under this key the one questions are asked of,
-- with no parse; no journal where none is kept under it.
jsSelect :: JSString -> IO JSString
jsSelect key = respond $ do
  lately <- readIORef keptRef
  case lookup (T.pack (fromJSString key)) lately of
    Nothing -> pure (Left NoJournal)
    Just kept -> keepUnder (T.pack (fromJSString key)) kept >> pure (Right (summarise (keptJournal kept)))

-- | Read a journal under hledger's strict checks, telling a missing file apart
-- from one that is there and wrong.
--
-- Strict, as @hledger check --strict@: every account and commodity must be
-- declared. A book whose parlors are commodities would otherwise accept a
-- misspelt parlor as a new kind of ball nobody can exchange.
--
-- Existence is checked first because hledger calls @error@ for a missing file,
-- which would reach the caller as a crash.
readAndKeep :: FilePath -> Text -> IO (Either Failure Journal)
readAndKeep path key = do
  present <- doesFileExist (snd (splitReaderPrefix path))
  if not present
    then pure (Left (FileMissing path))
    else do
      result <- runExceptT (readJournalFile definputopts {strict_ = True} path)
      case result of
        Left detail -> pure (Left (ReadFailed (T.pack detail)))
        Right journal -> keepUnder key (keep journal) >> pure (Right journal)

summarise :: Journal -> A.Value
summarise journal =
  A.object
    [ "transactions" .= length (jtxns journal)
    , "accounts" .= journalAccountNames journal
    , "commodities" .= journalCommoditiesUsed journal
    ]

jsQuery :: JSString -> IO JSString
jsQuery raw = respond (runRequest (decodeRequest (fromJSString raw)))

decodeRequest :: String -> Either Failure Request
decodeRequest raw =
  case A.eitherDecodeStrict' (TE.encodeUtf8 (T.pack raw)) >>= A.parseEither parseRequest of
    Left detail -> Left (MalformedRequest (T.pack detail))
    Right request -> Right request

runRequest :: Either Failure Request -> IO (Either Failure A.Value)
runRequest (Left failure) = pure (Left failure)
runRequest (Right request) = do
  loaded <- readIORef journalRef
  case loaded of
    Nothing -> pure (Left NoJournal)
    Just kept -> report kept request

data Request = Request
  { reqKind :: Text
  , reqQuery :: Text
  -- ^ A raw hledger query, passed through so hledger's own parser decides it.
  , reqLimit :: Maybe Int
  , reqOffset :: Int
  , reqValuation :: Maybe ValuationType
  -- ^ hledger's @--value@. Absent means amounts stay in their own commodities.
  , reqPivot :: Maybe Text
  -- ^ hledger's @--pivot@: a tag whose values stand in place of accounts, so a
  -- balance report's rows are the tag's values. Absent means accounts.
  , reqInterval :: Maybe Interval
  -- ^ hledger's report interval (@-D@, @-M@, @-Y@): a balance report then has
  -- a column a period. Absent means one column over the whole query.
  , reqAccumulation :: BalanceAccumulation
  -- ^ hledger's @--historical@: each period's column is the balance at its
  -- end, everything before it counted. Absent means what each period moved.
  , reqTotalsOnly :: Bool
  -- ^ A balance report's totals row alone, its rows left out: for a caller
  -- that reads each period's total and nothing by account.
  }

parseRequest :: A.Value -> A.Parser Request
parseRequest = A.withObject "request" $ \o ->
  Request
    <$> o .: "kind"
    <*> (maybe "" id <$> o .:? "query")
    <*> o .:? "limit"
    <*> (maybe 0 id <$> o .:? "offset")
    <*> (o .:? "valuation" >>= traverse parseValuation)
    <*> o .:? "pivot"
    <*> (o .:? "interval" >>= traverse parseInterval)
    <*> (maybe PerPeriod id <$> (o .:? "accumulation" >>= traverse parseAccumulation))
    <*> (maybe False id <$> o .:? "totalsOnly")

-- | @--historical@, the one accumulation P-Lens reads balances by.
parseAccumulation :: Text -> A.Parser BalanceAccumulation
parseAccumulation written = case written of
  "historical" -> pure Historical
  other -> fail ("unknown accumulation: " <> T.unpack other)

-- | @-D@, @-M@ or @-Y@, the three periods P-Lens reads results by.
parseInterval :: Text -> A.Parser Interval
parseInterval written = case written of
  "daily" -> pure (Days 1)
  "monthly" -> pure (Months 1)
  "yearly" -> pure (Years 1)
  other -> fail ("unknown interval: " <> T.unpack other)

-- | @--value=then,C@ or @--value=end,C@, the two valuations P-Lens keeps apart.
--
-- The commodity is required: valuing into "whatever hledger picks" would let
-- a book with two currencies come back in either, unannounced.
parseValuation :: A.Value -> A.Parser ValuationType
parseValuation = A.withObject "valuation" $ \o -> do
  moment <- o .: "at"
  commodity <- o .: "commodity"
  case (moment :: Text) of
    "posting-date" -> pure (AtThen (Just commodity))
    "period-end" -> pure (AtEnd (Just commodity))
    other -> fail ("unknown valuation: " <> T.unpack other)

-- | Run the report a request names.
--
-- Balance reports are flat: P-Lens reads rows by account name, and a parent
-- row standing beside its children would be counted twice by anyone summing.
report :: Kept -> Request -> IO (Either Failure A.Value)
report kept request = case reqKind request of
  "entries" -> withSpec [] (\spec -> page request (map transactionJson (entriesReport spec journal)))
  "heads" -> withSpec [] (\spec -> page request (map headJson (entriesReport spec journal)))
  "balance" -> balanceOf []
  "incomestatement" -> balanceOf ["type:RX"]
  "revaluation" -> revaluation kept request
  "prices" -> withSpec [] (\spec -> A.toJSON (map priceJson (filter (matchesPriceDirective (_rsQuery spec)) (jpricedirectives journal))))
  "accounts" -> pure (Right (declaredAccounts journal))
  other -> pure (Left (UnknownReport other))
  where
    journal = keptJournal kept
    withSpec extra render = fmap (fmap render) (specFor request extra id)
    balanceOf extra = let (valued, asked) = answeredFrom kept request in fmap (fmap (balanceOver asked valued (keptOracle kept))) (specFor asked extra id)

-- | A balance report over the journal, grouped by a tag's values where the
-- request pivots.
--
-- @--pivot@ puts a tag's value where each posting's account was, so nothing
-- that asks about accounts can be asked afterwards: which postings are an
-- income statement's, or the theoretical value's, is a question of accounts.
-- So the query picks its postings from the journal as it is, the tag's values
-- are then put in place of the accounts of those alone, and the report is
-- made over them with what is left of the query to ask — its dates, which
-- say the period. The grouping and every sum are hledger's.
balanceOver :: Request -> Journal -> PriceOracle -> ReportSpec -> A.Value
balanceOver request journal oracle spec = case reqPivot request of
  Nothing -> reportJson (reqTotalsOnly request) (multiBalanceReportWith spec journal oracle)
  Just tag ->
    reportJson
      (reqTotalsOnly request)
      ( multiBalanceReportWith
          spec {_rsQuery = filterQuery queryIsDateOrDate2 (_rsQuery spec)}
          (journalPivot tag (filterJournalPostings (_rsQuery spec) journal))
          oracle
      )

-- | What the accounts of a query gained or lost in a commodity by prices
-- changing under what they held, and by nothing else: 評価損益.
--
-- hledger has the two figures and no report of their difference. How far an
-- account's value moved over the period, at the price at its end, is
-- @--valuechange --value=end@; what was posted to it, each posting at the
-- price of its own day, is @--value=then@. A price changing moves the first
-- and not the second, so the first less the second is what the prices did.
-- @--gain@ would be hledger's own word for it, but it sets value against a
-- posting's cost, and what P-Lens asks this of — savings — is posted with
-- none. Both reports are hledger's, and so is the arithmetic between them
-- ('maMinus'): no sum is made outside it.
revaluation :: Kept -> Request -> IO (Either Failure A.Value)
revaluation kept request = case reqValuation request of
  Just (AtEnd (Just commodity)) -> do
    moved <- specFor request {reqValuation = Just (AtEnd (Just commodity))} [] (\options -> options {balancecalc_ = CalcValueChange})
    let (valued, asked) = answeredFrom kept request {reqValuation = Just (AtThen (Just commodity))}
    posted <- specFor asked [] id
    pure (reportJson False <$> (lessPosted <$> (reportOf (keptJournal kept) <$> moved) <*> (reportOf valued <$> posted)))
  _ -> pure (Left (MalformedRequest "a revaluation is asked with a valuation at the period's end"))
  where
    reportOf journal spec = multiBalanceReportWith spec journal (keptOracle kept)

-- | A report less another, account by account and period by period: each
-- row of the first less the row of the same account in the second, a row
-- only the second has turned over, and the totals likewise.
lessPosted :: MultiBalanceReport -> MultiBalanceReport -> MultiBalanceReport
lessPosted moved posted =
  moved
    { prRows = map lessItsOwn (prRows moved) <> map turnedOver (filter (not . inMoved) (prRows posted))
    , prTotals = less (prTotals moved) (prTotals posted)
    }
  where
    postedBy = M.fromList [(prrFullName row, row) | row <- prRows posted]
    movedNames = M.fromList [(prrFullName row, ()) | row <- prRows moved]
    inMoved row = M.member (prrFullName row) movedNames
    lessItsOwn row = maybe row (less row) (M.lookup (prrFullName row) postedBy)
    turnedOver = fmap maNegate

-- | A row less another of the same periods; a period only one of them has is
-- taken as that one's alone.
less :: PeriodicReportRow a MixedAmount -> PeriodicReportRow a MixedAmount -> PeriodicReportRow a MixedAmount
less row other =
  row
    { prrAmounts = across (prrAmounts row) (prrAmounts other)
    , prrTotal = prrTotal row `maMinus` prrTotal other
    , prrAverage = prrAverage row `maMinus` prrAverage other
    }
  where
    across (a : as) (b : bs) = (a `maMinus` b) : across as bs
    across as [] = as
    across [] bs = map maNegate bs

-- | Every account declared with an @account@ directive, in the order written,
-- with the tags written on its declaration.
--
-- The tags are how a book says which parlor an account belongs to without the
-- app keeping a second list of parlors beside the journal.
declaredAccounts :: Journal -> A.Value
declaredAccounts journal =
  A.toJSON
    [ A.object ["name" .= name, "tags" .= M.findWithDefault [] name (jdeclaredaccounttags journal)]
    | (name, _) <- jdeclaredaccounts journal
    ]

specFor :: Request -> [Text] -> (ReportOpts -> ReportOpts) -> IO (Either Failure ReportSpec)
specFor request extra calculating = do
  today <- getCurrentDay
  pure $ case reportOptsToSpec today (calculating options) of
    Left detail -> Left (MalformedRequest (T.pack detail))
    Right spec -> Right spec
  where
    options =
      defreportopts
        { querystring_ = extra <> words'' queryprefixes (reqQuery request)
        , accountlistmode_ = ALFlat
        , value_ = reqValuation request
        , interval_ = maybe NoInterval id (reqInterval request)
        , balanceaccum_ = reqAccumulation request
        }

-- | A window of a report, newest first, with how many rows there were in all.
page :: A.ToJSON a => Request -> [a] -> A.Value
page request rows =
  A.object
    [ "total" .= length rows
    , "offset" .= reqOffset request
    , "items" .= window (reverse rows)
    ]
  where
    window = maybe id take (reqLimit request) . drop (reqOffset request)

-- | Put a result in an envelope the host can branch on. Exceptions are caught
-- here so an unsupported WASI operation does not abort the instance.
respond :: IO (Either Failure A.Value) -> IO JSString
respond act = do
  result <- try act
  encode (either (Left . crashed) id result)
  where
    crashed e = Crashed (T.pack (displayException (e :: SomeException)))

-- | An answer as JavaScript's string: aeson's UTF-8 bytes read straight out
-- of the module's memory by the host's decoder. Going by a Haskell 'String'
-- instead walks a list a character long, and a few years of a book is
-- megabytes of characters.
encode :: Either Failure A.Value -> IO JSString
encode outcome = BU.unsafeUseAsCStringLen (BL.toStrict (A.encode envelope)) (uncurry utf8String)
  where
    envelope = case outcome of
      Right answer -> A.object ["ok" .= True, "data" .= answer]
      Left failure -> A.object ["ok" .= False, "error" .= failureJson failure]

foreign import javascript unsafe "(new TextDecoder('utf-8')).decode(new Uint8Array(__exports.memory.buffer, $1, $2))"
  utf8String :: CString -> Int -> IO JSString

-- | A sum as P-Lens reads it: each commodity's amount, its commodity and
-- its quantity, and nothing beside. hledger's own JSON carries a display
-- style and a cost with every amount, and works each quantity out again as
-- a floating point number nobody here reads: a few years of a book come to
-- megabytes of it a question, and most of the time spent answering.
newtype Lean = Lean MixedAmount

instance A.ToJSON Lean where
  toJSON (Lean total) = A.toJSON (map amountJson (amountsRaw total))

-- | An amount's commodity and its quantity as hledger's Decimal is written:
-- its mantissa and its places, never a float.
amountJson :: Amount -> A.Value
amountJson amount =
  A.object
    [ "acommodity" .= acommodity amount
    , "aquantity" .= A.object ["decimalMantissa" .= decimalMantissa (aquantity amount), "decimalPlaces" .= decimalPlaces (aquantity amount)]
    ]

-- | A balance report as P-Lens reads it: its periods, each row's account,
-- amount a period and total, and the totals row the same — or the totals
-- row alone, where only it was asked for. A row's average, which nothing
-- here reads, is left out, and is never worked out.
reportJson :: Bool -> MultiBalanceReport -> A.Value
reportJson totalsOnly balances =
  A.object
    [ "prDates" .= prDates balances
    , "prRows" .= if totalsOnly then [] else map rowJson (prRows balances)
    , "prTotals" .= totalsJson (prTotals balances)
    ]
  where
    rowJson row = A.object ["prrName" .= displayFull (prrName row), "prrAmounts" .= map Lean (prrAmounts row), "prrTotal" .= Lean (prrTotal row)]
    totalsJson row = A.object ["prrName" .= ([] :: [Text]), "prrAmounts" .= map Lean (prrAmounts row), "prrTotal" .= Lean (prrTotal row)]

-- | A transaction's head: its date and its tags, and nothing of its postings,
-- for a caller that only counts entries and their days.
headJson :: Transaction -> A.Value
headJson entry = A.object ["tdate" .= tdate entry, "ttags" .= ttags entry]

-- | A transaction as P-Lens reads it: its date, description, tags and postings.
transactionJson :: Transaction -> A.Value
transactionJson entry =
  A.object
    [ "tdate" .= tdate entry
    , "tdescription" .= tdescription entry
    , "ttags" .= ttags entry
    , "tpostings" .= map postingJson (tpostings entry)
    ]

-- | A posting as P-Lens reads it: its account, amount, whether it is real, and tags.
postingJson :: Posting -> A.Value
postingJson leg =
  A.object
    [ "paccount" .= paccount leg
    , "pamount" .= Lean (pamount leg)
    , "preal" .= preal leg
    , "ptags" .= ptags leg
    ]

-- | A price directive as P-Lens reads it: its day, the commodity priced, and the price.
priceJson :: PriceDirective -> A.Value
priceJson directive =
  A.object
    [ "pddate" .= pddate directive
    , "pdcommodity" .= pdcommodity directive
    , "pdamount" .= amountJson (pdamount directive)
    ]

main :: IO ()
main = pure ()
