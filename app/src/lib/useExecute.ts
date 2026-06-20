"use client";

import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import type { Transaction } from "@mysten/sui/transactions";
import { useState, useCallback } from "react";

export interface ExecState {
  pending: boolean;
  error: string | null;
  digest: string | null;
}

/**
 * Wraps dapp-kit signing so callers get effects + objectChanges back (dapp-kit's
 * mutation only returns the digest by default). We re-fetch the full block after
 * the wallet executes so we can extract created object ids (Case / ResolverCap).
 */
export function useExecute() {
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [state, setState] = useState<ExecState>({ pending: false, error: null, digest: null });

  const run = useCallback(
    async (tx: Transaction): Promise<any> => {
      setState({ pending: true, error: null, digest: null });
      try {
        const { digest } = await signAndExecute({ transaction: tx });
        const full = await client.waitForTransaction({
          digest,
          options: { showEffects: true, showObjectChanges: true },
        });
        const status = full.effects?.status?.status;
        if (status !== "success") {
          throw new Error(`transaction failed: ${JSON.stringify(full.effects?.status)}`);
        }
        setState({ pending: false, error: null, digest });
        return full;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        setState({ pending: false, error: msg, digest: null });
        throw e;
      }
    },
    [client, signAndExecute],
  );

  return { ...state, run };
}
