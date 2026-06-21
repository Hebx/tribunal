#[test_only]
module tribunal::stake_tests;

use sui::balance;
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;
use std::hash;
use tribunal::case::{Self, Case, ResolverCap};
use tribunal::evidence;
use tribunal::identity::{Self, AgentCard};
use tribunal::stake::{Self, StakePool, StakeReceipt};

const CREATOR: address = @0xA;
const RESOLVER: address = @0xB;
const ALICE: address = @0xA1;   // YES advocate (will win in happy path)
const BOB: address = @0xB1;     // NO advocate (will lose in happy path)
const CAROL: address = @0xC1;   // second YES staker (proportional payout test)

const CONFIG: vector<u8> = b"gpt-x|prompt-v3|sources:reuters,ap,onchain";
const EXPIRY: u64 = 5;
const LIVENESS: u64 = 0; // settle immediately for the stake-flow tests
const BOND: u64 = 1_000;

const PERSONA: vector<u8> = b"persona-hash";

// === Helpers ===

/// Create a case and hand the ResolverCap to RESOLVER.
fun create_case(scen: &mut ts::Scenario) {
    ts::next_tx(scen, CREATOR);
    {
        let cap = case::new_creator_cap_for_testing(ts::ctx(scen));
        let cfg_hash = hash::sha2_256(CONFIG);
        let (_id, resolver_cap) = case::create_case<SUI>(
            &cap,
            b"q",
            cfg_hash,
            b"walrus-ns://tribunal/stake-test",
            EXPIRY,
            LIVENESS,
            option::none(),
            ts::ctx(scen),
        );
        transfer::public_transfer(resolver_cap, RESOLVER);
        case::destroy_creator_cap_for_testing(cap);
    };
}

fun advance_to_epoch(scen: &mut ts::Scenario, target: u64) {
    let mut i = 0;
    while (i < target) {
        ts::next_epoch(scen, CREATOR);
        i = i + 1;
    };
}

/// `who` registers an AgentCard (free, permissionless).
fun register_agent(scen: &mut ts::Scenario, who: address, archetype: vector<u8>) {
    ts::next_tx(scen, who);
    {
        identity::register_agent(archetype, PERSONA, ts::ctx(scen));
    };
}

/// CREATOR (anyone) creates the pool bound to the shared Case.
fun create_pool(scen: &mut ts::Scenario) {
    ts::next_tx(scen, CREATOR);
    {
        let case = ts::take_shared<Case<SUI>>(scen);
        stake::create_pool<SUI>(&case, ts::ctx(scen));
        ts::return_shared(case);
    };
}

/// `who` stakes `amount` on `side_true` using their AgentCard.
fun do_stake(scen: &mut ts::Scenario, who: address, side_true: bool, amount: u64) {
    ts::next_tx(scen, who);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(scen);
        let card = ts::take_from_sender<AgentCard>(scen);
        let coin = coin::from_balance(
            balance::create_for_testing<SUI>(amount), ts::ctx(scen),
        );
        stake::stake<SUI>(&mut pool, &card, side_true, coin, ts::ctx(scen));
        ts::return_to_sender(scen, card);
        ts::return_shared(pool);
    };
}

/// Resolver asserts + settle (LIVENESS=0 so settle is callable immediately).
fun assert_and_settle(scen: &mut ts::Scenario, outcome_true: bool) {
    advance_to_epoch(scen, EXPIRY);
    ts::next_tx(scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(scen);
        let cap = ts::take_from_sender<ResolverCap>(scen);
        let bond = balance::create_for_testing<SUI>(BOND);
        let evid = evidence::new_ref(b"blob", b"sha", false, 100);
        case::assert_resolution<SUI>(
            &mut case, &cap, CONFIG, outcome_true, evid, bond, ts::ctx(scen),
        );
        ts::return_to_sender(scen, cap);
        ts::return_shared(case);
    };
    ts::next_tx(scen, RESOLVER);
    {
        let mut case = ts::take_shared<Case<SUI>>(scen);
        case::settle<SUI>(&mut case, ts::ctx(scen));
        ts::return_shared(case);
    };
}

// === Pool creation ===

