"use client";

// AuditTrail — the v3 audit-trail panel that hangs off the verdict bundle.
//
// Renders the Walrus Quilt as a list of typed entries with:
//   - kind label + sealed-vs-public badge
//   - copyable patch identifier (so a reader can fetch the entry independently
//     of this UI via `<aggregator>/v1/blobs/by-quilt-patch-id/<patchId>`)
//   - configHash chips so a reader can confirm the prompt version inline
//   - the provenance entry, when present, expanded into a structured block
//     (advocates, backers, jurors, jury seed, models, gateway)
//
// Sealed entries (debate_transcript, jury_deliberation) show the lock badge
// and a "settle the case to unseal" hint — the bytes are reachable on Walrus
// but encrypted at rest until on-chain settlement.

import type { ReactNode } from "react";

export interface AuditEntry {
  kind: string;
  patchId: string;
  /** Optional plain-text preview (we render confidential kinds without text). */
  preview?: string;
}

export interface ProvenanceAdvocate {
  agentCardId: string;
  archetypeId: string;
  personaHash: string;
  score: number;
  isFirstStaker: true;
  amount: string;
  weight: string;
}

export interface ProvenanceJuror {
  agentCardId: string;
  archetypeId: string;
  personaHash: string;
  score: number;
}

export interface AuditProvenance {
  caseId: string;
  poolId: string;
  advocates: { affirmer: ProvenanceAdvocate; denier: ProvenanceAdvocate };
  backers: {
    yes: Array<{ agentCardId: string; amount: string; weight: string }>;
    no: Array<{ agentCardId: string; amount: string; weight: string }>;
  };
  jurors: ProvenanceJuror[];
  jurySelection: { seed: string; fallbackUsed: boolean };
  models: { advocate: string; jury: string; guardrail: string };
  configHashes: { resolver: string; guardrail: string };
  gateway: { base: string; temperatures: { advocate: number; jury: number; guardrail: number } };
  decidedAt: number;
  resolverCommit: string;
}

export interface AuditTrailProps {
  /** Walrus quilt id (content-addressed). */
  quiltId: string;
  /** kind → patch identifier map. Patch ids resolve via aggregator. */
  patches: Record<string, string>;
  /** Walrus aggregator base used for "open patch" links. */
  aggregator: string;
  /** Settled flag — controls whether sealed entries advertise "decryptable now". */
  settled: boolean;
  /** Provenance entry expanded inline (when persisted). */
  provenance?: AuditProvenance;
  /** Failure message — when persist failed. */
  error?: string;
}

const SEALED_KINDS = new Set(["debate_transcript", "jury_deliberation"]);

const KIND_LABEL: Record<string, string> = {
  debate_transcript: "Debate transcript",
  jury_deliberation: "Jury deliberation",
  guardrail_decision: "Guardrail decision",
  verdict: "Verdict",
  case_law: "Case law",
  provenance: "Provenance",
};

function shortId(id: string, n = 12): string {
  if (id.length <= n) return id;
  return `${id.slice(0, n)}…`;
}

function patchUrl(aggregator: string, patchId: string): string {
  // Walrus aggregator patch read endpoint.
  return `${aggregator.replace(/\/$/, "")}/v1/blobs/by-quilt-patch-id/${encodeURIComponent(patchId)}`;
}

function EntryRow({
  kind,
  patchId,
  aggregator,
  settled,
}: {
  kind: string;
  patchId: string;
  aggregator: string;
  settled: boolean;
}) {
  const sealed = SEALED_KINDS.has(kind);
  const label = KIND_LABEL[kind] ?? kind;
  return (
    <li className="flex flex-col gap-1 border-b border-steel/15 pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[12px] text-text">{label}</span>
        {sealed ? (
          <span
            className="pill border-text-faint/40 text-text-faint"
            title={settled ? "sealed at rest; decryptable now that case is settled" : "sealed until case settles"}
          >
            🔒 {settled ? "sealed · settled" : "sealed until settle"}
          </span>
        ) : (
          <span className="pill border-verdict-true/40 text-verdict-true">public</span>
        )}
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] text-text-faint">
        <span>patch · {shortId(patchId, 16)}</span>
        <a
          href={patchUrl(aggregator, patchId)}
          target="_blank"
          rel="noreferrer"
          className="hover:text-justice"
        >
          ↗ open
        </a>
      </div>
    </li>
  );
}

function HashChip({ label, hash }: { label: string; hash: string }) {
  return (
    <span className="chip-mono" title={hash}>
      {label} · {shortId(hash, 16)}
    </span>
  );
}

function PersonaSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ left: ReactNode; right: ReactNode }>;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">
        {title}
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center justify-between gap-3 font-mono text-[11px]">
            <span className="text-text-muted">{r.left}</span>
            <span className="text-text">{r.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuditTrail({
  quiltId,
  patches,
  aggregator,
  settled,
  provenance,
  error,
}: AuditTrailProps) {
  // No quilt: persist failed or wasn't attempted.
  if (error) {
    return (
      <section className="hud-panel border-verdict-false/40 p-5">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
          Audit trail
        </div>
        <p className="text-sm text-verdict-false">
          Walrus persistence failed: {error}
        </p>
        <p className="mt-2 text-[12px] text-text-muted">
          The verdict still anchors on-chain via configHashHex + guardrailConfigHash.
          Re-run resolve once Walrus is reachable to mint the trail.
        </p>
      </section>
    );
  }

  const entries: AuditEntry[] = Object.entries(patches).map(([kind, patchId]) => ({
    kind,
    patchId,
  }));

  return (
    <section className="hud-panel p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            Audit trail
          </div>
          <p className="font-mono text-[10px] text-text-faint">
            quilt · {shortId(quiltId, 16)} · {entries.length} typed entries
          </p>
        </div>
      </div>

      <ul className="mb-5 space-y-3">
        {entries.map((e) => (
          <EntryRow
            key={e.patchId}
            kind={e.kind}
            patchId={e.patchId}
            aggregator={aggregator}
            settled={settled}
          />
        ))}
      </ul>

      {provenance && (
        <div className="space-y-4 border-t border-steel/15 pt-4">
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            Provenance
          </div>

          {/* Hash chips: prove the prompts + model map this verdict was produced under */}
          <div className="flex flex-wrap gap-2">
            <HashChip label="resolver" hash={provenance.configHashes.resolver} />
            <HashChip label="guardrail" hash={provenance.configHashes.guardrail} />
            {provenance.resolverCommit && (
              <span className="chip-mono">commit · {provenance.resolverCommit.slice(0, 7)}</span>
            )}
          </div>

          {/* Advocates */}
          <PersonaSection
            title="Advocates (first stakers)"
            rows={[
              {
                left: (
                  <>
                    affirmer ·{" "}
                    <span className="text-text-faint">{provenance.advocates.affirmer.archetypeId}</span>
                  </>
                ),
                right: (
                  <>
                    {shortId(provenance.advocates.affirmer.agentCardId, 12)} · score{" "}
                    {provenance.advocates.affirmer.score} · weight{" "}
                    {provenance.advocates.affirmer.weight}
                  </>
                ),
              },
              {
                left: (
                  <>
                    denier ·{" "}
                    <span className="text-text-faint">{provenance.advocates.denier.archetypeId}</span>
                  </>
                ),
                right: (
                  <>
                    {shortId(provenance.advocates.denier.agentCardId, 12)} · score{" "}
                    {provenance.advocates.denier.score} · weight{" "}
                    {provenance.advocates.denier.weight}
                  </>
                ),
              },
            ]}
          />

          {/* Backers */}
          {(provenance.backers.yes.length > 0 || provenance.backers.no.length > 0) && (
            <PersonaSection
              title="Backers"
              rows={[
                ...provenance.backers.yes.map((b) => ({
                  left: <>YES backer</>,
                  right: (
                    <>
                      {shortId(b.agentCardId, 12)} · amount {b.amount} · weight {b.weight}
                    </>
                  ),
                })),
                ...provenance.backers.no.map((b) => ({
                  left: <>NO backer</>,
                  right: (
                    <>
                      {shortId(b.agentCardId, 12)} · amount {b.amount} · weight {b.weight}
                    </>
                  ),
                })),
              ]}
            />
          )}

          {/* Jurors */}
          <PersonaSection
            title={`Jurors (seed ${shortId(provenance.jurySelection.seed, 10)}${provenance.jurySelection.fallbackUsed ? " · diversity fallback" : ""})`}
            rows={provenance.jurors.map((j) => ({
              left: <>{j.archetypeId}</>,
              right: (
                <>
                  {shortId(j.agentCardId, 12)} · score {j.score}
                </>
              ),
            }))}
          />

          {/* Models + gateway */}
          <PersonaSection
            title="Models · gateway"
            rows={[
              {
                left: <>advocate</>,
                right: (
                  <>
                    {provenance.models.advocate} · T={provenance.gateway.temperatures.advocate}
                  </>
                ),
              },
              {
                left: <>jury</>,
                right: (
                  <>
                    {provenance.models.jury} · T={provenance.gateway.temperatures.jury}
                  </>
                ),
              },
              {
                left: <>guardrail</>,
                right: (
                  <>
                    {provenance.models.guardrail} · T={provenance.gateway.temperatures.guardrail}
                  </>
                ),
              },
            ]}
          />

          <div className="font-mono text-[10px] text-text-faint">
            decided · {new Date(provenance.decidedAt).toISOString()}
          </div>
        </div>
      )}
    </section>
  );
}
