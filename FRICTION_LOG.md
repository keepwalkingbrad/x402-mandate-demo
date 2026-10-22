# Friction log

Kept while building this demo (22 Oct 2026, x402 v2 packages 2.28.0, Windows 11, Node 24.22.1).
Each entry: what happened, who it would affect, and how bad it was.

**Users:** Developer = person adding x402 and the mandate check to an agent · Seller = person charging for an API · Finance = person approving mandates and reading the log.
**Severity:** Blocker (could not continue without help) · Slowdown (lost time, worked it out) · Papercut (confusing, no time lost) · Risk (could cause a real-money or security mistake).

| # | Stage | What happened | User | Severity |
|---|---|---|---|---|
| 1 | Docs | The `@x402/fetch` npm README labels `eip155:8453` as "Base Sepolia". 8453 is Base **mainnet**; Sepolia is 84532. Copy-pasting the example points an agent at real money. | Developer | Risk |
| 2 | Docs | Two overlapping doc sites (docs.x402.org, docs.cdp.coinbase.com), the repo moved from `coinbase/x402` to `x402-foundation/x402`, and search results still surface v1 packages (`x402-express`) that use a different API and network format. | Developer | Slowdown |
| 3 | Seller setup | The Express quickstart installs Solana and Algorand packages even for a Base-only seller. | Seller | Papercut |
| 4 | Docs vs code | Docs say built-in `spendControls` run *before* custom hooks; in 2.28.0 the $1 cap is enforced *after* `onBeforePaymentCreation`, inside payment creation. Two overlapping spend-limit mechanisms with an undocumented order, plus a silent $1 default. | Developer, Finance | Slowdown |
| 5 | Environment | Download page for Node.js opens on Docker commands; the plain Windows installer is further down. | Developer | Papercut |
| 6 | Environment | Installed Node, but VS Code's terminal said `node` "is not recognized": the already-open editor kept the old PATH. Fix: fully quit and reopen, or reload PATH. | Developer | Blocker |
| 7 | Environment | `npm` blocked by PowerShell's default script policy ("running scripts is disabled"). Fix: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. No x402 quickstart mentions it. | Developer | Blocker |
| 8 | Environment | npm prompted a major-version upgrade (11 → 12) in the middle of onboarding. Taking it worked, but it is an extra variable for a newcomer. | Developer | Papercut |
| 9 | Seller | When the facilitator is unreachable, a paid route returns a generic `500` instead of a `402` or a clear message. An agent cannot tell "this costs money" from "this is broken". | Seller, Developer | Slowdown |
| 10 | Testing | In Windows PowerShell 5, `curl` is an alias for `Invoke-WebRequest`, which treats a 402 as an exception and hides the price tag. Quickstarts say "use curl". Workaround: `curl.exe -i`. | Seller, Developer | Papercut |
| 11 | Payment | Faucets for testnet tokens warn you need test ETH for gas; with x402 `exact` on Base the facilitator pays gas, so the agent only needs USDC. True, but nowhere obvious in the buyer quickstart. | Developer | Papercut |
| 12 | Payment | The paid call sits silent for several seconds while settling, then prints a transaction hash. Confirming money really moved meant opening a block explorer, which a finance person would struggle to read ("From" is the facilitator, not the payer). | Developer, Finance | Papercut |

## Learnings so far

- **Onboarding starts before the SDK.** Both blockers happened before any x402 code existed. Time-to-first-paid-call includes installing Node on Windows.
- **The network ID is a safety-critical string.** `8453` vs `84532` is one digit between testnet and real money, and one official example gets it wrong. A mandate that pins the network (as this demo's does) is a cheap guard.
- **The SDK's spend control is per-payment only.** Budgets, allowlists, expiry and an audit trail are left to the developer: the gap a mandate product fills.
- **A block explorer is not a finance tool.** Proving a payment happened meant reading a page where the "From" field shows the facilitator, not the payer. Finance needs the verdict and the transaction joined in one record, which is why the audit log stores both.
