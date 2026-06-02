#[test_only]
module tribunal::dispute_tests;

use sui::balance;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use std::hash;
use tribunal::case::{Self, Case, ResolverCap};
use tribunal::dispute::{Self, Dispute};
use tribunal::evidence;

const CREATOR: address = @0xA;    // deployment authority == fee_recipient
const RESOLVER: address = @0xB;
const DISPUTER: address = @0xD;
const OTHER: address = @0xBAD;

const CONFIG: vector<u8> = b"gpt-x|prompt-v3|sources:reuters,ap,onchain";
const EXPIRY: u64 = 5;
const LIVENESS: u64 = 3;
const BOND: u64 = 1000;
const FEE_BPS: u64 = 50;          // 0.5%

// Create a case (cap -> RESOLVER) and advance to an asserted state with `BOND`.
fun setup_asserted(scen: &mut ts::Scenario) {
    ts::next_tx(scen, CREATOR);
    {
        let cap = case::new_creator_cap_for_testing(ts::ctx(scen));
        let (_id, resolver_cap) = case::create_case<SUI>(
            &cap, b"q", hash::sha2_256(CONFIG), b"ns",
            EXPIRY, LIVENESS, option::none(), ts::ctx(scen),
        );
        transfer::public_transfer(resolver_cap, RESOLVER);
        case::destroy_creator_cap_for_testing(cap);
    };
    advance_to_epoch(scen, EXPIRY);
    ts::next_tx(scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(scen);
        let cap = ts::take_from_sender<ResolverCap>(scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-1", b"sha-1", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(scen),
        );
        ts::return_to_sender(scen, cap);
        ts::return_shared(case);
    };
}

fun advance_to_epoch(scen: &mut ts::Scenario, target: u64) {
    let mut i = 0;
    while (i < target) { ts::next_epoch(scen, CREATOR); i = i + 1; };
}

// File a matching-bond dispute as DISPUTER (assumes within window).
fun file_dispute(scen: &mut ts::Scenario) {
    ts::next_tx(scen, DISPUTER);
    {
        let mut case = ts::take_shared<Case<SUI>>(scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        dispute::dispute_resolution<SUI>(&mut case, bond, ts::ctx(scen));
        ts::return_shared(case);
    };
}

#[test]
fun test_dispute_within_window_moves_to_disputed() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    file_dispute(&mut scen);
    ts::next_tx(&mut scen, OTHER);
    {
        let case = ts::take_shared<Case<SUI>>(&scen);
        assert!(case::is_disputed(&case), 0);
        // resolver bond stays escrowed in the Case until resolve_dispute pays out
        assert!(case::bond_value(&case) == BOND, 1);
        ts::return_shared(case);
    };
    ts::next_tx(&mut scen, OTHER);
    {
        let d = ts::take_shared<Dispute<SUI>>(&scen);
        assert!(dispute::disputer(&d) == DISPUTER, 2);
        assert!(dispute::bond_value(&d) == BOND, 3);
        assert!(!dispute::is_resolved(&d), 4);
        ts::return_shared(d);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::EWindowClosed)]
fun test_dispute_after_window_aborts() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    // jump past the liveness window
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS);
    ts::next_tx(&mut scen, DISPUTER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        dispute::dispute_resolution<SUI>(&mut case, bond, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::dispute::EBondMismatch)]
fun test_dispute_bond_mismatch_aborts() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    ts::next_tx(&mut scen, DISPUTER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND - 1); // under-bonded
        dispute::dispute_resolution<SUI>(&mut case, bond, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ENotAsserted)]
