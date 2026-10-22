// setup-wallets.js
// Creates three fresh, throwaway TESTNET wallets for this demo and saves their
// private keys to a local .env file (which .gitignore keeps out of GitHub).
//
//   AGENT   - holds testnet USDC and signs x402 payments
//   SELLER  - receives payments for the paid API
//   VERDICT - signs each mandate decision so the audit log is tamper-evident
//
// It prints ADDRESSES ONLY. Private keys are never printed.

import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ENV_FILE = ".env";

// Safety: never overwrite an existing .env (it may hold a funded wallet).
if (existsSync(ENV_FILE)) {
  console.log(`A ${ENV_FILE} file already exists, so no new wallets were created.`);
  console.log("Delete it yourself only if you are sure you want brand-new wallets.");
  process.exit(0);
}

const roles = ["AGENT", "SELLER", "VERDICT_SIGNER"];
const lines = [
  "# TESTNET ONLY (Base Sepolia). Throwaway keys for x402-mandate-demo.",
  "# Never commit this file. Never paste these keys anywhere.",
];
const addresses = {};

for (const role of roles) {
  const key = generatePrivateKey();               // random 32-byte secret
  addresses[role] = privateKeyToAccount(key).address; // public address derived from it
  lines.push(`${role}_PRIVATE_KEY=${key}`);
}

writeFileSync(ENV_FILE, lines.join("\n") + "\n", { flag: "wx" });

console.log("Created 3 testnet wallets. Keys saved to .env (gitignored).\n");
console.log(`Agent address  (fund this with testnet USDC): ${addresses.AGENT}`);
console.log(`Seller address (receives payments):           ${addresses.SELLER}`);
console.log(`Verdict signer (signs mandate decisions):     ${addresses.VERDICT_SIGNER}`);
