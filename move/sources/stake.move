// tribunal::stake — opt-in skin-in-the-game for persona agents
//
// A persona-agent owner stakes SUI on a side of a Case to opt into being
// matched as an advocate. Stakes lock until the case settles; winners reclaim
// their stake plus a proportional share of the losing pool, losers forfeit
// their stake to the winners.
//
// Cross-module wiring with `tribunal::case`:
//   - StakePool<T> is paired 1:1 with a Case<T> via `case_id`.
//   - claim_winnings reads the Case's settled outcome via case::get_resolution;
//     this is the only point where the chain decides who won the stake.
//   - If a verdict is later overturned on dispute, finalize_disputed flips the
//     Case's outcome, so anyone who hasn't claimed yet now claims under the
//     flipped outcome. The resolver records the corresponding reputation
//     overturn via identity::record_outcome (handled by the off-chain bundler).
//
// Anti-double-stake: an agent can stake at most ONCE per pool (tracked in a
// vector — O(n) in stakers, adequate for current pool sizes; swap for a
// VecSet if profiling shows it matters).
module tribunal::stake;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use tribunal::case::{Self, Case};
use tribunal::identity::{Self, AgentCard};

// === Error codes ===
const EWrongPool: u64 = 1;        // receipt does not belong to this pool
const EAlreadyStaked: u64 = 2;    // this agent already staked on this pool
const ECaseNotSettled: u64 = 3;   // cannot claim before the case settles
const EZeroStake: u64 = 4;        // stake amount must be > 0
const EAlreadyClaimed: u64 = 5;   // a receipt is single-use; double-claim blocked
const ECaseMismatch: u64 = 6;     // claim called against the wrong Case object

// === Boost weights ===
// Advocate (first staker on a side) gets a 3.00× share weight; backer is 1.00×.
// Both expressed in basis points against BPS_DEN = 10_000.
// Principal-back math is unchanged — only the losing-pool *share* uses weights.
// The seam that prediction-market betting will later slot into (`bet()` writes
// a record with is_advocate=false / boost=BACKER_BPS, claim math is identical).
const ADVOCATE_BOOST_BPS: u64 = 30_000;
const BACKER_BPS:        u64 = 10_000;
const BPS_DEN:           u64 = 10_000;

// === Shared pool, one per case ===
public struct StakePool<phantom T> has key {
    id: UID,
    /// The Case this pool is bound to. The same id is used as the seal key for
    /// "did this pool resolve this case" checks during claim.
    case_id: ID,
    /// Stakers on the YES side (argues outcome_true == true).
    yes_balance: Balance<T>,
    yes_total: u64,
    /// Stakers on the NO side.
    no_balance: Balance<T>,
    no_total: u64,
    /// AgentCard ids that have already staked, to prevent double-staking.
    staked_agents: vector<ID>,
    /// First wallet to stake YES becomes the YES advocate, immutable.
    /// None until the first YES stake.
    advocate_yes: Option<ID>,
    /// First wallet to stake NO becomes the NO advocate, immutable.
    advocate_no: Option<ID>,
    /// Sum of claim-weights on each side (= advocate.amount × 3 + Σ backers.amount).
    /// Used as the denominator in claim_winnings. Order-independent.
    yes_weighted_total: u64,
    no_weighted_total: u64,
    /// Parallel record of every stake call, for off-chain matchmaking.
    stakes: vector<StakeRecord>,
}

/// On-chain row pushed for every successful stake() call. The resolver can
/// list these in one RPC + identify the advocate via is_advocate without
/// walking the event log.
public struct StakeRecord has store, drop, copy {
    agent_id: ID,
    side_true: bool,
    amount: u64,
    weight: u64,
    is_advocate: bool,
}

/// Non-transferable claim ticket. `key`-only (no store) keeps it stuck in the
/// owner's inventory — soulbound enough for our flow (and it self-destructs on
/// claim anyway). Holds the staker's side + amount so claims are O(1).
public struct StakeReceipt<phantom T> has key {
    id: UID,
    pool_id: ID,
    agent_card_id: ID,
    /// true = YES (argued outcome_true), false = NO.
    side_true: bool,
    amount: u64,
    /// The case this receipt is for — used as a defensive check on claim.
    case_id: ID,
    /// Claim weight (= amount for backers, amount × 3 for advocate).
    weight: u64,
    /// True iff this receipt belongs to the side's advocate.
    is_advocate: bool,
}

// === Events ===
public struct PoolCreated has copy, drop {
    pool_id: ID,
    case_id: ID,
}

public struct Staked has copy, drop {
    pool_id: ID,
    case_id: ID,
    agent_card_id: ID,
    staker: address,
    side_true: bool,
    amount: u64,
    new_yes_total: u64,
    new_no_total: u64,
}

