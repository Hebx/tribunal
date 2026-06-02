// tribunal::case — case object, config-hash lock, memory pointer, assertion + settlement
//
// The keystone of Tribunal. A `Case<T>` is a SHARED object: one per subjective
// question to be judged. It locks, at creation and forever:
//   - config_hash : sha256(model_id ‖ prompt ‖ data_sources) — the resolver must
//                   present matching raw config at settlement or the tx ABORTS.
//                   This makes the deciding AI tamper-evident.
//   - memory_ns   : the Walrus memory namespace this case's committee writes to
//                   (our own Walrus-backed verifiable-memory layer; the on-chain
//                   object is the source of truth for *which* memory is this case).
//
// Authority is a non-copyable capability (the proven Sui idiom, lifted from
// synapse_patterns_probe::OwnerCap): `CaseCreatorCap` to create cases under a
// deployment, `ResolverCap` (bound to one case) to assert that case's outcome.
//
// Lifecycle (M1 implements Open → Asserted → Settled; Disputed lands in M2):
//   Open ──assert_resolution──▶ Asserted ──(liveness passes, undisputed)──▶ Settled{True|False}
//
// Liveness model (M1): epoch-based (ctx.epoch()), matching the proven probe and
// `ts::next_epoch` test flow. PRD §7 notes a Clock-based fast window for sub-hour
// demo settlement — that is an M3 demo-polish swap, not a core-lifecycle change.
module tribunal::case;

use std::hash;
use sui::balance::{Self, Balance};
use sui::coin;
use sui::event;
use tribunal::evidence::{Self, ArtifactRef};

// === Error codes (one per gate; mirrored by #[expected_failure] tests) ===
const EWrongCap: u64 = 1;        // ResolverCap does not match this case
const EConfigMismatch: u64 = 2;  // presented config != locked config_hash
const ENotOpen: u64 = 3;         // case is not in Open state
const ENotAsserted: u64 = 4;     // case is not in Asserted state
const ETooEarly: u64 = 5;        // resolution asserted before expiry_epoch
const ELivenessNotPassed: u64 = 6; // settle called before the challenge window closed
const EWindowClosed: u64 = 7;    // dispute filed after the liveness window closed

// === Lifecycle states ===
public enum CaseState has copy, drop, store {
    Open,            // created, awaiting resolution at/after expiry
    Asserted,        // resolver posted outcome + bond; liveness window open
    Disputed,        // a bonded disputer challenged; escalation in progress (M2)
    SettledTrue,
    SettledFalse,
}

// === Shared case object. One per subjective question. ===
// `T` is the bond asset type. It is PHANTOM: it only ever appears as the phantom
// argument to `Balance<phantom T>` / `Coin<phantom T>`, never in a non-phantom
// position — so `Case<phantom T>` has `key` unconditionally.
public struct Case<phantom T> has key {
    id: UID,
    question_hash: vector<u8>,        // sha256(question_text ‖ resolution_criteria)
    config_hash: vector<u8>,          // sha256(model_id ‖ prompt ‖ data_sources) — LOCKED
    memory_ns: vector<u8>,            // Walrus memory namespace for this case's committee
    state: CaseState,
    outcome_true: bool,               // meaningful only once Settled*
    evidence_ref: Option<ArtifactRef>,// Walrus anchor for verdict rationale + evidence
    resolver: Option<address>,        // who asserted (committee operator)
    resolver_bond: Balance<T>,        // escrow posted with the assertion
    expiry_epoch: u64,                // earliest epoch a resolution may be asserted
    liveness_epochs: u64,             // challenge window length (in epochs)
    asserted_at_epoch: u64,           // epoch the resolution was asserted
    consumer_id: Option<ID>,          // downstream object this resolves for
    fee_recipient: address,           // protocol-fee destination, locked at creation
}

// === Capabilities (authority as non-copyable objects) ===
/// Authority to create cases under this deployment.
public struct CaseCreatorCap has key, store { id: UID }

/// Per-case resolver authority, minted to the designated committee operator.
public struct ResolverCap has key, store { id: UID, case_id: ID }

// === Events (for the off-chain indexer + agent watchdogs) ===
public struct CaseCreated has copy, drop {
    case_id: ID, config_hash: vector<u8>, memory_ns: vector<u8>,
    expiry_epoch: u64, liveness_epochs: u64,
}
public struct ResolutionAsserted has copy, drop {
    case_id: ID, resolver: address, outcome_true: bool,
    evidence_blob: vector<u8>, memory_ns: vector<u8>,
    bond: u64, liveness_epochs: u64, asserted_at_epoch: u64,
}
public struct CaseSettled has copy, drop { case_id: ID, outcome_true: bool, disputed: bool }

// === Deployment bootstrap: mint the CaseCreatorCap to the publisher ===
fun init(ctx: &mut TxContext) {
    transfer::transfer(
        CaseCreatorCap { id: object::new(ctx) },
        ctx.sender(),
    );
}

