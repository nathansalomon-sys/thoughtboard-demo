// Drives /pipeline/run-batch in a loop. Each HTTP call is a fresh Worker invocation
// with its own subrequest budget, avoiding Workflows per-instance accumulation limits.
// Safe to re-run: the Worker self-selects unprocessed rows, INSERT OR IGNORE is idempotent.
//
// Usage: node scripts/run-pipeline.js

const WORKER_URL = "https://thoughtboard.maestro-ai.workers.dev";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBatch(attempt = 1) {
  try {
    const res = await fetch(`${WORKER_URL}/pipeline/run-batch`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  } catch (err) {
    if (attempt >= 5) throw err;
    const delay = attempt * 3000;
    process.stdout.write(`\n  Retry ${attempt}/5 after ${delay / 1000}s (${err.message})... `);
    await sleep(delay);
    return runBatch(attempt + 1);
  }
}

async function main() {
  console.log("Starting pipeline...");
  let total = 0;
  let batch = 1;

  while (true) {
    process.stdout.write(`  Batch ${batch}... `);
    const result = await runBatch();
    if (result.done || result.processed === 0) {
      console.log("done.");
      break;
    }
    total += result.processed;
    console.log(`✓ ${result.processed} classified (running total: ${total})`);
    batch++;
  }

  console.log(`\nPipeline complete. Total classified this run: ${total}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
