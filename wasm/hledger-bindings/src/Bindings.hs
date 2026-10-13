-- P-Lens — hledger books for pachinko and pachislot play
-- Copyright (C) 2026  choai contributors, P-Lens contributors
--
-- Free software under the GNU General Public License, version 3 or later, and
-- distributed with no warranty of any kind. The full notice is in LICENSE at
-- the root of this repository, and at <https://www.gnu.org/licenses/>.

{-# LANGUAGE OverloadedStrings #-}

-- | What binds hledger to JavaScript.
--
-- Derived from choai's bindings. hledger does the accounting; this module only
-- makes it reachable from a browser and changes nothing about it. It holds one
-- piece of state, the parsed journal, because parsing grows with the journal
-- while answering a report from one in memory does not.
--
-- Reports leave through hledger's own ToJSON instances, so the wire format is
-- the one @hledger --output-format=json@ produces.
module Main (main) where

import Control.Exception (SomeException, displayException, try)
import Data.Aeson ((.:), (.:?), (.=))
import qualified Data.Aeson as A
import qualified Data.Aeson.Text as A (encodeToLazyText)
import qualified Data.Aeson.Types as A
import Data.IORef (IORef, newIORef, readIORef, writeIORef)
import qualified Data.Map.Strict as M
import Data.Text (Text)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import qualified Data.Text.Lazy as TL
import GHC.Wasm.Prim (JSString (..), fromJSString, toJSString)
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

{-# NOINLINE journalRef #-}
journalRef :: IORef (Maybe Journal)
journalRef = unsafePerformIO (newIORef Nothing)

foreign export javascript "hledgerLoad" jsLoad :: JSString -> IO JSString
foreign export javascript "hledgerQuery" jsQuery :: JSString -> IO JSString

-- | Parse the journal at this path on the WASI filesystem and keep it.
jsLoad :: JSString -> IO JSString
jsLoad path = respond (fmap (fmap summarise) (readAndKeep (fromJSString path)))

-- | Read a journal under hledger's strict checks, telling a missing file apart
-- from one that is there and wrong.
--
-- Strict, as @hledger check --strict@: every account and commodity must be
-- declared. A book whose parlors are commodities would otherwise accept a
-- misspelt parlor as a new kind of ball nobody can exchange.
--
-- Existence is checked first because hledger calls @error@ for a missing file,
-- which would reach the caller as a crash.
readAndKeep :: FilePath -> IO (Either Failure Journal)
readAndKeep path = do
  present <- doesFileExist (snd (splitReaderPrefix path))
  if not present
    then pure (Left (FileMissing path))
    else do
      result <- runExceptT (readJournalFile definputopts {strict_ = True} path)
      case result of
        Left detail -> pure (Left (ReadFailed (T.pack detail)))
        Right journal -> writeIORef journalRef (Just journal) >> pure (Right journal)

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
    Just journal -> report journal request

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
report :: Journal -> Request -> IO (Either Failure A.Value)
report journal request = case reqKind request of
  "entries" -> withSpec [] (\spec -> page request (entriesReport spec journal))
  "balance" -> withSpec [] (balanceOver request journal)
  "incomestatement" -> withSpec ["type:RX"] (balanceOver request journal)
  "revaluation" -> revaluation journal request
  "prices" -> withSpec [] (\spec -> A.toJSON (filter (matchesPriceDirective (_rsQuery spec)) (jpricedirectives journal)))
  "accounts" -> pure (Right (declaredAccounts journal))
  other -> pure (Left (UnknownReport other))
  where
    withSpec extra render = fmap (fmap render) (specFor request extra id)

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
balanceOver :: Request -> Journal -> ReportSpec -> A.Value
balanceOver request journal spec = case reqPivot request of
  Nothing -> A.toJSON (multiBalanceReport spec journal)
  Just tag ->
    A.toJSON
      ( multiBalanceReport
          spec {_rsQuery = filterQuery queryIsDateOrDate2 (_rsQuery spec)}
          (journalPivot tag (filterJournalPostings (_rsQuery spec) journal))
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
revaluation :: Journal -> Request -> IO (Either Failure A.Value)
revaluation journal request = case reqValuation request of
  Just (AtEnd (Just commodity)) -> do
    moved <- specFor request {reqValuation = Just (AtEnd (Just commodity))} [] (\options -> options {balancecalc_ = CalcValueChange})
    posted <- specFor request {reqValuation = Just (AtThen (Just commodity))} [] id
    pure (A.toJSON <$> (lessPosted <$> (reportOf <$> moved) <*> (reportOf <$> posted)))
  _ -> pure (Left (MalformedRequest "a revaluation is asked with a valuation at the period's end"))
  where
    reportOf spec = multiBalanceReport spec journal

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
  pure (encode (either (Left . crashed) id result))
  where
    crashed e = Crashed (T.pack (displayException (e :: SomeException)))

encode :: Either Failure A.Value -> JSString
encode outcome =
  toJSString . TL.unpack . A.encodeToLazyText $ case outcome of
    Right answer -> A.object ["ok" .= True, "data" .= answer]
    Left failure -> A.object ["ok" .= False, "error" .= failureJson failure]

main :: IO ()
main = pure ()
