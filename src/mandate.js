// mandate.js — checks a payment request against a human-approved mandate,
// signs the verdict, and appends it to an audit log finance can read.
//
// A mandate is a JSON file a person approved in advance (see mandate.json):
// who may spend, how much per payment, how much per day, with which sellers,
// until when. The agent cannot pay without an "approve" verdict from here.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const LOG_FILE = "logs/audit-log.jsonl"; // one JSON object per line
const USDC_DECIMALS = 6;

// 1000n -> "0.001", 500000n -> "0.50" (exact, but always at least 2 decimals)
const usd = (atomic) => {
  const [whole, frac = ""] = formatUnits(BigInt(atomic), USDC_DECIMALS).split(".");
  return `${whole}.${frac.padEnd(2, "0")}`;
};
const atomic = (dollars) => parseUnits(dollars, USDC_DECIMALS);     // "0.01" -> 10000n
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export function loadMandate(path = "mandate.json") {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readLog() {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// Total approved today (UTC). Approvals count against the budget even if
// settlement later fails: conservative, so the agent can never overspend.
function spentToday(log, mandateId, now) {
  const day = now.toISOString().slice(0, 10);
  return log
    .filter((e) => e.type === "verdict" && e.mandateId === mandateId && e.decision === "approve")
    .filter((e) => e.timestamp.startsWith(day))
    .reduce((sum, e) => sum + BigInt(e.amountAtomic), 0n);
}

// The policy itself: run each rule in order; the first failure denies.
export function evaluate(mandate, req, log, now = new Date()) {
  const amount = BigInt(req.amount);
  const seller = mandate.allowedSellers.find(
    (s) => s.payTo.toLowerCase() === req.payTo.toLowerCase(),
  );
  const spent = spentToday(log, mandate.mandateId, now);

  const rules = [
    [now <= new Date(mandate.expiresAt), `mandate expired on ${mandate.expiresAt}`],
    [req.network === mandate.network, `network ${req.network} is not allowed (mandate: ${mandate.network})`],
    [req.asset.toLowerCase() === mandate.asset.toLowerCase(), `asset ${req.asset} is not ${mandate.currency}`],
    [Boolean(seller), `seller ${req.payTo} is not on the allowlist`],
    [amount <= atomic(mandate.maxPerPayment), `price $${usd(amount)} exceeds the $${mandate.maxPerPayment} per-payment limit`],
    [spent + amount <= atomic(mandate.dailyBudget), `would exceed the $${mandate.dailyBudget} daily budget ($${usd(spent)} already approved today)`],
  ];

  const failed = rules.find(([ok]) => !ok);
  return failed
    ? { decision: "deny", reason: failed[1], seller }
    : { decision: "approve", reason: `within mandate: $${usd(amount)} to ${seller.name}`, seller };
}

// Sign an entry and append it to the log. Each entry also stores the hash of
// the previous line, so editing or deleting any earlier line breaks the chain.
async function appendSigned(entry) {
  const signer = privateKeyToAccount(process.env.VERDICT_SIGNER_PRIVATE_KEY);
  const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean) : [];
  const body = { ...entry, prevHash: log.length ? sha256(log.at(-1)) : null, signer: signer.address };
  const signature = await signer.signMessage({ message: JSON.stringify(body) });
  mkdirSync("logs", { recursive: true });
  appendFileSync(LOG_FILE, JSON.stringify({ ...body, signature }) + "\n");
  return { ...body, signature };
}

// Called by the agent before it signs any payment. Returns the signed verdict.
export async function checkPayment(mandate, paymentRequired, requirements) {
  const now = new Date();
  const { decision, reason, seller } = evaluate(mandate, requirements, readLog(), now);
  return appendSigned({
    type: "verdict",
    id: randomUUID(),
    timestamp: now.toISOString(),
    mandateId: mandate.mandateId,
    agent: mandate.agent,
    resource: paymentRequired.resource?.url,
    sellerName: seller?.name ?? "unknown",
    payTo: requirements.payTo,
    amountUSDC: usd(requirements.amount),
    amountAtomic: String(requirements.amount),
    network: requirements.network,
    decision,
    reason,
  });
}

// Called after an approved payment settles, so finance can match the
// verdict to the onchain transaction.
export async function recordSettlement(verdictId, settle) {
  return appendSigned({
    type: "settlement",
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    verdictId,
    success: settle.success,
    transaction: settle.transaction,
    explorer: `https://sepolia.basescan.org/tx/${settle.transaction}`,
  });
}
