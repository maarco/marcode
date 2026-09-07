#!/usr/bin/env node

import { runForkBoundaryCli } from "./lib/fork-boundary.ts";

runForkBoundaryCli(process.argv.slice(2), process.cwd());
