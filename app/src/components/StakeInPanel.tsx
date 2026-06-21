"use client";

// Stake-in flow — wallet-signed opt-in PvP staking (v3 first-staker advocacy).
//
// A connected wallet picks one of their soulbound AgentCards, picks a side
// (YES or NO), and stakes SUI. The stake is locked in the case's StakePool
// until settlement; winners reclaim their principal plus a proportional share
// of the losing pool via the claim flow on the same page after settle.
//
// Notes:
//  - Anyone can create the StakePool for a case (anti-stall: front-end runs
//    create_pool the first time someone stakes on a case that has no pool yet).
//  - One agent per pool: the contract aborts on EAlreadyStaked.

import { useEffect, useState, useCallback } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useExecute } from "@/lib/useExecute";
import {
  buildCreateStakePool,
  buildStakeOnSide,
  buildClaimWinnings,
  findCreated,
} from "@/lib/tx";
import { PACKAGE_ID, EVENTS, explorerTx, explorerObject } from "@/lib/chain";

interface OwnedAgent {
  cardId: string;
  archetypeId: string;
  score: number;
}

interface StakeInPanelProps {
  caseId: string;
  /**
   * If known, the StakePool object id paired to this case. When omitted the
   * panel attempts to discover one via PoolCreated events and falls back to
   * offering to create_pool on first stake.
   */
  initialPoolId?: string | null;
}

const MIN_STAKE_SUI = 0.001;

function decodeBytes(value: unknown): string {
  if (Array.isArray(value)) return Buffer.from(value as number[]).toString("utf8");
  if (typeof value === "string") {
    return value.startsWith("0x")
      ? Buffer.from(value.slice(2), "hex").toString("utf8")
      : value;
  }
  return "";
}

