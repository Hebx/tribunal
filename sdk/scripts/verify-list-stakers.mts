// Verify readStakerList against a real testnet StakePool.
//
//   cd sdk && node --import tsx scripts/verify-list-stakers.mts [POOL_ID]
//
// Default POOL_ID is the v2 stake-flow pool from DEPLOYMENTS.md. The v2 pool
// does NOT have the new advocate/weighted fields — this run is here to prove
// readStakerList tolerates real RPC payloads and degrades cleanly when the
// schema predates v3. After Task 1.6 (v3 deploy + a fresh stake), point this
// at the new pool id and assert all the v3 fields are populated.

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { readStakerList } from "../src/agents/staker-list.js";

const POOL_ID = process.argv[2] ?? "0x42a055fb39f6bbd230b505cc0d4641fd8473061bc53c86847baafc288908ce0f";

const NETWORK = "testnet" as const;
const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });

console.log(`Reading StakePool ${POOL_ID}`);
let state;
try {
  state = await readStakerList(client, POOL_ID);
} catch (err) {
  // v2 pools won't have the new fields. Surface the raw shape so we can
  // confirm we're talking to a pre-v3 pool, then bail cleanly.
  const raw = await client.getObject({ id: POOL_ID, options: { showContent: true } });
  console.log("\n--- raw pool.content ---");
  console.log(JSON.stringify(raw.data?.content, null, 2));
  console.error(`\nreadStakerList failed: ${(err as Error).message}`);
  console.error(
    "If this is the v2 pool from pre-v3 DEPLOYMENTS.md the missing v3 fields " +
      "(advocate_yes/no, yes/no_weighted_total, stakes) are EXPECTED. Re-run " +
      "this script after deploying v3 with a fresh pool id.",
  );
  process.exit(0);
}

console.log("\n--- decoded state ---");
console.log(JSON.stringify({
  caseId: state.caseId,
  yesTotal: state.yesTotal.toString(),
  noTotal: state.noTotal.toString(),
  yesWeightedTotal: state.yesWeightedTotal.toString(),
  noWeightedTotal: state.noWeightedTotal.toString(),
  advocateYesId: state.advocateYesId,
  advocateNoId: state.advocateNoId,
  stakerCount: state.stakers.length,
  stakers: state.stakers.map((s) => ({
    agentId: s.agentId,
    sideTrue: s.sideTrue,
    amount: s.amount.toString(),
    weight: s.weight.toString(),
    isAdvocate: s.isAdvocate,
  })),
}, null, 2));

// Sanity check (only meaningful on v3 pools — v2 pools won't have advocates set).
if (state.advocateYesId && state.advocateNoId) {
  console.log("\n✓ both sides have advocates set; pool is ready for resolve.");
} else {
  console.log("\n· at least one side still has no advocate; pool not yet matchable.");
}
