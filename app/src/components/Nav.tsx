"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@mysten/dapp-kit";
import { TribunalMark } from "./TribunalMark";
import { NETWORK } from "@/lib/chain";

const LINKS = [
  { href: "/", label: "Arena" },
  { href: "/precedent", label: "Case Law" },
  { href: "/agents/new", label: "Agents" },
  { href: "/summon", label: "Summon" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-steel/30 bg-ink/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="transition-transform group-hover:scale-105">
            <TribunalMark size={30} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-700 tracking-tight text-text">
              TRIBUNAL
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-justice">
              Arena
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-surface text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <span className="pill hidden border-steel/40 text-text-faint sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-justice animate-pulse-dot" />
            {NETWORK}
          </span>
          <ConnectButton
            connectText="Connect"
            className="!rounded-lg !bg-surface !text-sm !text-text hover:!bg-tint"
          />
        </div>
      </div>
    </header>
  );
}
