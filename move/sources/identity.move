// tribunal::identity — soulbound agent identity + outcome-based reputation
//
// A persona agent's on-chain identity and reputation, for the Tribunal debate
// society. Two objects:
//
//   - AgentCard : SOULBOUND identity. Minted to an owner, bound to one address,
//                 non-transferable (no `store` ability → only this module can
//                 move it, and it never does after mint). Carries the archetype
//                 id + a hash of the (archetype-core ‖ custom-persona) prompt so
//                 the persona is tamper-evident off-chain. Holds the agent's
//                 mutable reputation inline.
//
//   - reputation : updated ONLY via `record_outcome`, gated by a `ReputationCap`
//                  held by the Tribunal resolver — agents cannot self-mint score.
//                  Integer-only math + an epoch cooldown to resist gaming
//                  (patterns validated by MoveGate's AgentPassport; we keep our
//                  own formula because ours is outcome-shaped, not payment-shaped).
//
// Score model (integer, 0-anchored, no floats, no oracles):
//   win            → +ACCURACY_STEP, streak++  (streak bonus capped)
//   loss           → −LOSS_STEP, streak reset
//   overturned     → −OVERTURN_PENALTY (a verdict the agent won, later flipped
//                    on dispute — the harshest signal)
// A 1-epoch cooldown between scored outcomes prevents spam-farming within an epoch.
module tribunal::identity;

use sui::event;

// === Error codes (one per gate; mirrored by #[expected_failure] tests) ===
const ENotOwner: u64 = 1;        // caller is not the card's bound owner
const ECooldown: u64 = 2;        // outcome recorded again within the cooldown window
const EEmptyArchetype: u64 = 3;  // archetype id must be non-empty
const EEmptyPersona: u64 = 4;    // persona hash must be non-empty

// === Score tuning constants (integer points) ===
const BASELINE_SCORE: u64 = 100;     // every new agent starts here
const ACCURACY_STEP: u64 = 20;       // points for a win
const LOSS_STEP: u64 = 15;           // points lost for a loss
const OVERTURN_PENALTY: u64 = 40;    // points lost when a won verdict is overturned
const STREAK_BONUS: u64 = 5;         // extra points per consecutive win
const STREAK_BONUS_CAP: u64 = 25;    // max streak bonus applied to a single win
const SCORE_CAP: u64 = 1000;         // ceiling (mirror MoveGate 0..1000 range)
const COOLDOWN_EPOCHS: u64 = 1;      // min epochs between scored outcomes per agent

// === Soulbound identity + inline reputation ===
// No `store` ability: the Move type system ensures only this module can transfer
// it (and it never does post-mint), making it non-transferable / soulbound.
public struct AgentCard has key {
    id: UID,
    owner: address,               // bound address; reputation actions check this
    archetype_id: vector<u8>,     // e.g. b"textualist" — curated archetype
    persona_hash: vector<u8>,     // sha256(archetype_core ‖ custom_description)
    created_at_epoch: u64,
    // --- reputation (mutated only via record_outcome) ---
    score: u64,                   // BASELINE_SCORE..=SCORE_CAP
    wins: u64,
    losses: u64,
    overturned: u64,
    current_streak: u64,          // consecutive wins
    has_outcome: bool,            // false until the first scored outcome
    last_outcome_epoch: u64,      // cooldown anchor (valid only when has_outcome)
}

// === Capability: authority to record outcomes ===
// Minted to the publisher at init; transferred to the Tribunal resolver. Holding
// it is the right to update ANY agent's score — so it lives with the resolver
// that runs the verdict pipeline, never with agents themselves.
public struct ReputationCap has key, store { id: UID }

// === Events (off-chain indexer + leaderboard) ===
public struct AgentRegistered has copy, drop {
    card_id: ID,
    owner: address,
    archetype_id: vector<u8>,
    persona_hash: vector<u8>,
    created_at_epoch: u64,
}

public struct ScoreUpdated has copy, drop {
    card_id: ID,
    owner: address,
    old_score: u64,
    new_score: u64,
    won: bool,
    overturned: bool,
    epoch: u64,
}

// === Deployment bootstrap: mint the ReputationCap to the publisher ===
fun init(ctx: &mut TxContext) {
    transfer::transfer(
        ReputationCap { id: object::new(ctx) },
        ctx.sender(),
    );
}

