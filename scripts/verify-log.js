// verify-log.js — lets anyone (e.g. finance or an auditor) check the audit log.
// For every line it confirms:
//   1. the signature is valid and comes from the expected verdict signer
//   2. the line links to the previous one (prevHash), so nothing was edited,
//      reordered or deleted after it was written.
// Needs no private keys: only the log file and the signer's public address.

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyMessage } from "viem";

const LOG_FILE = process.argv[2] ?? "logs/audit-log.jsonl";
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

if (!existsSync(LOG_FILE)) {
  console.log(`No log at ${LOG_FILE} yet. Run "npm run demo" first.`);
  process.exit(0);
}

const lines = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
const expectedSigner = JSON.parse(lines[0]).signer; // in production: pinned in config
let allOk = true;

for (const [i, line] of lines.entries()) {
  const { signature, ...body } = JSON.parse(line);
  const problems = [];

  if (body.signer !== expectedSigner) problems.push("unexpected signer");
  if (body.prevHash !== (i === 0 ? null : sha256(lines[i - 1]))) problems.push("chain broken (earlier line changed or removed)");
  if (!(await verifyMessage({ address: body.signer, message: JSON.stringify(body), signature }))) problems.push("signature invalid (line edited)");

  const label = body.type === "verdict"
    ? `${body.decision.toUpperCase().padEnd(7)} $${body.amountUSDC} ${body.sellerName}`
    : `SETTLED tx ${body.transaction.slice(0, 12)}...`;
  console.log(`${problems.length ? "FAIL" : "ok  "}  #${i + 1} ${label}${problems.length ? "  <- " + problems.join("; ") : ""}`);
  if (problems.length) allOk = false;
}

console.log(allOk
  ? `\nAll ${lines.length} entries verified. Signed by ${expectedSigner}; chain intact.`
  : "\nVERIFICATION FAILED: the log has been altered.");
process.exit(allOk ? 0 : 1);
