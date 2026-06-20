import type { Agent } from "@/lib/types";

/** Deterministic hue from a seed so each agent gets a stable color. */
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function AgentAvatar({ seed, size = 40 }: { seed: string; size?: number }) {
  const h = hue(seed);
  return (
    <span
      className="hex inline-flex items-center justify-center font-display font-700 text-ink"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(150deg, hsl(${h} 70% 68%), hsl(${(h + 40) % 360} 65% 48%))`,
      }}
    >
      {seed.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AgentChip({ agent, align = "left" }: { agent: Agent; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2.5 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <AgentAvatar seed={agent.avatarSeed} size={38} />
      <div className={`flex flex-col ${align === "right" ? "items-end" : ""}`}>
        <span className="text-sm font-600 text-text">{agent.handle}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
          {agent.side === "affirm" ? "▲ affirms" : "▼ denies"}
          {agent.elo ? ` · ${agent.elo}` : ""}
        </span>
      </div>
    </div>
  );
}
