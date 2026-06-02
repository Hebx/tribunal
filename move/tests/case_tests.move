#[test_only]
module tribunal::case_tests;

use sui::balance;
use sui::sui::SUI;
use sui::test_scenario as ts;
use std::hash;
use tribunal::case::{Self, Case, ResolverCap};
use tribunal::evidence;

const CREATOR: address = @0xA;       // deployment / case factory operator
const RESOLVER: address = @0xB;      // committee operator who asserts outcomes
const OTHER: address = @0xBAD;

// Raw resolver config (model_id ‖ prompt ‖ data_sources). The case locks its
// sha256; the resolver must re-present this exact preimage at assertion time.
const CONFIG: vector<u8> = b"gpt-x|prompt-v3|sources:reuters,ap,onchain";
const WRONG_CONFIG: vector<u8> = b"gpt-x|prompt-v3-TAMPERED|sources:reuters";

const EXPIRY: u64 = 5;               // earliest epoch a resolution may be asserted
const LIVENESS: u64 = 3;             // challenge window in epochs
const BOND: u64 = 1000;

// Create a case at epoch 0 and hand the ResolverCap to RESOLVER. Returns nothing;
// the shared Case is taken from the scenario in each test.
fun create(scen: &mut ts::Scenario) {
    ts::next_tx(scen, CREATOR);
    {
        let cap = case::new_creator_cap_for_testing(ts::ctx(scen));
        let cfg_hash = hash::sha2_256(CONFIG);
        let (_id, resolver_cap) = case::create_case<SUI>(
            &cap,
            b"question-hash",
            cfg_hash,
            b"walrus-ns://tribunal/case-1",
            EXPIRY,
            LIVENESS,
            option::none(),
            ts::ctx(scen),
        );
        transfer::public_transfer(resolver_cap, RESOLVER);
        case::destroy_creator_cap_for_testing(cap);
    };
}

// Advance the scenario to `target` epoch (test_scenario starts at epoch 0).
fun advance_to_epoch(scen: &mut ts::Scenario, target: u64) {
    let mut i = 0;
    while (i < target) {
        ts::next_epoch(scen, CREATOR);
        i = i + 1;
    };
}

#[test]
fun test_create_locks_config_and_memory() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let case = ts::take_shared<Case<SUI>>(&scen);
        assert!(case::config_hash(&case) == hash::sha2_256(CONFIG), 0);
        assert!(case::memory_ns(&case) == b"walrus-ns://tribunal/case-1", 1);
        let (settled, _) = case::get_resolution(&case);
        assert!(!settled, 2);
        assert!(case::bond_value(&case) == 0, 3);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
fun test_happy_path_assert_then_settle() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);     // reach earliest-resolvable epoch

    // resolver asserts outcome=true with matching config + bond
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-1", b"sha-1", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        assert!(case::bond_value(&case) == BOND, 0);
        let (settled, _) = case::get_resolution(&case);
        assert!(!settled, 1); // asserted, not yet settled
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };

    // wait out the liveness window, then settle
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS);
    ts::next_tx(&mut scen, OTHER); // anyone can settle once the window closes
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        let (settled, outcome) = case::get_resolution(&case);
        assert!(settled, 2);
        assert!(outcome, 3);
        assert!(case::bond_value(&case) == 0, 4); // bond refunded
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
fun test_settle_outcome_false() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-2", b"sha-2", true, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, false, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        let (settled, outcome) = case::get_resolution(&case);
        assert!(settled, 0);
        assert!(!outcome, 1);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::EConfigMismatch)]
fun test_config_mismatch_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-x", b"sha-x", false, 100);
        // present a tampered config — must abort
        case::assert_resolution<SUI>(
            &mut case, &cap, WRONG_CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ETooEarly)]
