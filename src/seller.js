// seller.js — a tiny paid API protected by x402 (TESTNET ONLY).
//
// Unpaid requests get HTTP 402 Payment Required with a price tag.
// Paid requests are verified and settled by the x402 facilitator,
// then the handler runs and returns the data.
//
// Based on the x402 v2 Express quickstart:
// https://docs.x402.org/getting-started/quickstart-for-sellers

import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 4021;
const NETWORK = "eip155:84532"; // Base Sepolia (testnet). Base MAINNET would be eip155:8453.
// Free, testnet-only facilitator. Overridable for offline testing.
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// The seller only needs its public address to get paid; derive it from .env.
const payTo = privateKeyToAccount(process.env.SELLER_PRIVATE_KEY).address;

// A wallet that is NOT on the agent's mandate allowlist, standing in for an
// unknown third-party seller. (It is the well-known "dead" address, so even if
// a payment were approved by mistake, nobody could spend it.)
const UNKNOWN_PARTNER = "0x000000000000000000000000000000000000dEaD";

// The facilitator is the third party that verifies signed payments and
// submits them onchain, so this server needs no blockchain code of its own.
const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

// Price list: which routes cost what. Anything not listed here is free.
const routes = {
  "GET /premium-fact": {
    accepts: [{ scheme: "exact", price: "$0.001", network: NETWORK, payTo }],
    description: "One premium fact",
    mimeType: "application/json",
  },
  // Demo: priced above the mandate's per-payment limit -> agent should deny.
  "GET /premium-report": {
    accepts: [{ scheme: "exact", price: "$0.50", network: NETWORK, payTo }],
    description: "Full premium report",
    mimeType: "application/json",
  },
  // Demo: cheap, but pays a wallet not on the allowlist -> agent should deny.
  "GET /partner-data": {
    accepts: [{ scheme: "exact", price: "$0.002", network: NETWORK, payTo: UNKNOWN_PARTNER }],
    description: "Partner data feed",
    mimeType: "application/json",
  },
};

const app = express();
app.use(paymentMiddleware(routes, resourceServer)); // the "ticket barrier"

// Free endpoint, handy for checking the server is up.
app.get("/", (_req, res) => res.json({ ok: true, paid: Object.keys(routes) }));

// Paid endpoint. This code only runs after payment has been verified.
app.get("/premium-fact", (_req, res) => {
  res.json({
    fact: "HTTP status 402 'Payment Required' was reserved in 1997 and left unused for decades.",
    servedAt: new Date().toISOString(),
  });
});

// These two handlers only run if a payment was made (it should be denied).
app.get("/premium-report", (_req, res) => res.json({ report: "Full premium report." }));
app.get("/partner-data", (_req, res) => res.json({ feed: "Partner data." }));

app.listen(PORT, () => {
  console.log(`Seller running at http://localhost:${PORT} (Base Sepolia testnet)`);
  console.log(`  GET /premium-fact    $0.001  -> ${payTo}`);
  console.log(`  GET /premium-report  $0.50   -> ${payTo}`);
  console.log(`  GET /partner-data    $0.002  -> ${UNKNOWN_PARTNER} (not on allowlist)`);
});