public struct WinningsClaimed has copy, drop {
    pool_id: ID,
    case_id: ID,
    agent_card_id: ID,
    staker: address,
    stake_amount: u64,
    winnings_amount: u64,
    side_true: bool,
}

/// Create a fresh stake pool bound to an existing Case. Anyone may create the
/// pool — the pool can only meaningfully resolve through the Case's own
/// settlement, so there is no privileged auth needed. Idempotency is not
/// enforced on-chain (multiple pools could be created for one case); the
/// front-end picks the canonical one by reading PoolCreated events.
public fun create_pool<T>(case: &Case<T>, ctx: &mut TxContext): ID {
    let pool = StakePool<T> {
        id: object::new(ctx),
        case_id: object::id(case),
        yes_balance: balance::zero<T>(),
        yes_total: 0,
        no_balance: balance::zero<T>(),
        no_total: 0,
        staked_agents: vector[],
        advocate_yes: option::none(),
        advocate_no: option::none(),
        yes_weighted_total: 0,
        no_weighted_total: 0,
        stakes: vector[],
    };
    let pool_id = object::id(&pool);
    event::emit(PoolCreated { pool_id, case_id: object::id(case) });
    transfer::share_object(pool);
    pool_id
}

/// Stake a coin on `side_true` (true = YES advocate, false = NO advocate).
/// Verifies the caller owns `agent_card`. Returns a StakeReceipt to the
/// caller via transfer. Same agent cannot stake twice on the same pool.
public fun stake<T>(
    pool: &mut StakePool<T>,
    agent_card: &AgentCard,
    side_true: bool,
    payment: Coin<T>,
    ctx: &mut TxContext,
) {
    let staker = ctx.sender();
    // Auth: only the agent's owner can stake it. assert_owner aborts otherwise.
    identity::assert_owner(agent_card, staker);

    let agent_id = object::id(agent_card);
    assert!(!agent_already_staked(pool, &agent_id), EAlreadyStaked);

    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroStake);

    // Determine advocate-ness: the first staker on each side claims that slot
    // and it is immutable thereafter. Everyone else is a backer.
    let is_advocate = if (side_true) {
        if (pool.advocate_yes.is_none()) {
            pool.advocate_yes = option::some(agent_id);
            true
        } else { false }
    } else {
        if (pool.advocate_no.is_none()) {
            pool.advocate_no = option::some(agent_id);
            true
        } else { false }
    };
    let boost_bps = if (is_advocate) ADVOCATE_BOOST_BPS else BACKER_BPS;
    let weight = (((amount as u128) * (boost_bps as u128)) / (BPS_DEN as u128)) as u64;

    let bal = coin::into_balance(payment);
    if (side_true) {
        pool.yes_balance.join(bal);
        pool.yes_total = pool.yes_total + amount;
        pool.yes_weighted_total = pool.yes_weighted_total + weight;
    } else {
        pool.no_balance.join(bal);
        pool.no_total = pool.no_total + amount;
        pool.no_weighted_total = pool.no_weighted_total + weight;
    };

    pool.staked_agents.push_back(agent_id);
    pool.stakes.push_back(StakeRecord {
        agent_id, side_true, amount, weight, is_advocate,
    });

    let receipt = StakeReceipt<T> {
        id: object::new(ctx),
        pool_id: object::id(pool),
        agent_card_id: agent_id,
        side_true,
        amount,
        case_id: pool.case_id,
        weight,
        is_advocate,
    };
    event::emit(Staked {
        pool_id: object::id(pool),
        case_id: pool.case_id,
        agent_card_id: agent_id,
        staker,
        side_true,
        amount,
        new_yes_total: pool.yes_total,
        new_no_total: pool.no_total,
    });
    transfer::transfer(receipt, staker);
}