/// Create a subjective-question case. `config_hash` + `memory_ns` are locked here
/// and never mutated. Shares the `Case`, returns its ID + the `ResolverCap`
/// (the PTB transfers the cap to the committee operator).
public fun create_case<T>(
    _cap: &CaseCreatorCap,
    question_hash: vector<u8>,
    config_hash: vector<u8>,
    memory_ns: vector<u8>,
    expiry_epoch: u64,
    liveness_epochs: u64,
    consumer_id: Option<ID>,
    ctx: &mut TxContext,
): (ID, ResolverCap) {
    let case = Case<T> {
        id: object::new(ctx),
        question_hash,
        config_hash,
        memory_ns,
        state: CaseState::Open,
        outcome_true: false,
        evidence_ref: option::none(),
        resolver: option::none(),
        resolver_bond: balance::zero<T>(),
        expiry_epoch,
        liveness_epochs,
        asserted_at_epoch: 0,
        consumer_id,
        fee_recipient: ctx.sender(),  // deployment authority = protocol-fee recipient
    };
    let case_id = object::id(&case);
    event::emit(CaseCreated {
        case_id,
        config_hash: case.config_hash,
        memory_ns: case.memory_ns,
        expiry_epoch,
        liveness_epochs,
    });
    let cap = ResolverCap { id: object::new(ctx), case_id };
    transfer::share_object(case);
    (case_id, cap)
}

/// Committee operator posts the outcome + evidence + bond.
/// `presented_config` MUST hash-match the locked `config_hash` or the tx ABORTS —
/// the resolver cannot silently swap the model/prompt/sources.
public fun assert_resolution<T>(
    case: &mut Case<T>,
    cap: &ResolverCap,
    presented_config: vector<u8>,   // raw (model_id ‖ prompt ‖ data_sources)
    outcome_true: bool,
    evidence_ref: ArtifactRef,
    bond: Balance<T>,
    ctx: &mut TxContext,
) {
    assert!(cap.case_id == object::id(case), EWrongCap);
    assert!(is_open(&case.state), ENotOpen);
    // config-hash lock: the deciding AI is tamper-evident
    assert!(hash::sha2_256(presented_config) == case.config_hash, EConfigMismatch);
    // cannot resolve before the question's expiry
    let now = ctx.epoch();
    assert!(now >= case.expiry_epoch, ETooEarly);

    let bond_value = balance::value(&bond);
    case.resolver_bond.join(bond);
    case.outcome_true = outcome_true;
    let evidence_blob = evidence_ref.blob_id();
    case.evidence_ref = option::some(evidence_ref);
    case.resolver = option::some(ctx.sender());
    case.asserted_at_epoch = now;
    case.state = CaseState::Asserted;

    event::emit(ResolutionAsserted {
        case_id: object::id(case),
        resolver: ctx.sender(),
        outcome_true,
        evidence_blob,
        memory_ns: case.memory_ns,
        bond: bond_value,
        liveness_epochs: case.liveness_epochs,
        asserted_at_epoch: now,
    });
}

/// Callable after the liveness window if the assertion was undisputed. Returns the
/// resolver bond to the resolver and marks the case Settled with the asserted
/// outcome. Aborts if the case is not Asserted or the window has not elapsed.
public fun settle<T>(case: &mut Case<T>, ctx: &mut TxContext) {
    assert!(is_asserted(&case.state), ENotAsserted);
    let now = ctx.epoch();
    assert!(now >= case.asserted_at_epoch + case.liveness_epochs, ELivenessNotPassed);

    // return the bond to the resolver
    let resolver_addr = *option::borrow(&case.resolver);
    let refund = case.resolver_bond.withdraw_all();
    transfer::public_transfer(coin::from_balance(refund, ctx), resolver_addr);

    case.state = if (case.outcome_true) { CaseState::SettledTrue } else { CaseState::SettledFalse };

    event::emit(CaseSettled {
        case_id: object::id(case),
        outcome_true: case.outcome_true,
        disputed: false,
    });
}

// === Read path for any downstream consumer / SDK ===
/// Returns (is_settled, outcome_true). `outcome_true` is meaningful only when
/// `is_settled` is true.
public fun get_resolution<T>(case: &Case<T>): (bool, bool) {
    (is_settled(&case.state), case.outcome_true)
}

public fun config_hash<T>(case: &Case<T>): vector<u8> { case.config_hash }
public fun memory_ns<T>(case: &Case<T>): vector<u8> { case.memory_ns }
public fun bond_value<T>(case: &Case<T>): u64 { balance::value(&case.resolver_bond) }
public fun consumer_id<T>(case: &Case<T>): Option<ID> { case.consumer_id }

/// True once the case has reached a terminal Settled state.
public fun is_resolved<T>(case: &Case<T>): bool { is_settled(&case.state) }

