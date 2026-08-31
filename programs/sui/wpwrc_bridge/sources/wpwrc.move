module powerchain::wpwrc;

use sui::coin::{Self, Coin, TreasuryCap};
use sui::coin_registry;
use sui::event;
use sui::table::{Self, Table};
use sui::tx_context::TxContext;

const E_NOT_ADMIN: u64 = 1;
const E_PAUSED: u64 = 2;
const E_INVALID_AMOUNT: u64 = 3;
const E_ALREADY_PROCESSED: u64 = 4;
const E_INVALID_SOLANA_RECIPIENT: u64 = 5;
const E_INVALID_ADMIN: u64 = 6;

/// One-time witness. The canonical coin type is:
/// `0x<PACKAGE_ID>::wpwrc::WPWRC`.
public struct WPWRC has drop {}

/// Shared bridge treasury. The TreasuryCap is deliberately wrapped inside the
/// bridge state so wPWRC supply can only change through these bridge functions.
public struct BridgeTreasury has key {
    id: UID,
    treasury_cap: TreasuryCap<WPWRC>,
    admin: address,
    paused: bool,
    processed_solana_messages: Table<u256, bool>,
    next_burn_nonce: u64,
}

public struct MintedFromSolana has copy, drop {
    recipient: address,
    amount_atomic: u64,
    solana_message_id: u256,
}

public struct BurnedToSolana has copy, drop {
    sender: address,
    amount_atomic: u64,
    burn_nonce: u64,
}

fun init(witness: WPWRC, ctx: &mut TxContext) {
    let (builder, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9,
        b"wPWRC".to_string(),
        b"Wrapped PowerChain".to_string(),
        b"1:1 Sui representation of canonical Solana PWRC held in the verified PowerChain bridge reserve.".to_string(),
        b"".to_string(),
        ctx,
    );
    let metadata_cap = builder.finalize(ctx);
    let admin = ctx.sender();
    let state = BridgeTreasury {
        id: object::new(ctx),
        treasury_cap,
        admin,
        paused: false,
        processed_solana_messages: table::new(ctx),
        next_burn_nonce: 0,
    };
    transfer::public_transfer(metadata_cap, admin);
    transfer::share_object(state);
}

/// Mint wPWRC only after a finalized Solana reserve-lock message has been
/// independently verified. `solana_message_id` is a 256-bit canonical message
/// hash/identifier and is consumed exactly once.
public fun mint_from_solana(
    state: &mut BridgeTreasury,
    amount_atomic: u64,
    solana_message_id: u256,
    recipient: address,
    ctx: &mut TxContext,
) {
    assert_admin(state, ctx);
    assert!(!state.paused, E_PAUSED);
    assert!(amount_atomic > 0, E_INVALID_AMOUNT);
    assert!(!state.processed_solana_messages.contains(solana_message_id), E_ALREADY_PROCESSED);
    state.processed_solana_messages.add(solana_message_id, true);
    let minted = coin::mint(&mut state.treasury_cap, amount_atomic, ctx);
    transfer::public_transfer(minted, recipient);
    event::emit(MintedFromSolana { recipient, amount_atomic, solana_message_id });
}

/// Burn wPWRC to initiate release of canonical PWRC on Solana. The emitted
/// burn nonce plus transaction digest forms the Sui-side message consumed by
/// the Solana bridge authority after finality and verification.
public fun burn_to_solana(
    state: &mut BridgeTreasury,
    coin_to_burn: Coin<WPWRC>,
    solana_recipient: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(!state.paused, E_PAUSED);
    assert!(solana_recipient.length() == 32, E_INVALID_SOLANA_RECIPIENT);
    let amount_atomic = coin_to_burn.value();
    assert!(amount_atomic > 0, E_INVALID_AMOUNT);
    coin::burn(&mut state.treasury_cap, coin_to_burn);
    let burn_nonce = state.next_burn_nonce;
    state.next_burn_nonce = burn_nonce + 1;
    event::emit(BurnedToSolana { sender: ctx.sender(), amount_atomic, burn_nonce });
    // The Solana recipient bytes are part of transaction inputs and therefore
    // committed by the Sui transaction digest; bridge relayers must include
    // them when constructing the canonical cross-chain message.
    let _ = solana_recipient;
}

public fun set_paused(state: &mut BridgeTreasury, paused: bool, ctx: &TxContext) {
    assert_admin(state, ctx);
    state.paused = paused;
}

public fun rotate_admin(state: &mut BridgeTreasury, new_admin: address, ctx: &TxContext) {
    assert_admin(state, ctx);
    assert!(new_admin != @0x0, E_INVALID_ADMIN);
    state.admin = new_admin;
}

public fun admin(state: &BridgeTreasury): address { state.admin }
public fun paused(state: &BridgeTreasury): bool { state.paused }
public fun next_burn_nonce(state: &BridgeTreasury): u64 { state.next_burn_nonce }

fun assert_admin(state: &BridgeTreasury, ctx: &TxContext) {
    assert!(ctx.sender() == state.admin, E_NOT_ADMIN);
}