#[test]
fun test_create_pool_emits_and_shares() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    create_pool(&mut scen);
    // pool is shared and readable
    ts::next_tx(&mut scen, CREATOR);
    {
        let pool = ts::take_shared<StakePool<SUI>>(&scen);
        assert!(stake::yes_total(&pool) == 0, 0);
        assert!(stake::no_total(&pool) == 0, 1);
        assert!(stake::staker_count(&pool) == 0, 2);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

// === Staking ===

#[test]
fun test_stake_increases_pool_and_mints_receipt() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 500);

    ts::next_tx(&mut scen, ALICE);
    {
        let pool = ts::take_shared<StakePool<SUI>>(&scen);
        assert!(stake::yes_total(&pool) == 500, 0);
        assert!(stake::no_total(&pool) == 0, 1);
        assert!(stake::yes_balance_value(&pool) == 500, 2);
        assert!(stake::staker_count(&pool) == 1, 3);
        // receipt landed with Alice
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        assert!(stake::receipt_amount(&receipt) == 500, 4);
        assert!(stake::receipt_side(&receipt) == true, 5);
        ts::return_to_sender(&scen, receipt);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::stake::EZeroStake)]
fun test_zero_stake_aborts() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    create_pool(&mut scen);

    ts::next_tx(&mut scen, ALICE);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let card = ts::take_from_sender<AgentCard>(&scen);
        let coin = coin::from_balance(
            balance::create_for_testing<SUI>(0), ts::ctx(&mut scen),
        );
        stake::stake<SUI>(&mut pool, &card, true, coin, ts::ctx(&mut scen));
        ts::return_to_sender(&scen, card);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::stake::EAlreadyStaked)]
fun test_double_stake_same_agent_aborts() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 100);
    // second stake by the same agent — must abort
    do_stake(&mut scen, ALICE, false, 100);
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::identity::ENotOwner)]
fun test_stake_requires_card_ownership() {
    // ALICE registers an agent, BOB tries to stake it. Identity guard aborts.
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    create_pool(&mut scen);

    ts::next_tx(&mut scen, BOB);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        // Bob fetches Alice's card from the address-owned inventory
        let card = ts::take_from_address<AgentCard>(&scen, ALICE);
        let coin = coin::from_balance(
            balance::create_for_testing<SUI>(100), ts::ctx(&mut scen),
        );
        stake::stake<SUI>(&mut pool, &card, true, coin, ts::ctx(&mut scen));
        ts::return_to_address(ALICE, card);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

// === Claim winnings ===

#[test]
fun test_winner_claims_principal_plus_full_losing_pool() {
    // 1 vs 1: Alice YES 500, Bob NO 200. Outcome YES. Alice gets 500 + 200 = 700.
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, BOB, b"textualist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 500);
    do_stake(&mut scen, BOB, false, 200);
    assert_and_settle(&mut scen, true); // YES wins

    ts::next_tx(&mut scen, ALICE);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        // pool should be empty on the YES side and empty on the NO side
        assert!(stake::yes_balance_value(&pool) == 0, 0);
        assert!(stake::no_balance_value(&pool) == 0, 1);
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    // Alice received a coin worth 700
    ts::next_tx(&mut scen, ALICE);
    {
        let payout = ts::take_from_sender<coin::Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 700, 2);
        ts::return_to_sender(&scen, payout);
    };
    ts::end(scen);
}

#[test]
fun test_loser_receipt_consumed_no_payout() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, BOB, b"textualist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 300);
    do_stake(&mut scen, BOB, false, 100);
    assert_and_settle(&mut scen, true); // YES wins, BOB loses

    ts::next_tx(&mut scen, BOB);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        // Bob got nothing; his 100 still sits on the NO side until Alice claims
        assert!(stake::no_balance_value(&pool) == 100, 0);
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    // Bob has no coin
    ts::next_tx(&mut scen, BOB);
    {
        assert!(!ts::has_most_recent_for_sender<coin::Coin<SUI>>(&scen), 1);
    };
    ts::end(scen);
}

#[test]
fun test_proportional_payout_two_winners() {
    // v3 weighted math: ALICE is the YES advocate (3× weight), CAROL is a YES
    // backer (1× weight). BOB is the NO advocate (irrelevant — loses).
    // yes_weighted_total = 600*3 + 200*1 = 2000. Losing total (NO) = 400.
    // Alice share = 1800 * 400 / 2000 = 360 → payout = 600 + 360 = 960.
    // Carol share =  200 * 400 / 2000 =  40 → payout = 200 +  40 = 240.
    // Sum of shares = 400 = losing_total ✓ (no rounding crumbs).
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, BOB, b"textualist");
    register_agent(&mut scen, CAROL, b"pragmatist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 600);
    do_stake(&mut scen, BOB, false, 400);
    do_stake(&mut scen, CAROL, true, 200);
    assert_and_settle(&mut scen, true);

    // Alice claims (advocate)
    ts::next_tx(&mut scen, ALICE);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    ts::next_tx(&mut scen, ALICE);
    {
        let payout = ts::take_from_sender<coin::Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 960, 0);
        ts::return_to_sender(&scen, payout);
    };
    // Carol claims (backer)
    ts::next_tx(&mut scen, CAROL);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    ts::next_tx(&mut scen, CAROL);
    {
        let payout = ts::take_from_sender<coin::Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 240, 1);
        ts::return_to_sender(&scen, payout);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::stake::ECaseNotSettled)]