/// Claim winnings after settlement. Requires the resolved Case to compute the
/// payout. Consumes the receipt (single-use). Pays out:
///   - if your side won  : stake + (stake / winning_total) * losing_total
///   - if your side lost : 0 (receipt is consumed; coin is destroyed)
/// Integer math throughout; rounding crumbs stay in the pool's balance and are
/// claimable by later winners (each claim recomputes from the live remainder).
#[allow(lint(self_transfer))]
public fun claim_winnings<T>(
    pool: &mut StakePool<T>,
    case: &Case<T>,
    receipt: StakeReceipt<T>,
    ctx: &mut TxContext,
) {
    // Sanity: receipt and case both belong to this pool.
    assert!(receipt.pool_id == object::id(pool), EWrongPool);
    assert!(receipt.case_id == object::id(case), ECaseMismatch);
    let (settled, outcome_true) = case::get_resolution(case);
    assert!(settled, ECaseNotSettled);

    let StakeReceipt {
        id: receipt_id,
        pool_id: _,
        agent_card_id,
        side_true,
        amount,
        case_id,
        weight,
        is_advocate: _,
    } = receipt;
    let staker = ctx.sender();

    // A receipt with zero amount means it was already claimed (defensive — we
    // destructure above, so a real double-claim would fail at object retrieval).
    assert!(amount > 0, EAlreadyClaimed);

    let won = side_true == outcome_true;
    let mut payout = balance::zero<T>();
    let mut winnings_amount: u64 = 0;

    if (won) {
        // Pull our principal back from the winning side's balance.
        let principal = if (side_true) {
            pool.yes_balance.split(amount)
        } else {
            pool.no_balance.split(amount)
        };
        payout.join(principal);

        // Weighted share of the losing pool. Single denominator
        // (winning_weighted_total) is shared across every winner, so partial
        // claims stay coherent regardless of order. Rounding crumbs stay in
        // the pool's balance.
        let (winning_weighted_total, losing_total) = if (side_true) {
            (pool.yes_weighted_total, pool.no_total)
        } else {
            (pool.no_weighted_total, pool.yes_total)
        };
        let share = if (winning_weighted_total == 0) {
            0
        } else {
            // u128 multiplication to avoid overflow on large pools
            let num = (weight as u128) * (losing_total as u128);
            ((num / (winning_weighted_total as u128)) as u64)
        };
        winnings_amount = share;
        if (share > 0) {
            let bonus = if (side_true) {
                pool.no_balance.split(share)
            } else {
                pool.yes_balance.split(share)
            };
            payout.join(bonus);
        };

        transfer::public_transfer(coin::from_balance(payout, ctx), staker);
    } else {
        // Loser: principal stays in the pool (winners will claim it).
        balance::destroy_zero(payout);
    };

    object::delete(receipt_id);

    event::emit(WinningsClaimed {
        pool_id: object::id(pool),
        case_id,
        agent_card_id,
        staker,
        stake_amount: amount,
        winnings_amount,
        side_true,
    });
}

// === Reads ===
public fun case_id<T>(pool: &StakePool<T>): ID { pool.case_id }
public fun yes_total<T>(pool: &StakePool<T>): u64 { pool.yes_total }
public fun no_total<T>(pool: &StakePool<T>): u64 { pool.no_total }
public fun yes_balance_value<T>(pool: &StakePool<T>): u64 { pool.yes_balance.value() }
public fun no_balance_value<T>(pool: &StakePool<T>): u64 { pool.no_balance.value() }
public fun staker_count<T>(pool: &StakePool<T>): u64 { pool.staked_agents.length() }
public fun yes_weighted_total<T>(pool: &StakePool<T>): u64 { pool.yes_weighted_total }
public fun no_weighted_total<T>(pool: &StakePool<T>): u64 { pool.no_weighted_total }
public fun advocate_yes_id<T>(pool: &StakePool<T>): Option<ID> { pool.advocate_yes }
public fun advocate_no_id<T>(pool: &StakePool<T>):  Option<ID> { pool.advocate_no  }
public fun list_stakers<T>(pool: &StakePool<T>): vector<StakeRecord> { pool.stakes }

public fun receipt_amount<T>(r: &StakeReceipt<T>): u64 { r.amount }
public fun receipt_side<T>(r: &StakeReceipt<T>): bool { r.side_true }
public fun receipt_pool_id<T>(r: &StakeReceipt<T>): ID { r.pool_id }
public fun receipt_agent_id<T>(r: &StakeReceipt<T>): ID { r.agent_card_id }
public fun receipt_weight<T>(r: &StakeReceipt<T>): u64 { r.weight }
public fun receipt_is_advocate<T>(r: &StakeReceipt<T>): bool { r.is_advocate }

// === StakeRecord reads (for off-chain matchmaking) ===
public fun record_agent_id(r: &StakeRecord): ID { r.agent_id }
public fun record_side_true(r: &StakeRecord): bool { r.side_true }
public fun record_amount(r: &StakeRecord): u64 { r.amount }
public fun record_weight(r: &StakeRecord): u64 { r.weight }
public fun record_is_advocate(r: &StakeRecord): bool { r.is_advocate }

// === Internal helpers ===
fun agent_already_staked<T>(pool: &StakePool<T>, agent: &ID): bool {
    let mut i = 0;
    let n = pool.staked_agents.length();
    while (i < n) {
        if (pool.staked_agents.borrow(i) == agent) return true;
        i = i + 1;
    };
    false
}
