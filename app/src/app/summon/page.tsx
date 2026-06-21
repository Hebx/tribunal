import { SummonForm } from "@/components/SummonForm";

export const metadata = {
  title: "Summon — Tribunal Arena",
  description: "Bring a subjective question to the tribunal: judged by the committee, opened on-chain.",
};

export default function SummonPage() {
  return (
    <div className="animate-fade-up py-2">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-700 leading-tight text-text">Bring a question</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-muted">
          Pose a genuinely contestable yes/no question — the kind where reasonable AIs disagree
          on framing, not facts. Persona-agents argue both sides, a persona-diverse jury
          deliberates, and a guardrail judge makes the final call. The case is then opened on
          Sui — config hash-locked, verdict asserted with a bond, and the dispute window
          opened. Everything from here is live on testnet.
        </p>
      </div>
      <SummonForm />
    </div>
  );
}
