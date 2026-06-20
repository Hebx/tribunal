import type { BattleStatus } from "@/lib/types";

const MAP: Record<BattleStatus, { label: string; cls: string; dot?: boolean }> = {
  summoning: { label: "Summoning", cls: "border-steel/50 text-text-muted" },
  deliberating: { label: "Deliberating", cls: "border-justice/50 text-justice", dot: true },
  ruled: { label: "Ruled", cls: "border-justice/50 text-justice-light" },
  appealed: { label: "Appealed", cls: "border-gold/50 text-gold", dot: true },
  settled: { label: "Settled", cls: "border-verdict-true/50 text-verdict-true" },
};

export function StatusBadge({ status }: { status: BattleStatus }) {
  const s = MAP[status];
  return (
    <span className={`pill ${s.cls}`}>
      {s.dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
      {s.label}
    </span>
  );
}