fun test_claim_before_settle_aborts() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 100);
    // skip settle — claim must abort
    ts::next_tx(&mut scen, ALICE);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

// === v3: first-staker advocate + weighted claim split ===

#[test]
fun test_first_yes_staker_becomes_advocate() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, CAROL, b"intent-first");
    create_pool(&mut scen);
    // Alice stakes YES first → advocate. Carol second → backer.
    do_stake(&mut scen, ALICE, true, 100);
    do_stake(&mut scen, CAROL, true, 100);
    ts::next_tx(&mut scen, ALICE);
    {
        let pool = ts::take_shared<StakePool<SUI>>(&scen);
        let opt = stake::advocate_yes_id<SUI>(&pool);
        assert!(option::is_some(&opt), 0);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
fun test_second_yes_staker_is_backer() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, CAROL, b"intent-first");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 100);  // advocate
    do_stake(&mut scen, CAROL, true, 100);  // backer
    // Alice's receipt is the advocate one, Carol's is the backer one.
    ts::next_tx(&mut scen, ALICE);
    {
        let r = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        assert!(stake::receipt_is_advocate<SUI>(&r) == true, 0);
        assert!(stake::receipt_weight<SUI>(&r) == 300, 1); // 100 * 3
        ts::return_to_sender(&scen, r);
    };
    ts::next_tx(&mut scen, CAROL);
    {
        let r = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        assert!(stake::receipt_is_advocate<SUI>(&r) == false, 2);
        assert!(stake::receipt_weight<SUI>(&r) == 100, 3); // 100 * 1
        ts::return_to_sender(&scen, r);
    };
    ts::end(scen);
}

#[test]
fun test_advocate_weight_is_triple_backer() {
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, CAROL, b"intent-first");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 100);
    do_stake(&mut scen, CAROL, true, 100);
    ts::next_tx(&mut scen, CREATOR);
    {
        let pool = ts::take_shared<StakePool<SUI>>(&scen);
        // yes_weighted_total = 300 (advocate) + 100 (backer) = 400
        assert!(stake::yes_weighted_total<SUI>(&pool) == 400, 0);
        // yes_total still tracks raw amounts: 100 + 100 = 200
        assert!(stake::yes_total<SUI>(&pool) == 200, 1);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
fun test_advocate_share_is_triple_backer_when_stakes_equal() {
    // YES side: ALICE advocate 100 (weight 300), CAROL backer 100 (weight 100).
    // NO side: BOB advocate 100 (weight 300). YES wins, losing_total = 100.
    // Alice share = 300 * 100 / 400 = 75
    // Carol share = 100 * 100 / 400 = 25
    // Sum = 100 = losing_total (exact, no rounding crumbs at these numbers).
    // Alice payout = 100 (principal) + 75 (share) = 175
    // Carol payout = 100 (principal) + 25 (share) = 125
    // 75 == 3 * 25  ✓
    let mut scen = ts::begin(CREATOR);
    create_case(&mut scen);
    register_agent(&mut scen, ALICE, b"pragmatist");
    register_agent(&mut scen, BOB, b"textualist");
    register_agent(&mut scen, CAROL, b"intent-first");
    create_pool(&mut scen);
    do_stake(&mut scen, ALICE, true, 100);   // YES advocate
    do_stake(&mut scen, BOB,   false, 100);  // NO advocate
    do_stake(&mut scen, CAROL, true, 100);   // YES backer
    assert_and_settle(&mut scen, true);

    // Alice claims (advocate)
    ts::next_tx(&mut scen, ALICE);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    ts::next_tx(&mut scen, ALICE);
    {
        let payout = ts::take_from_sender<coin::Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 175, 0);
        ts::return_to_sender(&scen, payout);
    };
    // Carol claims (backer)
    ts::next_tx(&mut scen, CAROL);
    {
        let mut pool = ts::take_shared<StakePool<SUI>>(&scen);
        let case = ts::take_shared<Case<SUI>>(&scen);
        let receipt = ts::take_from_sender<StakeReceipt<SUI>>(&scen);
        stake::claim_winnings<SUI>(&mut pool, &case, receipt, ts::ctx(&mut scen));
        ts::return_shared(case);
        ts::return_shared(pool);
    };
    ts::next_tx(&mut scen, CAROL);
    {
        let payout = ts::take_from_sender<coin::Coin<SUI>>(&scen);
        assert!(coin::value(&payout) == 125, 1);
        ts::return_to_sender(&scen, payout);
    };
    ts::end(scen);
}
