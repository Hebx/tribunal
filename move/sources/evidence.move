// tribunal::evidence — Walrus anchor + on-chain certification + Seal-gated access
//
// Every verdict's rationale + evidence bundle lives off-chain as a Walrus blob.
// On-chain we keep an `ArtifactRef` (blob id + content hash + Seal flag + storage
// epoch) so the verdict is tamper-evident and auditable. The `ArtifactRef` struct
// is lifted from the proven `synapse_patterns_probe::register_artifact` pattern.
//
// Two trust hooks are declared here as M1 stubs and wired to real Walrus/Seal
// packages in M2:
//   - assert_certified : read the Walrus `Blob` Sui object and confirm it reached
//                        Point-of-Availability (certified, not expired) BEFORE a
//                        verdict's evidence is trusted on-chain. Stronger than a
//                        bare hash — the chain proves availability (Walrus cert #3).
//   - seal_approve     : Seal decryption policy. Gates who may decrypt sealed
//                        evidence/memory fields. MUST gate on STABLE facts only
//                        (case participation, disputer standing) — Seal is not
//                        evaluated atomically across key servers.
module tribunal::evidence;

// === Error codes ===
const EBlobExpired: u64 = 1;      // Walrus storage epoch already passed
const ENotCertified: u64 = 2;     // blob has not reached Point-of-Availability

/// On-chain anchor to an off-chain Walrus blob holding the verdict rationale +
/// evidence bundle. `copy, drop, store` so it can be embedded in a `Case` and
/// passed by value into `assert_resolution`.
public struct ArtifactRef has copy, drop, store {
    blob_id: vector<u8>,   // Walrus blob id (content-addressed)
    sha256: vector<u8>,    // content hash — tamper-evidence
    sealed: bool,          // true if private fields are Seal-encrypted
    epoch: u64,            // Walrus storage epoch (renewal / retention horizon)
}

/// Construct an `ArtifactRef`. Called by the off-chain evidence packager's
/// resolver client after it writes the bundle to Walrus.
public fun new_ref(
    blob_id: vector<u8>,
    sha256: vector<u8>,
    sealed: bool,
    epoch: u64,
): ArtifactRef {
    ArtifactRef { blob_id, sha256, sealed, epoch }
}

// === Read-only accessors (consumers / SDK / the case module) ===
public fun blob_id(a: &ArtifactRef): vector<u8> { a.blob_id }
public fun sha256(a: &ArtifactRef): vector<u8> { a.sha256 }
public fun is_sealed(a: &ArtifactRef): bool { a.sealed }
public fun epoch(a: &ArtifactRef): u64 { a.epoch }

/// Trust-minimized certification check.
///
/// M1: validates the ref is structurally sound and not past its storage epoch
/// against the current epoch (a hash-and-epoch gate the case lifecycle can rely
/// on today). M2 wires the real Walrus `Blob` Sui object so we confirm PoA
/// (certified status) on-chain, not just a hash. The signature is intentionally
/// shaped so the M2 upgrade is additive (pass the `Blob` object alongside).
public fun assert_certified(a: &ArtifactRef, current_epoch: u64) {
    assert!(!a.blob_id.is_empty(), ENotCertified);
    assert!(!a.sha256.is_empty(), ENotCertified);
    assert!(a.epoch >= current_epoch, EBlobExpired);
}

/// Seal access predicate (pure, testable without the Seal dependency).
///
/// Gates on STABLE facts only (Seal is not evaluated atomically across key
/// servers, so policy must not depend on tx-ordering-sensitive state):
///   - `settled`      : once a verdict is final it is PUBLICLY auditable — any
///                      party may decrypt the rationale/evidence (transparency).
///   - `is_resolver`  : before settlement, only the recorded committee operator
///                      (resolver) may decrypt the in-progress evidence.
/// Both inputs are terminal/monotonic for a given case, so the decision is
/// stable regardless of which key server evaluates it or when.
public fun can_decrypt(settled: bool, is_resolver: bool): bool {
    settled || is_resolver
}

/// True if `prefix` is a prefix of `word`. Used to bind a Seal identity to a
/// case's memory namespace (`memory_ns ‖ entry_id`), so one namespace can cover
/// many sealed entries while every identity still maps to exactly one case.
public fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) return false;
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != word[i]) return false;
        i = i + 1;
    };
    true
}
