# Mandate-checked agent payments

An AI agent pays for an API with USDC over [x402](https://docs.x402.org), but only after checking the payment against a spending mandate a human approved in advance. Every decision is signed and written to an audit log that finance can verify without trusting the agent.

**Testnet only** (Base Sepolia, testnet USDC). Built in a weekend by Liezl Yambao to see what agent payments look like for each person who has to live with them. I own an AI governance framework at a telco group; this is the control I would want in place before giving any agent a funded wallet.

---

## The problem

Payment systems assume a person is present at the moment of purchase. Card checkouts, logins, one-time codes and invoices all depend on someone being there to approve. An AI agent calling paid APIs in the middle of a task has none of that: it needs to pay in milliseconds, for amounts as small as a tenth of a cent, to sellers it may never have dealt with before.

x402 solves the mechanics. A server answers an unpaid request with `402 Payment Required` and a machine-readable price; the agent signs a USDC payment and retries; a facilitator settles it onchain. There is no account to create and no checkout page. The status code waited 29 years for this.

That raises a harder question for the business: **who decided the agent was allowed to spend this money?** The x402 client includes one guard (a default $1 cap per payment). It has no daily budget, no list of approved sellers, no expiry and no record a finance team could audit. Without those, giving an agent a funded wallet is the same as handing it a company card with no limit and no statement.

The fix is a mandate. A human approves the rules once; the agent checks every payment against them **before signing anything**, so a denied payment is never authorised in the first place.

## What it does

```
Agent requests data ──► Seller: "402. Pay $0.50 USDC to 0xc7e0…"
                              │
                 MANDATE CHECK (before any payment is signed)
                 · mandate not expired
                 · Base Sepolia only
                 · USDC only
                 · seller on the allowlist
                 · at or under $0.01 per payment
                 · at or under $0.05 per day
                              │
              ┌───────────────┴───────────────┐
           APPROVE                           DENY
    sign payment, retry, receive      stop: no payment signed,
    data, log the transaction         no money can move
              └───────────────┬───────────────┘
            Verdict signed and appended to logs/audit-log.jsonl
```

The mandate is a plain JSON file ([`mandate.json`](mandate.json)):

```json
{
  "mandateId": "MDT-2026-001",
  "agent": "0xd013D856EA99489484B70000cF12038DbAE7e677",
  "network": "eip155:84532",
  "currency": "USDC",
  "maxPerPayment": "0.01",
  "dailyBudget": "0.05",
  "allowedSellers": [{ "name": "Premium Facts API", "payTo": "0xc7e03aE18ecCcbb10cf2aFbc7f188e3BBcc4089d" }],
  "expiresAt": "2026-11-30T23:59:59+11:00"
}
```

### One approved payment, two denied

Real output from `npm run demo`:

```
Agent 0xd013D856EA99489484B70000cF12038DbAE7e677
Mandate MDT-2026-001: max $0.01/payment, $0.05/day, 1 allowlisted seller(s), expires 2026-11-30T23:59:59+11:00

-> http://localhost:4021/premium-fact
   Mandate MDT-2026-001: APPROVED $0.001 USDC to Premium Facts API
   Reason:  within mandate: $0.001 to Premium Facts API
   Verdict signed by 0x511A82C171FE5b93ce6Eb2CB34E6cCBCF2D367De (logged)
   Data:    {"fact":"HTTP status 402 'Payment Required' was reserved in 1997 and left unused for decades.", ...}
   Paid:    https://sepolia.basescan.org/tx/0x10020b9f2c33e0564b27be2dfca03340f9bba8d989ea645faba9d9278e46008f

-> http://localhost:4021/premium-report
   Mandate MDT-2026-001: DENIED   $0.50 USDC to Premium Facts API
   Reason:  price $0.50 exceeds the $0.01 per-payment limit
   Verdict signed by 0x511A82C171FE5b93ce6Eb2CB34E6cCBCF2D367De (logged)
   No payment was signed. No money moved.

-> http://localhost:4021/partner-data
   Mandate MDT-2026-001: DENIED   $0.002 USDC to unknown
   Reason:  seller 0x000000000000000000000000000000000000dEaD is not on the allowlist
   Verdict signed by 0x511A82C171FE5b93ce6Eb2CB34E6cCBCF2D367De (logged)
   No payment was signed. No money moved.
```

The approved payment is a real Base Sepolia transaction: [0x10020b9f…](https://sepolia.basescan.org/tx/0x10020b9f2c33e0564b27be2dfca03340f9bba8d989ea645faba9d9278e46008f). On the block explorer, the "From" address is the facilitator, which paid the gas fee. The agent never held ETH; it only signed an authorisation to move its own USDC to the seller.

### A sample log entry

Each line of `logs/audit-log.jsonl` is one signed record. This is the denied $0.50 request:

```json
{
  "type": "verdict",
  "id": "abcb991c-902d-4266-975b-f536b70084c7",
  "timestamp": "2026-10-22T05:41:04.658Z",
  "mandateId": "MDT-2026-001",
  "agent": "0xd013D856EA99489484B70000cF12038DbAE7e677",
  "resource": "http://localhost:4021/premium-report",
  "sellerName": "Premium Facts API",
  "payTo": "0xc7e03aE18ecCcbb10cf2aFbc7f188e3BBcc4089d",
  "amountUSDC": "0.50",
  "amountAtomic": "500000",
  "network": "eip155:84532",
  "decision": "deny",
  "reason": "price $0.50 exceeds the $0.01 per-payment limit",
  "prevHash": "dd1e73f847ebd2c797ac43a161729e6aac4e94bfddbf2e436d3abc365fb3d692",
  "signer": "0x511A82C171FE5b93ce6Eb2CB34E6cCBCF2D367De",
  "signature": "0x114f4748e9dea7b3e9a962afa357c2780361f6a7cdc364af3984c1d0856b9e653314db512af655c4f1d547310c899644feafbf644aa9ae3d459ce0efaff7ca7c1c"
}
```

Approved payments get a second `settlement` record carrying the transaction hash and a block explorer link, joined to the verdict by `verdictId`.

### The log cannot be quietly edited

`npm run verify-log` checks every line's signature and its link to the line before it (`prevHash`). It needs no private keys, so anyone can check the real log from this demo run, committed as [`docs/sample-audit-log.jsonl`](docs/sample-audit-log.jsonl):

```bash
npm run verify-log docs/sample-audit-log.jsonl
```

Changing one amount in the file:

```
FAIL  #1 APPROVE $0.0001 Premium Facts API  <- signature invalid (line edited)
FAIL  #2 SETTLED tx 0x10020b9f2c...  <- chain broken (earlier line changed or removed)
ok    #3 DENY    $0.50 Premium Facts API
ok    #4 DENY    $0.002 unknown

VERIFICATION FAILED: the log has been altered.
```

## What this looks like for each user

### The developer adding the check

The mandate check is one hook on the standard x402 client. x402 calls `onBeforePaymentCreation` after the 402 arrives and before the payment is signed; returning `{ abort: true, reason }` cancels it.

```js
client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
  const verdict = await checkPayment(mandate, paymentRequired, selectedRequirements);
  if (verdict.decision === "deny") return { abort: true, reason: verdict.reason };
});
```

What the developer gets: denials surface as a normal, catchable result with a human-readable reason, rather than a failed transaction. What still hurts: two overlapping spend-limit mechanisms (built-in `spendControls` and hooks) whose order in the code differs from the docs, and network IDs where one digit separates testnet from real money. See the [friction log](FRICTION_LOG.md).

### The seller of the API

Nothing changes for the seller. They price a route in a few lines of config and receive USDC directly to their wallet; the facilitator verifies and settles, so they run no blockchain infrastructure. A mandate-checked agent looks the same as any other x402 buyer: it either pays or does not.

The opportunity for sellers is the denial data. Today a denied agent simply goes away. If the 402 response and the denial reason were shared (for example "price above this buyer's per-payment limit"), sellers could see which prices are losing agent customers.

### The finance person approving mandates and reading the log

Finance sets the rules in business terms (per-payment limit, daily budget, approved sellers, expiry) without touching agent code. The log answers the questions an auditor asks: what was requested, from whom, for how much, under which mandate, what was decided and why, and, for approved payments, which onchain transaction settled it. Denials are recorded as carefully as approvals, because "the agent tried to pay an unknown seller" is exactly what finance needs to know.

What is missing for this user today: a way to approve or change a mandate without editing JSON, and a readable view of the log that does not require a terminal or a block explorer.

## Run it yourself

Requirements: Node.js 22 or later, Git. Windows, macOS or Linux.

```bash
git clone <this repo>
cd x402-mandate-demo
npm install
npm run setup:wallets   # creates 3 throwaway testnet wallets in .env (gitignored); prints addresses only
```

1. Fund the **agent** address with testnet USDC from [faucet.circle.com](https://faucet.circle.com/) (choose **Base Sepolia**). No testnet ETH is needed.
2. Put your agent and seller addresses into `mandate.json` (`agent` and `allowedSellers[0].payTo`).
3. Run the demo:

```bash
npm run demo         # starts the seller, runs one approved and two denied purchases
npm run verify-log   # checks every signature and the hash chain
npm run balance      # shows the agent and seller USDC balances
```

Other commands: `npm run seller` (run the paid API on its own), `npm run peek` (see a decoded 402 price tag without paying), `npm run agent [url]` (one purchase).

## What I would build next

In priority order:

1. **Signed mandates.** Finance signs `mandate.json` and the agent refuses an unsigned or altered one. Today the agent trusts whatever file it is given; this makes the human approval itself verifiable.
2. **Anchor the log.** Publish the latest log hash somewhere the agent cannot write (a finance-owned store or an onchain record). The hash chain catches edits and deletions in the middle, but not deletion of the newest entries.
3. **Mandate checks as a service.** Move the check out of the agent's process to a separate signer that holds the payment key. A compromised or badly prompted agent could skip an in-process hook; it cannot skip a service that must co-sign.
4. **A finance view.** A simple page that lists verdicts and settlements in plain language, with filters by mandate and seller, and an "approve mandate" flow. This is the user with the least tooling today.
5. **Budget on settled spend, not approvals.** The daily budget counts approvals, which is safe but overcounts if a settlement fails. Reconciling against `settlement` records would make the budget exact.

## How it is built

| File | What it does |
|---|---|
| [`src/seller.js`](src/seller.js) | Express API with three x402-priced routes |
| [`src/agent.js`](src/agent.js) | x402 client plus the mandate hook |
| [`src/mandate.js`](src/mandate.js) | The rules, verdict signing and audit log |
| [`src/demo.js`](src/demo.js) | One-command demo runner |
| [`scripts/verify-log.js`](scripts/verify-log.js) | Independent log verification |
| [`mandate.json`](mandate.json) | The human-approved mandate |

Versions: `@x402/core`, `@x402/evm`, `@x402/express`, `@x402/fetch` 2.28.0 (x402 protocol v2); `viem` 2.57.8; `express` 5.3.0; Node.js 24. Facilitator: `https://x402.org/facilitator` (free, testnet only). Verdicts are signed with an Ethereum personal-message signature (EIP-191) by a dedicated key, separate from the agent's payment key.

Documentation relied on:

- [x402 Quickstart for Sellers](https://docs.x402.org/getting-started/quickstart-for-sellers)
- [x402 Quickstart for Buyers](https://docs.x402.org/getting-started/quickstart-for-buyers)
- [x402 Lifecycle Hooks](https://docs.x402.org/advanced-concepts/lifecycle-hooks)
- [x402 Migration Guide, v1 to v2](https://docs.cdp.coinbase.com/x402/migration-guide)
- [Circle: USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)

## Limits

This is a demo, not a payment product. It runs on testnet only. The mandate check runs inside the agent's own process, so it protects against mistakes, not against a malicious agent (see item 3 above). The log is a local file. Keys live in a local `.env` file, which is fine for throwaway testnet wallets and not acceptable for real funds.

## Friction log

The most useful output of this project is the list of places where setup, docs or behaviour got in the way, tagged by which user it affects: **[FRICTION_LOG.md](FRICTION_LOG.md)**.
