// peek-402.js — calls the paid endpoint WITHOUT paying and shows the 402 price tag.
// Nothing is signed or paid. Run the seller first ("npm run seller").

const url = process.argv[2] ?? "http://localhost:4021/premium-fact";

const res = await fetch(url);
console.log(`HTTP ${res.status} ${res.statusText}`);

// In x402 v2 the price tag travels in the PAYMENT-REQUIRED header, base64-encoded JSON.
const header = res.headers.get("payment-required");
if (!header) {
  console.log("No PAYMENT-REQUIRED header (is this route paid?).");
  process.exit(0);
}

const priceTag = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
console.log("\nDecoded PAYMENT-REQUIRED header:");
console.log(JSON.stringify(priceTag, null, 2));
