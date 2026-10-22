// agent.js — a script "agent" that pays for x402 APIs, but only within a
// human-approved mandate (TESTNET ONLY).
//
// Flow: request -> 402 price tag -> MANDATE CHECK (signed verdict, logged)
//       -> if approved: sign USDC payment, retry, get data, log settlement
//       -> if denied:   nothing is signed; no money can move.
//
// Based on the x402 v2 buyer quickstart and lifecycle hooks docs:
// https://docs.x402.org/getting-started/quickstart-for-buyers
// https://docs.x402.org/advanced-concepts/lifecycle-hooks

import { wrapFetchWithPayment, x402HTTPClient } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { pathToFileURL } from "node:url";
import { loadMandate, checkPayment, recordSettlement } from "./mandate.js";

export function createAgent() {
  const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY); // key never printed
  const mandate = loadMandate();

  // The mandate names exactly one agent wallet; refuse to run as any other.
  if (signer.address.toLowerCase() !== mandate.agent.toLowerCase()) {
    throw new Error(`This wallet (${signer.address}) is not the agent named in mandate ${mandate.mandateId}.`);
  }

  // Only Base Sepolia is registered, so a mainnet price tag cannot be paid.
  const client = new x402Client();
  client.register("eip155:84532", new ExactEvmScheme(signer));

  // THE MANDATE CHECK. Runs after the 402 arrives, before any payment is signed.
  let lastVerdict = null;
  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
    lastVerdict = await checkPayment(mandate, paymentRequired, selectedRequirements);
    if (lastVerdict.decision === "deny") return { abort: true, reason: lastVerdict.reason };
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, client);
  const httpClient = new x402HTTPClient(client);

  // Buy one resource. Always resolves to a plain summary (never throws on a deny).
  async function buy(url) {
    lastVerdict = null;
    try {
      const result = await httpClient.processResponse(await fetchWithPayment(url));
      if (result.paymentStatus === "settled" && lastVerdict) {
        await recordSettlement(lastVerdict.id, result.header);
      }
      return { url, verdict: lastVerdict, status: result.status, data: result.body, settlement: result.header };
    } catch (err) {
      if (lastVerdict?.decision === "deny") return { url, verdict: lastVerdict, status: "not paid" };
      throw err; // a real error (network, seller down), not a mandate denial
    }
  }

  return { address: signer.address, mandate, buy };
}

// Pretty-print one purchase for the terminal.
export function printPurchase(p) {
  const v = p.verdict;
  console.log(`\n-> ${p.url}`);
  if (!v) return console.log(`   HTTP ${p.status} (no payment was requested)`);
  const mark = v.decision === "approve" ? "APPROVED" : "DENIED  ";
  console.log(`   Mandate ${v.mandateId}: ${mark} $${v.amountUSDC} USDC to ${v.sellerName}`);
  console.log(`   Reason:  ${v.reason}`);
  console.log(`   Verdict signed by ${v.signer} (logged)`);
  if (v.decision === "approve") {
    console.log(`   Data:    ${JSON.stringify(p.data)}`);
    if (p.settlement?.transaction) console.log(`   Paid:    https://sepolia.basescan.org/tx/${p.settlement.transaction}`);
  } else {
    console.log("   No payment was signed. No money moved.");
  }
}

// Run directly: npm run agent [url]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agent = createAgent();
  console.log(`Agent ${agent.address} operating under mandate ${agent.mandate.mandateId}`);
  printPurchase(await agent.buy(process.argv[2] ?? "http://localhost:4021/premium-fact"));
}
