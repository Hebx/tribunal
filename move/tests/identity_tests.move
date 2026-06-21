#[test_only]
module tribunal::identity_tests;

use sui::test_scenario as ts;
use tribunal::identity::{Self, AgentCard, ReputationCap};

const OWNER: address = @0xA1;
const OWNER2: address = @0xA2;
const OTHER: address = @0xBAD;

const ARCHETYPE: vector<u8> = b"textualist";
const PERSONA: vector<u8> = b"persona-hash-abc";

// Register an agent owned by `who`. The soulbound card lands in `who`'s inventory.
fun register(scen: &mut ts::Scenario, who: address) {
    ts::next_tx(scen, who);
    {
        identity::register_agent(ARCHETYPE, PERSONA, ts::ctx(scen));
    };
}

// === Registration ===

#[test]
fun test_register_mints_soulbound_card_at_baseline() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let card = ts::take_from_sender<AgentCard>(&scen);
        assert!(identity::owner(&card) == OWNER, 0);
        assert!(identity::archetype_id(&card) == ARCHETYPE, 1);
        assert!(identity::persona_hash(&card) == PERSONA, 2);
        assert!(identity::score(&card) == identity::baseline_score(), 3);
        assert!(identity::wins(&card) == 0, 4);
        assert!(identity::losses(&card) == 0, 5);
        assert!(identity::current_streak(&card) == 0, 6);
        ts::return_to_sender(&scen, card);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::identity::EEmptyArchetype)]
fun test_register_rejects_empty_archetype() {
    let mut scen = ts::begin(OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        identity::register_agent(b"", PERSONA, ts::ctx(&mut scen));
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::identity::EEmptyPersona)]
fun test_register_rejects_empty_persona() {
    let mut scen = ts::begin(OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        identity::register_agent(ARCHETYPE, b"", ts::ctx(&mut scen));
    };
    ts::end(scen);
}

// === Ownership ===

#[test]
fun test_assert_owner_passes_for_owner() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let card = ts::take_from_sender<AgentCard>(&scen);
        identity::assert_owner(&card, OWNER); // must not abort
        ts::return_to_sender(&scen, card);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::identity::ENotOwner)]
fun test_assert_owner_fails_for_other() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let card = ts::take_from_sender<AgentCard>(&scen);
        identity::assert_owner(&card, OTHER); // aborts
        ts::return_to_sender(&scen, card);
    };
    ts::end(scen);
}

// === Reputation: wins, losses, overturn, streak, cooldown ===

#[test]
fun test_record_win_increases_score_and_streak() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        let before = identity::score(&card);
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        assert!(identity::score(&card) > before, 0);
        assert!(identity::wins(&card) == 1, 1);
        assert!(identity::current_streak(&card) == 1, 2);
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::end(scen);
}

#[test]
fun test_record_loss_decreases_score_and_resets_streak() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    // win at epoch 0, advance, loss at epoch 1
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        let after_win = identity::score(&card);
        assert!(identity::current_streak(&card) == 1, 0);
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
        // stash after_win via a fresh tx assertion below
        assert!(after_win > identity::baseline_score(), 1);
    };
    ts::next_epoch(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        let before_loss = identity::score(&card);
        identity::record_outcome(&cap, &mut card, false, false, ts::ctx(&mut scen));
        assert!(identity::score(&card) < before_loss, 2);
        assert!(identity::losses(&card) == 1, 3);
        assert!(identity::current_streak(&card) == 0, 4);
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::end(scen);
}

#[test]
fun test_overturn_penalizes_and_counts() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        let before = identity::score(&card);
        identity::record_outcome(&cap, &mut card, false, true, ts::ctx(&mut scen));
        assert!(identity::score(&card) < before, 0);
        assert!(identity::overturned(&card) == 1, 1);
        assert!(identity::current_streak(&card) == 0, 2);
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = tribunal::identity::ECooldown)]
fun test_cooldown_blocks_second_outcome_same_epoch() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        // second outcome in the SAME epoch must abort on cooldown
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::end(scen);
}

#[test]
fun test_cooldown_allows_after_epoch_advance() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::next_epoch(&mut scen, OWNER);
    ts::next_tx(&mut scen, OWNER);
    {
        let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
        let mut card = ts::take_from_sender<AgentCard>(&scen);
        // next epoch: a second win is allowed; streak grows to 2
        identity::record_outcome(&cap, &mut card, true, false, ts::ctx(&mut scen));
        assert!(identity::wins(&card) == 2, 0);
        assert!(identity::current_streak(&card) == 2, 1);
        ts::return_to_sender(&scen, card);
        identity::destroy_cap_for_testing(cap);
    };
    ts::end(scen);
}

#[test]
fun test_score_never_underflows_on_repeated_losses() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    let mut e = 0u64;
    // 10 losses across 10 epochs; score must floor at 0, never underflow
    while (e < 10) {
        ts::next_tx(&mut scen, OWNER);
        {
            let cap = identity::new_cap_for_testing(ts::ctx(&mut scen));
            let mut card = ts::take_from_sender<AgentCard>(&scen);
            identity::record_outcome(&cap, &mut card, false, false, ts::ctx(&mut scen));
            assert!(identity::score(&card) >= 0, 0); // u64: trivially true, but asserts no abort
            ts::return_to_sender(&scen, card);
            identity::destroy_cap_for_testing(cap);
        };
        ts::next_epoch(&mut scen, OWNER);
        e = e + 1;
    };
    ts::next_tx(&mut scen, OWNER);
    {
        let card = ts::take_from_sender<AgentCard>(&scen);
        assert!(identity::score(&card) == 0, 1);
        assert!(identity::losses(&card) == 10, 2);
        ts::return_to_sender(&scen, card);
    };
    ts::end(scen);
}

#[test]
fun test_two_owners_independent_cards() {
    let mut scen = ts::begin(OWNER);
    register(&mut scen, OWNER);
    register(&mut scen, OWNER2);
    ts::next_tx(&mut scen, OWNER2);
    {
        let card = ts::take_from_sender<AgentCard>(&scen);
        assert!(identity::owner(&card) == OWNER2, 0);
        ts::return_to_sender(&scen, card);
    };
    ts::end(scen);
}