fun test_dispute_on_unasserted_aborts() {
    let mut scen = ts::begin(CREATOR);
    // create only — never assert
    ts::next_tx(&mut scen, CREATOR);
    {
        let cap = case::new_creator_cap_for_testing(ts::ctx(&mut scen));
        let (_id, resolver_cap) = case::create_case<SUI>(
            &cap, b"q", hash::sha2_256(CONFIG), b"ns",
            EXPIRY, LIVENESS, option::none(), ts::ctx(&mut scen),
        );
        transfer::public_transfer(resolver_cap, RESOLVER);
        case::destroy_creator_cap_for_testing(cap);
    };
    ts::next_tx(&mut scen, DISPUTER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        dispute::dispute_resolution<SUI>(&mut case, bond, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
fun test_resolve_dispute_resolver_wins() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);          // outcome asserted true
    file_dispute(&mut scen);

    // resolver wins the re-vote
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(
            &mut case, &mut d, &cap, true, FEE_BPS, ts::ctx(&mut scen),
        );
        // outcome stays true; case settled
        let (settled, outcome) = case::get_resolution(&case);
        assert!(settled, 0);
        assert!(outcome, 1);              // not flipped
        assert!(dispute::is_resolved(&d), 2);
        assert!(dispute::resolver_won(&d), 3);
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };

    // pot = 2000, fee = 2000 * 50 / 10000 = 10, payout = 1990 -> RESOLVER
    ts::next_tx(&mut scen, RESOLVER);
    {
        let payout = ts::take_from_sender<Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 1990, 4);
        ts::return_to_sender(&scen, payout);
    };
    // fee 10 -> CREATOR (fee_recipient)
    ts::next_tx(&mut scen, CREATOR);
    {
        let fee = ts::take_from_sender<Coin<SUI>>(&scen);
        assert!(coin::value(&fee) == 10, 5);
        ts::return_to_sender(&scen, fee);
    };
    ts::end(scen);
}

#[test]
fun test_resolve_dispute_disputer_wins_flips_outcome() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);          // outcome asserted true
    file_dispute(&mut scen);

    // disputer wins -> outcome flips to false
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(
            &mut case, &mut d, &cap, false, FEE_BPS, ts::ctx(&mut scen),
        );
        let (settled, outcome) = case::get_resolution(&case);
        assert!(settled, 0);
        assert!(!outcome, 1);             // flipped from true to false
        assert!(!dispute::resolver_won(&d), 2);
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };

    // payout 1990 -> DISPUTER
    ts::next_tx(&mut scen, DISPUTER);
    {
        let payout = ts::take_from_sender<Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 1990, 3);
        ts::return_to_sender(&scen, payout);
    };
    ts::end(scen);
}

#[test]
fun test_resolve_dispute_zero_fee() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    file_dispute(&mut scen);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(
            &mut case, &mut d, &cap, true, 0, ts::ctx(&mut scen), // zero fee
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };
    // full pot 2000 -> RESOLVER, no fee coin to CREATOR
    ts::next_tx(&mut scen, RESOLVER);
    {
        let payout = ts::take_from_sender<Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 2000, 0);
        ts::return_to_sender(&scen, payout);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::dispute::EFeeTooHigh)]
fun test_resolve_dispute_fee_too_high_aborts() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    file_dispute(&mut scen);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(
            &mut case, &mut d, &cap, true, 10_001, ts::ctx(&mut scen), // > 100%
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::dispute::EAlreadyResolved)]
fun test_double_resolve_aborts() {
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    file_dispute(&mut scen);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(&mut case, &mut d, &cap, true, FEE_BPS, ts::ctx(&mut scen));
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };
    // second resolve on the same (now resolved) dispute must abort.
    // NOTE: the case is already Settled, so ENotDisputed would also fire; the
    // dispute.resolved guard is checked first in resolve_dispute, so this asserts
    // EAlreadyResolved deterministically.
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let mut d = ts::take_shared<Dispute<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        dispute::resolve_dispute<SUI>(&mut case, &mut d, &cap, true, FEE_BPS, ts::ctx(&mut scen));
        ts::return_to_sender(&scen, cap);
        ts::return_shared(d);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ENotAsserted)]
fun test_settle_disputed_case_aborts() {
    // once a case is Disputed, the plain settle() path must not finalize it.
    let mut scen = ts::begin(CREATOR);
    setup_asserted(&mut scen);
    file_dispute(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS + 1);
    ts::next_tx(&mut scen, OTHER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen)); // Disputed != Asserted -> abort
        ts::return_shared(case);
    };
    ts::end(scen);
}
