// check-balance.js
// Reads the testnet USDC balance of the agent and seller wallets on Base Sepolia.
// Read-only: it never signs or sends anything. Prints addresses and balances only.

import { createPublicClient, http, formatUnits, erc20Abi } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Circle's official testnet USDC on Base Sepolia
// (source: https://developers.circle.com/stablecoins/usdc-contract-addresses)
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// A public client only reads from the chain; it holds no keys.
const client = createPublicClient({ chain: baseSepolia, transport: http() });

async function usdcBalance(address) {
  const raw = await client.readContract({
    address: USDC_BASE_SEPOLIA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return formatUnits(raw, 6); // USDC has 6 decimal places
}

for (const role of ["AGENT", "SELLER"]) {
  const key = process.env[`${role}_PRIVATE_KEY`];
  if (!key) {
    console.error(`Missing ${role}_PRIVATE_KEY in .env. Run "npm run setup:wallets" first.`);
    process.exit(1);
  }
  const { address } = privateKeyToAccount(key); // derive the public address only
  try {
    console.log(`${role.padEnd(6)} ${address}  ${await usdcBalance(address)} USDC`);
  } catch (err) {
    // Keep the message short and human: the full viem error is ~200 lines.
    console.error(`Could not reach Base Sepolia to read the ${role} balance (${err.shortMessage ?? err.message}).`);
    console.error("Check your internet connection and try again in a minute.");
    process.exit(1);
  }
}
console.log(`\nNetwork: Base Sepolia (testnet, chain id ${baseSepolia.id})`);
