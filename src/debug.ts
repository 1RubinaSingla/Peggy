import { fetchEnhanced, getAllSignatures } from "./helius.ts";

const wallet = process.argv[2];
if (!wallet) {
  console.error("usage: npm run debug -- <wallet>");
  process.exit(1);
}

const sigs = await getAllSignatures(wallet);
console.log(`got ${sigs.length} sigs`);

const sample = sigs.slice(0, 50);
const txs = await fetchEnhanced(sample);

const swapTxs = txs.filter((t: any) => t.type === "SWAP");
console.log(`\n${swapTxs.length}/${txs.length} txs are type=SWAP`);

if (swapTxs.length) {
  console.log("\n──── FIRST SWAP TX (full) ────");
  console.log(JSON.stringify(swapTxs[0], null, 2).slice(0, 8000));
}