fun test_assert_before_expiry_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    // do NOT advance — still epoch 0, before EXPIRY
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-e", b"sha-e", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::EWrongCap)]
fun test_wrong_resolver_cap_aborts() {
    let mut scen = ts::begin(CREATOR);

    // mint two independent cases; keep their IDs so the takes are deterministic
    ts::next_tx(&mut scen, CREATOR);
    let (id1, id2) = {
        let creator_cap = case::new_creator_cap_for_testing(ts::ctx(&mut scen));
        let (id1, cap1) = case::create_case<SUI>(
            &creator_cap, b"q1", hash::sha2_256(CONFIG), b"ns1",
            EXPIRY, LIVENESS, option::none(), ts::ctx(&mut scen),
        );
        let (id2, cap2) = case::create_case<SUI>(
            &creator_cap, b"q2", hash::sha2_256(CONFIG), b"ns2",
            EXPIRY, LIVENESS, option::none(), ts::ctx(&mut scen),
        );
        // OTHER ends up holding case#2's cap; case#1's cap is parked on CREATOR
        transfer::public_transfer(cap1, CREATOR);
        transfer::public_transfer(cap2, OTHER);
        case::destroy_creator_cap_for_testing(creator_cap);
        (id1, id2)
    };

    advance_to_epoch(&mut scen, EXPIRY);
    // OTHER presents case#2's cap against the case#1 object -> EWrongCap
    ts::next_tx(&mut scen, OTHER);
    {
        let mut case1 = ts::take_shared_by_id<Case<SUI>>(&scen, id1);
        let foreign_cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"b", b"s", false, 100);
        case::assert_resolution<SUI>(
            &mut case1, &foreign_cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, foreign_cap);
        ts::return_shared(case1);
    };
    let _ = id2;
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ELivenessNotPassed)]
fun test_settle_before_liveness_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-l", b"sha-l", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    // settle immediately — liveness window has NOT elapsed
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ENotAsserted)]
fun test_settle_unasserted_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS);
    // never asserted -> settle must abort
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ENotOpen)]
fun test_double_assert_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);
    // first assertion succeeds
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-1", b"sha-1", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    // second assertion on the now-Asserted case must abort (ENotOpen)
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-2", b"sha-2", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, false, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::case::ENotAsserted)]
fun test_double_settle_aborts() {
    let mut scen = ts::begin(CREATOR);
    create(&mut scen);
    advance_to_epoch(&mut scen, EXPIRY);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        let cap = ts::take_from_sender<ResolverCap>(&scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob-1", b"sha-1", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, true, evid, bond, ts::ctx(&mut scen),
        );
        ts::return_to_sender(&scen, cap);
        ts::return_shared(case);
    };
    advance_to_epoch(&mut scen, EXPIRY + LIVENESS);
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    // second settle on a SettledTrue case must abort (ENotAsserted)
    ts::next_tx(&mut scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(&scen);
        case::settle<SUI>(&mut case, ts::ctx(&mut scen));
        ts::return_shared(case);
    };
    ts::end(scen);
}

// === evidence module ===

#[test]
fun test_evidence_certified_ok() {
    let a = evidence::new_ref(b"blob-ok", b"sha-ok", false, 100);
    evidence::assert_certified(&a, 50);   // storage epoch 100 >= current 50
    assert!(evidence::blob_id(&a) == b"blob-ok", 0);
    assert!(!evidence::is_sealed(&a), 1);
    assert!(evidence::epoch(&a) == 100, 2);
}

#[test]
#[expected_failure(abort_code = tribunal::evidence::EBlobExpired)]
fun test_evidence_expired_aborts() {
    let a = evidence::new_ref(b"blob-old", b"sha-old", false, 10);
    evidence::assert_certified(&a, 50);   // storage epoch 10 < current 50 -> expired
}

#[test]
#[expected_failure(abort_code = tribunal::evidence::ENotCertified)]
fun test_evidence_empty_blob_aborts() {
    let a = evidence::new_ref(b"", b"sha", false, 100);
    evidence::assert_certified(&a, 50);   // empty blob id -> not certified
}

// === Seal access policy (pure predicates behind seal_approve) ===

#[test]
fun test_seal_can_decrypt_gates() {
    // settled verdict is publicly auditable regardless of caller
    assert!(evidence::can_decrypt(true, false), 0);
    assert!(evidence::can_decrypt(true, true), 1);
    // before settlement, only the recorded resolver may decrypt
    assert!(evidence::can_decrypt(false, true), 2);
    // before settlement, a non-resolver is denied
    assert!(!evidence::can_decrypt(false, false), 3);
}

#[test]
fun test_seal_identity_prefix_bind() {
    let ns = b"walrus-ns://tribunal/case-1";
    // an identity under the namespace is accepted (ns ‖ entry_id)
    assert!(evidence::is_prefix(ns, b"walrus-ns://tribunal/case-1/verdict"), 0);
    // exact namespace match is a valid prefix
    assert!(evidence::is_prefix(ns, ns), 1);
    // a different case's namespace is rejected (cross-case key reuse blocked)
    assert!(!evidence::is_prefix(ns, b"walrus-ns://tribunal/case-2/verdict"), 2);
    // a longer prefix than the word can never match
    assert!(!evidence::is_prefix(b"walrus-ns://tribunal/case-1/extra", ns), 3);
    // empty prefix matches anything
    assert!(evidence::is_prefix(b"", b"anything"), 4);
}

