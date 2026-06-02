// tribunal::dispute — bonded optimistic dispute + escalation
//
// Within an Asserted case's liveness window, any party may challenge the verdict
// by posting a bond that MATCHES the resolver's bond. This moves the case to
// Disputed and escrows the challenger's bond in a shared `Dispute` object.
//
// The committee re-votes off-chain (reading the case's Walrus memory namespace,
// writing the deliberation back as case law) and the ResolverCap holder submits
// the result via `resolve_dispute`:
//   - pot = resolver_bond + disputer_bond
//   - fee = pot * protocol_fee_bps / 10_000  → locked fee_recipient
//   - winner takes (pot - fee)
//   - if the original verdict is OVERTURNED, Case.outcome_true flips
//
// Economic security is pure bonded dispute — the resolver's own bond is the
// stake at risk. No external restaking dependency (deliberate Sui-native choice).
//
// Liveness is epoch-based for M1/M2 consistency (matches `ts::next_epoch` tests);
// the PRD §7 Clock-based fast window is an M3 demo-polish swap, not a core change.
module tribunal::dispute;

use sui::balance::{Self, Balance};
use sui::coin;
use sui::event;
use tribunal::case::{Self, Case, ResolverCap};

// === Error codes ===
const EBondMismatch: u64 = 1;     // disputer bond != resolver bond
const EWrongCase: u64 = 2;        // dispute does not belong to this case
const EAlreadyResolved: u64 = 3;  // dispute already resolved
const ENotDisputed: u64 = 4;      // case is not in the Disputed state
const EFeeTooHigh: u64 = 5;       // protocol_fee_bps exceeds 100%

const MAX_BPS: u64 = 10_000;      // 100% in basis points

// === Shared dispute object, created when someone challenges an assertion ===
public struct Dispute<phantom T> has key {
    id: UID,
    case_id: ID,
    disputer: address,
    disputer_bond: Balance<T>,
    raised_at_epoch: u64,
    resolved: bool,
    resolver_won: bool,
}

// === Events ===
public struct ResolutionDisputed has copy, drop {
    case_id: ID, dispute_id: ID, disputer: address, bond: u64,
}
public struct DisputeResolved has copy, drop {
    case_id: ID, dispute_id: ID, resolver_won: bool, payout: u64, fee: u64,
}

/// Challenge an `Asserted` case within its liveness window. The posted `bond`
/// MUST equal the resolver's escrowed bond, or the tx aborts. Moves the case to
/// `Disputed` and shares a new `Dispute` object holding the challenger's bond.
/// Permissionless: any bonded human or agent may dispute (no cap required).
public fun dispute_resolution<T>(
    case: &mut Case<T>,
    bond: Balance<T>,
    ctx: &mut TxContext,
): ID {
    case::assert_asserted(case);
    let now = ctx.epoch();
    case::assert_within_window(case, now);
    assert!(balance::value(&bond) == case::bond_value(case), EBondMismatch);

    case::mark_disputed(case);

    let bond_value = balance::value(&bond);
    let dispute = Dispute<T> {
        id: object::new(ctx),
        case_id: object::id(case),
        disputer: ctx.sender(),
        disputer_bond: bond,
        raised_at_epoch: now,
        resolved: false,
        resolver_won: false,
    };
    let dispute_id = object::id(&dispute);
    event::emit(ResolutionDisputed {
        case_id: object::id(case),
        dispute_id,
        disputer: ctx.sender(),
        bond: bond_value,
    });
    transfer::share_object(dispute);
    dispute_id
}

/// Submit the committee's re-vote result (ResolverCap-gated). Pays the full pot
/// (resolver bond + disputer bond) to the winner minus `protocol_fee_bps`; the
/// fee goes to the case's locked `fee_recipient`. If the original verdict is
/// overturned (`resolver_won == false`), the case outcome flips. Finalizes the
/// case to a Settled state.
public fun resolve_dispute<T>(
    case: &mut Case<T>,
    dispute: &mut Dispute<T>,
    cap: &ResolverCap,
    resolver_won: bool,
    protocol_fee_bps: u64,
    ctx: &mut TxContext,
) {
    case::assert_cap_matches(case, cap);
    assert!(dispute.case_id == object::id(case), EWrongCase);
    assert!(!dispute.resolved, EAlreadyResolved);
    assert!(case::is_disputed(case), ENotDisputed);
    assert!(protocol_fee_bps <= MAX_BPS, EFeeTooHigh);

    // gather the pot: resolver bond (from the case) + disputer bond (from here)
    let mut pot = case::take_resolver_bond(case);
    let disputer_bond = dispute.disputer_bond.withdraw_all();
    pot.join(disputer_bond);

    let pot_value = balance::value(&pot);
    let fee = pot_value * protocol_fee_bps / MAX_BPS;
    let payout = pot_value - fee;

    // protocol fee → locked fee_recipient
    if (fee > 0) {
        let fee_bal = pot.split(fee);
        transfer::public_transfer(coin::from_balance(fee_bal, ctx), case::fee_recipient(case));
    };

    // remainder → winner
    let winner = if (resolver_won) { case::resolver_addr(case) } else { dispute.disputer };
    transfer::public_transfer(coin::from_balance(pot, ctx), winner);

    // outcome flips only if the disputer won (verdict overturned)
    let final_outcome = if (resolver_won) {
        case::current_outcome(case)
    } else {
        !case::current_outcome(case)
    };
    case::finalize_disputed(case, final_outcome);

    dispute.resolved = true;
    dispute.resolver_won = resolver_won;

    event::emit(DisputeResolved {
        case_id: object::id(case),
        dispute_id: object::id(dispute),
        resolver_won,
        payout,
        fee,
    });
}

// === Read-only accessors (SDK / indexer / tests) ===
public fun disputer<T>(d: &Dispute<T>): address { d.disputer }
public fun case_id<T>(d: &Dispute<T>): ID { d.case_id }
public fun is_resolved<T>(d: &Dispute<T>): bool { d.resolved }
public fun resolver_won<T>(d: &Dispute<T>): bool { d.resolver_won }
public fun bond_value<T>(d: &Dispute<T>): u64 { balance::value(&d.disputer_bond) }
public fun raised_at_epoch<T>(d: &Dispute<T>): u64 { d.raised_at_epoch }
