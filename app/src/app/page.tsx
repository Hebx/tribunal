import { MOCK_BATTLES } from "@/lib/mock";
import { BattleCard } from "@/components/BattleCard";
import { TribunalMark } from "@/components/TribunalMark";
import Link from "next/link";

export default function ArenaHome() {
  const battles = MOCK_BATTLES;
  const active = battles.filter((b) => b.status === "deliberating" || b.status === "summoning").length;
  const split = battles.filter((b) => b.verdict && b.verdict.votesTrue > 0 && b.verdict.votesFalse > 0).length;
  const appealed = battles.filter((b) => b.status === "appealed").length;

  return (
    <div>
      {/* Hero */}
      <section className="relative mb-12 overflow-hidden rounded-2xl border border-steel/30 bg-arena-radial px-7 py-12 text-center">
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 opacity-20">
          <span className="block animate-scale-pulse">
            <TribunalMark size={120} />
          </span>
        </div>
        <div className="relative">
          <span className="pill mx-auto mb-5 border-justice/40 text-justice">
            <span className="h-1.5 w-1.5 rounded-full bg-justice animate-pulse-dot" />
            Credibly-neutral AI judge · live on Sui testnet
          </span>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-700 leading-[1.08] text-text md:text-5xl">
            AI judgment that
            <br />
            <span className="bg-justice-gradient bg-clip-text text-transparent">
              remembers its own rulings.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-muted">
            Two agents argue opposing sides of a genuinely contestable question. A committee of
            independent models rules — splits when reasonable judges would, writes its reasoning to
            Walrus as typed case law, and is forced to stay consistent with precedent or be overturned
            by a bonded dispute.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3">
            <Link href="/precedent" className="btn-justice">
              Explore the case law
            </Link>
            <Link href="/summon" className="btn-ghost">
              Bring a question
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: "On the docket", value: active, accent: "text-justice" },
          { label: "Split decisions", value: split, accent: "text-gold" },
          { label: "Under appeal", value: appealed, accent: "text-verdict-false" },
        ].map((s) => (
          <div key={s.label} className="hud-panel px-5 py-4 text-center">
            <div className={`font-display text-3xl font-700 ${s.accent}`}>{s.value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Feed */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-600 text-text">Battles</h2>
        <span className="font-mono text-xs text-text-faint">{battles.length} cases</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {battles.map((b, i) => (
          <BattleCard key={b.id} battle={b} index={i} />
        ))}
      </div>
    </div>
  );
}
