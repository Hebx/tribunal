"use client";

// Hash / address renderers.
//
// Tribunal identities (Sui object ids, persona hashes, digests) ARE the
// data — abbreviating them in the UI lies about provenance. These render
// the full string in a monospaced row with a copy button and an optional
// explorer link. `HashChip` is a compact variant for inline tags.

import { useState } from "react";

interface FullHashProps {
  value: string;
  /** Label shown above the value (e.g. "owner", "persona hash"). */
  label?: string;
  /** Optional explorer URL — when set the value is also a link. */
  href?: string;
  /** Optional className override on the wrapper. */
  className?: string;
}

export function FullHash({ value, label, href, className = "" }: FullHashProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — silent */
    }
  }
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
          {label}
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-[11px] leading-relaxed text-text-muted hover:text-justice"
            title="open in explorer"
          >
            {value}
          </a>
        ) : (
          <span className="break-all font-mono text-[11px] leading-relaxed text-text-muted">
            {value}
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-steel/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-faint hover:border-justice/60 hover:text-justice"
          title="copy"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

/** Compact inline chip — full value as title, copy on click. */
export function HashChip({
  value,
  label,
  href,
}: {
  value: string;
  label?: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onClick(e: React.MouseEvent) {
    if (href) return; // let the anchor handle it
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* silent */
    }
  }
  const body = (
    <span className="chip-mono" title={value}>
      {label ? <span className="text-text-faint">{label} </span> : null}
      <span className="text-text">{copied ? "copied" : value}</span>
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="hover:opacity-80">
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className="hover:opacity-80">
      {body}
    </button>
  );
}
