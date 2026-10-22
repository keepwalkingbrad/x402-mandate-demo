// demo.js — one command to see the whole thing: `npm run demo`
//
// Starts the seller (unless one is already running), then the agent tries
// three purchases under mandate MDT-2026-001:
//   1. /premium-fact    $0.001 from an allowlisted seller  -> APPROVE and pay
//   2. /premium-report  $0.50, over the per-payment limit  -> DENY
//   3. /partner-data    $0.002 to an unknown seller        -> DENY
// Every decision is signed and appended to logs/audit-log.jsonl.

import { spawn } from "node:child_process";
import { createAgent, printPurchase } from "./agent.js";

const BASE = "http://localhost:4021";

async function sellerIsUp() {
  try { return (await fetch(BASE)).ok; } catch { return false; }
}

// Start the seller as a child process and wait until it answers.
async function startSeller() {
  const child = spawn(process.execPath, ["--env-file=.env", "src/seller.js"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await sellerIsUp()) return child;
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("Seller did not start on port 4021.");
}

const seller = (await sellerIsUp()) ? null : await startSeller();
console.log(seller ? "Started the seller on port 4021." : "Using the seller already running on port 4021.");

try {
  const agent = createAgent();
  const m = agent.mandate;
  console.log(`\nAgent ${agent.address}`);
  console.log(`Mandate ${m.mandateId}: max $${m.maxPerPayment}/payment, $${m.dailyBudget}/day, ` +
    `${m.allowedSellers.length} allowlisted seller(s), expires ${m.expiresAt}`);

  for (const path of ["/premium-fact", "/premium-report", "/partner-data"]) {
    printPurchase(await agent.buy(BASE + path));
  }

  console.log("\nAudit log: logs/audit-log.jsonl   Verify it: npm run verify-log");
} finally {
  seller?.kill(); // only stop the seller if this script started it
}
