// Task 0.1 + 0.2 probe — resolve the v2 StakePool object id from the
// create_pool digest, then read its content shape and a Staked event payload.
//
// Decision gate inputs:
//   - branch A : pool.content carries staked_agents + per-side totals cleanly
//   - branch B : need to walk Staked events for side/agent payload
//   - branch C : neither works — re-design

import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const PKG = "0x2c8697803b3eec5b8e0e0391a4f1dacb0760a904ed67add840d94452b1cd3750";
const POOL_CREATE_DIGEST = "GxKEKvk2WQ99GMNkKGtRq5Hjx4k5AEf5VAMZXQAGeogf";

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });

console.log("=== Task 0.1 probe ===");
const tx = await client.getTransactionBlock({
  digest: POOL_CREATE_DIGEST,
  options: { showObjectChanges: true },
});

const created = (tx.objectChanges ?? []).filter(
  (c: { type: string; objectType?: string }) =>
    c.type === "created" && typeof c.objectType === "string" && c.objectType.includes("::stake::StakePool"),
);

if (created.length === 0) {
  console.error("No StakePool created in this digest");
  process.exit(2);
}

const poolId = (created[0] as { objectId: string }).objectId;
const poolType = (created[0] as { objectType: string }).objectType;
console.log("StakePool id:    ", poolId);
console.log("StakePool type:  ", poolType);

const obj = await client.getObject({ id: poolId, options: { showContent: true, showType: true } });
console.log("\n--- pool.content ---");
console.log(JSON.stringify(obj.data?.content, null, 2));

console.log("\n=== Task 0.2 probe (Staked event shape) ===");
const ev = await client.queryEvents({
  query: { MoveEventType: `${PKG}::stake::Staked` },
  limit: 5,
});
console.log("event count:", ev.data.length);
console.log(JSON.stringify(ev.data.map((e) => e.parsedJson), null, 2));