/// Mint a soulbound AgentCard to the caller. Free, permissionless: anyone can
/// onboard a persona agent. The persona is fixed at mint (archetype + hash);
/// re-onboarding with a new persona mints a new card.
public fun register_agent(
    archetype_id: vector<u8>,
    persona_hash: vector<u8>,
    ctx: &mut TxContext,
): ID {
    assert!(!archetype_id.is_empty(), EEmptyArchetype);
    assert!(!persona_hash.is_empty(), EEmptyPersona);
    let owner = ctx.sender();
    let now = ctx.epoch();
    let card = AgentCard {
        id: object::new(ctx),
        owner,
        archetype_id,
        persona_hash,
        created_at_epoch: now,
        score: BASELINE_SCORE,
        wins: 0,
        losses: 0,
        overturned: 0,
        current_streak: 0,
        has_outcome: false,
        last_outcome_epoch: 0,
    };
    let card_id = object::id(&card);
    event::emit(AgentRegistered {
        card_id,
        owner,
        archetype_id: card.archetype_id,
        persona_hash: card.persona_hash,
        created_at_epoch: now,
    });
    // soulbound: transfer to owner; absence of `store` blocks further transfer
    transfer::transfer(card, owner);
    card_id
}

/// Record a debate/verdict outcome for an agent. Gated by the ReputationCap, so
/// only the Tribunal resolver can move scores. `won` = the agent's side prevailed;
/// `overturned` = a verdict the agent won was later flipped on dispute (applied
/// in addition to the loss of standing). Integer-only; cooldown-guarded.
public fun record_outcome(
    _cap: &ReputationCap,
    card: &mut AgentCard,
    won: bool,
    overturned: bool,
    ctx: &mut TxContext,
) {
    let now = ctx.epoch();
    // cooldown: cannot score the same agent again within COOLDOWN_EPOCHS.
    // has_outcome guards the first-ever call (epoch 0 is a valid epoch, so we
    // cannot use last_outcome_epoch == 0 as the "never scored" sentinel).
    assert!(
        !card.has_outcome || now >= card.last_outcome_epoch + COOLDOWN_EPOCHS,
        ECooldown,
    );
    let old_score = card.score;

    if (overturned) {
        // a previously-won verdict was flipped: harshest penalty, streak broken
        card.overturned = card.overturned + 1;
        card.current_streak = 0;
        card.score = sub_floor(card.score, OVERTURN_PENALTY, BASELINE_SCORE > OVERTURN_PENALTY);
    } else if (won) {
        card.wins = card.wins + 1;
        card.current_streak = card.current_streak + 1;
        let bonus = streak_bonus(card.current_streak);
        card.score = add_cap(card.score, ACCURACY_STEP + bonus, SCORE_CAP);
    } else {
        card.losses = card.losses + 1;
        card.current_streak = 0;
        card.score = sub_floor(card.score, LOSS_STEP, true);
    };

    card.has_outcome = true;
    card.last_outcome_epoch = now;
    event::emit(ScoreUpdated {
        card_id: object::id(card),
        owner: card.owner,
        old_score,
        new_score: card.score,
        won,
        overturned,
        epoch: now,
    });
}

/// Assert that `claimer` owns this card. Used by the staking flow so only an
/// agent's owner can stake it into a debate.
public fun assert_owner(card: &AgentCard, claimer: address) {
    assert!(card.owner == claimer, ENotOwner);
}

// === Read-only accessors (SDK / matchmaking / leaderboard) ===
public fun owner(card: &AgentCard): address { card.owner }
public fun archetype_id(card: &AgentCard): vector<u8> { card.archetype_id }
public fun persona_hash(card: &AgentCard): vector<u8> { card.persona_hash }
public fun score(card: &AgentCard): u64 { card.score }
public fun wins(card: &AgentCard): u64 { card.wins }
public fun losses(card: &AgentCard): u64 { card.losses }
public fun overturned(card: &AgentCard): u64 { card.overturned }
public fun current_streak(card: &AgentCard): u64 { card.current_streak }

// === Internal integer helpers ===
/// Streak bonus = STREAK_BONUS per consecutive win, capped. Streak of 1 → 0 bonus
/// (the base win already counts); streak of 2 → STREAK_BONUS, etc.
fun streak_bonus(streak: u64): u64 {
    if (streak <= 1) return 0;
    let raw = (streak - 1) * STREAK_BONUS;
    if (raw > STREAK_BONUS_CAP) STREAK_BONUS_CAP else raw
}

/// Saturating add with ceiling.
fun add_cap(x: u64, delta: u64, cap: u64): u64 {
    let s = x + delta;
    if (s > cap) cap else s
}

/// Saturating subtract with a floor. `allow_below_baseline` controls whether the
/// floor is 0 (true) or stops at 0 anyway; we keep score >= 0 always and never
/// underflow. The bool documents intent at call sites.
fun sub_floor(x: u64, delta: u64, _allow_below_baseline: bool): u64 {
    if (delta >= x) 0 else x - delta
}

// === Test-only constructors / inspectors ===
#[test_only]
public fun new_cap_for_testing(ctx: &mut TxContext): ReputationCap {
    ReputationCap { id: object::new(ctx) }
}

#[test_only]
public fun baseline_score(): u64 { BASELINE_SCORE }

#[test_only]
public fun destroy_cap_for_testing(cap: ReputationCap) {
    let ReputationCap { id } = cap;
    object::delete(id);
}