export function StakeInPanel({ caseId, initialPoolId = null }: StakeInPanelProps) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { run, pending } = useExecute();

  const [agents, setAgents] = useState<OwnedAgent[]>([]);
  const [poolId, setPoolId] = useState<string | null>(initialPoolId);
  const [pickedAgent, setPickedAgent] = useState<string>("");
  const [side, setSide] = useState<boolean>(true);
  const [amountSui, setAmountSui] = useState<string>("0.01");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ digest: string; receiptId?: string } | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // 1) Load this wallet's AgentCards.
  const loadAgents = useCallback(async () => {
    if (!account?.address) return;
    setLoadingAgents(true);
    setError(null);
    try {
      const owned = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${PACKAGE_ID}::identity::AgentCard` },
        options: { showContent: true, showType: true },
      });
      const rows: OwnedAgent[] = (owned.data ?? [])
        .map((o: any) => {
          const fields = o.data?.content?.fields;
          if (!fields) return null;
          return {
            cardId: o.data.objectId,
            archetypeId: decodeBytes(fields.archetype_id),
            score: Number(fields.score ?? 0),
          } as OwnedAgent;
        })
        .filter(Boolean) as OwnedAgent[];
      setAgents(rows);
      if (rows.length && !pickedAgent) setPickedAgent(rows[0].cardId);
    } catch (e: any) {
      setError(`Could not load your agents: ${String(e?.message ?? e)}`);
    } finally {
      setLoadingAgents(false);
    }
  }, [account?.address, client, pickedAgent]);

  // 2) Discover the StakePool for this case via PoolCreated events.
  const discoverPool = useCallback(async () => {
    if (poolId) return;
    try {
      const evts: any = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}${EVENTS.PoolCreated}` },
        limit: 50,
        order: "descending",
      });
      const hit = (evts.data ?? []).find((ev: any) => ev.parsedJson?.case_id === caseId);
      if (hit) setPoolId(hit.parsedJson.pool_id);
    } catch {
      // best-effort
    }
  }, [client, caseId, poolId]);

  useEffect(() => {
    loadAgents();
    discoverPool();
  }, [loadAgents, discoverPool]);

  const amountMist = (() => {
    const n = Number(amountSui);
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.floor(n * 1_000_000_000));
  })();

  const canStake =
    !!account &&
    !!pickedAgent &&
    !pending &&
    amountMist !== null &&
    Number(amountSui) >= MIN_STAKE_SUI;

  async function ensurePool(): Promise<string> {
    if (poolId) return poolId;
    const tx = buildCreateStakePool(caseId);
    const res = await run(tx);
    const newPool = findCreated(res, "::stake::StakePool");
    if (!newPool) throw new Error("StakePool not created");
    setPoolId(newPool);
    return newPool;
  }

  async function onStake() {
    setError(null);
    setSuccess(null);
    try {
      const pool = await ensurePool();
      if (!amountMist) throw new Error("invalid amount");
      const tx = buildStakeOnSide(pool, pickedAgent, side, amountMist);
      const res = await run(tx);
      const receiptId = findCreated(res, "::stake::StakeReceipt");
      setSuccess({ digest: res.digest, receiptId });
      // remove the agent from the pickable list (one stake per pool)
      setAgents((xs) => xs.filter((a) => a.cardId !== pickedAgent));
      setPickedAgent("");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  // Optional: claim any prior StakeReceipts the wallet still holds for this case.
  const [claimReceiptId, setClaimReceiptId] = useState("");
  async function onClaim() {
    setError(null);
    setSuccess(null);
    try {
      if (!poolId) throw new Error("no pool for this case yet");
      if (!claimReceiptId.startsWith("0x")) throw new Error("paste your StakeReceipt object id (0x…)");
      const tx = buildClaimWinnings(poolId, caseId, claimReceiptId.trim());
      const res = await run(tx);
      setSuccess({ digest: res.digest });
      setClaimReceiptId("");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  return (
    <div className="hud-panel p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-display text-sm font-700 text-text">Stake into this case</div>
          <p className="font-mono text-[11px] text-text-faint">
            Opt one of your agents in. Winners take the losing pool, pro-rata.
          </p>
        </div>
        {poolId ? (
          <a
            href={explorerObject(poolId)}
            target="_blank"
            rel="noreferrer"
            className="chip-mono hover:border-justice/60 hover:text-justice"
            title="StakePool on-chain"
          >
            pool {poolId.slice(0, 8)}… ↗
          </a>
        ) : (
          <span className="chip-mono text-text-faint">no pool yet</span>
        )}
      </div>

      {!account && (
        <p className="text-sm text-gold">Connect a wallet to stake.</p>
      )}

      {account && (
        <>
          {loadingAgents ? (
            <p className="text-sm text-text-muted">Loading your agents…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-text-muted">
              No AgentCards in this wallet.{" "}
              <a className="text-justice underline" href="/agents/new">
                Onboard an agent
              </a>{" "}
              first.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Agent picker */}
              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
                  Pick an agent
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {agents.map((a) => (
                    <button
                      key={a.cardId}
                      type="button"
                      onClick={() => setPickedAgent(a.cardId)}
                      className={`rounded-xl border p-3 text-left transition ${
                        pickedAgent === a.cardId
                          ? "border-justice bg-justice/10 shadow-glow"
                          : "border-steel/30 hover:border-steel"
                      }`}
                    >
                      <div className="font-mono text-xs text-text">{a.cardId.slice(0, 10)}…</div>
                      <div className="font-mono text-[10px] text-text-muted">
                        {a.archetypeId || "—"} · score {a.score}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Side + amount */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSide(true)}
                  className={`rounded-xl border p-3 text-center transition ${
                    side
                      ? "border-verdict-true bg-verdict-true/10 text-verdict-true"
                      : "border-steel/30 text-text-muted hover:border-steel"
                  }`}
                >
                  <div className="font-display text-sm font-700">YES (argue affirm)</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSide(false)}
                  className={`rounded-xl border p-3 text-center transition ${
                    !side
                      ? "border-verdict-false bg-verdict-false/10 text-verdict-false"
                      : "border-steel/30 text-text-muted hover:border-steel"
                  }`}
                >
                  <div className="font-display text-sm font-700">NO (argue deny)</div>
                </button>
              </div>

              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
                  Stake (SUI)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={MIN_STAKE_SUI}
                  value={amountSui}
                  onChange={(e) => setAmountSui(e.target.value)}
                  className="w-full rounded-xl border border-steel/30 bg-ink p-3 font-mono text-sm text-text outline-none focus:border-justice"
                />
                <p className="text-[11px] text-text-faint">
                  min {MIN_STAKE_SUI} SUI · stake locks until settlement
                </p>
              </div>

              <button
                type="button"
                disabled={!canStake}
                onClick={onStake}
                className="w-full rounded-xl bg-justice px-4 py-3 font-medium text-ink transition hover:bg-justice-deep disabled:opacity-40"
              >
                {pending ? "Signing…" : `Stake on ${side ? "YES" : "NO"}`}
              </button>
            </div>
          )}

          {/* Claim path — paste a receipt id (kept simple; auto-detection ships later) */}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-text-muted">
              Claim a prior stake
            </summary>
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={claimReceiptId}
                onChange={(e) => setClaimReceiptId(e.target.value)}
                placeholder="StakeReceipt object id (0x…)"
                className="w-full rounded-xl border border-steel/30 bg-ink p-2 font-mono text-xs text-text outline-none focus:border-justice"
              />
              <button
                type="button"
                onClick={onClaim}
                disabled={pending || !poolId}
                className="w-full rounded-xl border border-justice/40 px-3 py-2 text-sm text-justice hover:bg-justice/10 disabled:opacity-40"
              >
                {pending ? "Claiming…" : "Claim winnings"}
              </button>
              <p className="text-[11px] text-text-faint">
                Case must be settled. Winners receive principal + share of the losing pool; losers
                lose their stake.
              </p>
            </div>
          </details>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-verdict-false/40 bg-verdict-false/5 p-3 text-sm text-verdict-false">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-3 rounded-xl border border-justice/40 bg-justice/5 p-3 text-sm">
          <div className="font-medium text-justice">Submitted</div>
          <a
            className="block text-text-muted underline"
            href={explorerTx(success.digest)}
            target="_blank"
            rel="noreferrer"
          >
            tx {success.digest.slice(0, 12)}… ↗
          </a>
          {success.receiptId && (
            <a
              className="block text-text-muted underline"
              href={explorerObject(success.receiptId)}
              target="_blank"
              rel="noreferrer"
            >
              receipt {success.receiptId.slice(0, 12)}… ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
