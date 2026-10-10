/// <reference lib="webworker" />

import { serveReasoner } from "../worker/reasoner"
import rules from "./grounds.pl?raw"

serveReasoner(rules)