/// True while the case sits in the `Disputed` state.
public fun is_disputed<T>(case: &Case<T>): bool { is_disputed_state(&case.state) }

// === Seal access policy (the function Seal key servers call) ===
//
// Seal evaluates an `entry fun seal_approve*(id: vector<u8>, ...)` inside a
// dry-run PTB; if it does NOT abort, the t-of-n key servers release the
// decryption shares. We gate decryption of a case's sealed evidence/memory on
// STABLE facts only (skill §9 — Seal is not atomic across servers):
//   1. The Seal identity `id` must be prefixed by this case's `memory_ns`, so
//      a key released for one case can never decrypt another case's blobs.
//   2. Access is granted iff the case is SETTLED (verdict is public + auditable)
//      OR the caller is the recorded resolver (committee operator working the
//      in-progress case). Both are terminal/monotonic — never tx-order sensitive.
//
// `caller` is bound by Seal to the address that signed the personal-message
// session key, so passing it is sound (the key server verifies the signature
// before running this PTB).
const ENoAccess: u64 = 8;

entry fun seal_approve<T>(id: vector<u8>, caller: address, case: &Case<T>) {
    // identity must belong to this case's namespace
    assert!(evidence::is_prefix(case.memory_ns, id), ENoAccess);

    let settled = is_settled(&case.state);
    let is_resolver =
        option::is_some(&case.resolver) && *option::borrow(&case.resolver) == caller;

    assert!(evidence::can_decrypt(settled, is_resolver), ENoAccess);
}


// === Cross-module hooks for `tribunal::dispute` (package-internal) ===
// The dispute module lives in this package and needs to read/mutate Case state
// and move the escrowed bond. We expose narrow `public(package)` functions
// rather than making fields public, so the invariants stay enforced here.

/// Verify the resolver cap matches this case (package-internal reuse).
public(package) fun assert_cap_matches<T>(case: &Case<T>, cap: &ResolverCap) {
    assert!(cap.case_id == object::id(case), EWrongCap);
}

/// Abort unless the case is currently `Asserted` (a valid dispute target).
public(package) fun assert_asserted<T>(case: &Case<T>) {
    assert!(is_asserted(&case.state), ENotAsserted);
}

/// Abort unless `now` is still within the liveness window (dispute filing guard).
public(package) fun assert_within_window<T>(case: &Case<T>, now: u64) {
    assert!(now < case.asserted_at_epoch + case.liveness_epochs, EWindowClosed);
}

/// Move the case into the `Disputed` state. Caller (dispute module) is
/// responsible for the guards above.
public(package) fun mark_disputed<T>(case: &mut Case<T>) {
    case.state = CaseState::Disputed;
}

/// Withdraw the full escrowed resolver bond (dispute module redistributes it).
public(package) fun take_resolver_bond<T>(case: &mut Case<T>): Balance<T> {
    case.resolver_bond.withdraw_all()
}

/// Finalize a disputed case: set the (possibly flipped) outcome + Settled state
/// and emit `CaseSettled` with disputed=true. Called by `resolve_dispute`.
public(package) fun finalize_disputed<T>(case: &mut Case<T>, outcome_true: bool) {
    case.outcome_true = outcome_true;
    case.state = if (outcome_true) { CaseState::SettledTrue } else { CaseState::SettledFalse };
    event::emit(CaseSettled {
        case_id: object::id(case),
        outcome_true,
        disputed: true,
    });
}

/// Outcome currently recorded on the case (the resolver's asserted outcome until
/// a dispute flips it).
public(package) fun current_outcome<T>(case: &Case<T>): bool { case.outcome_true }

/// Resolver address recorded at assertion (bond / reward destination).
public(package) fun resolver_addr<T>(case: &Case<T>): address {
    *option::borrow(&case.resolver)
}

/// Protocol-fee destination locked at creation.
public(package) fun fee_recipient<T>(case: &Case<T>): address { case.fee_recipient }

// === State predicates (enum matching) ===
public fun is_open(s: &CaseState): bool {
    match (s) { CaseState::Open => true, _ => false }
}
public fun is_asserted(s: &CaseState): bool {
    match (s) { CaseState::Asserted => true, _ => false }
}
public fun is_disputed_state(s: &CaseState): bool {
    match (s) { CaseState::Disputed => true, _ => false }
}
public fun is_settled(s: &CaseState): bool {
    match (s) {
        CaseState::SettledTrue => true,
        CaseState::SettledFalse => true,
        _ => false,
    }
}

// === Test-only constructor for the CaseCreatorCap ===
#[test_only]
public fun new_creator_cap_for_testing(ctx: &mut TxContext): CaseCreatorCap {
    CaseCreatorCap { id: object::new(ctx) }
}

#[test_only]
public fun destroy_creator_cap_for_testing(cap: CaseCreatorCap) {
    let CaseCreatorCap { id } = cap;
    object::delete(id);
}
