use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("EgWd4FYsnbxZeZUZ8jzQeLhY3Eo2PLPHgkApHTvCdLNy");

const MAX_SUI_RECIPIENT: usize = 96;

#[program]
pub mod powerchain_bridge {
    use super::*;

    pub fn initialize_bridge(ctx: Context<InitializeBridge>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.pwrc_mint = ctx.accounts.mint.key();
        cfg.reserve_vault = ctx.accounts.reserve_vault.key();
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_paused(ctx: Context<BridgeAdmin>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(BridgePauseChanged { paused });
        Ok(())
    }

    pub fn rotate_authority(ctx: Context<BridgeAdmin>, new_authority: Pubkey) -> Result<()> {
        require!(new_authority != Pubkey::default(), BridgeError::InvalidAuthority);
        let old = ctx.accounts.config.authority;
        ctx.accounts.config.authority = new_authority;
        emit!(BridgeAuthorityRotated { old_authority: old, new_authority });
        Ok(())
    }

    /// Locks canonical PWRC in the Solana reserve. A separate bridge relayer may mint
    /// exactly the observed amount of wPWRC on Sui after Solana finality.
    pub fn lock_to_sui(
        ctx: Context<LockToSui>,
        amount_atomic: u64,
        nonce: [u8; 32],
        sui_recipient: Vec<u8>,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, BridgeError::Paused);
        require!(amount_atomic > 0, BridgeError::InvalidAmount);
        require!(!sui_recipient.is_empty() && sui_recipient.len() <= MAX_SUI_RECIPIENT, BridgeError::InvalidSuiRecipient);

        let reserve_before = ctx.accounts.reserve_vault.amount;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.reserve_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount_atomic,
            ctx.accounts.mint.decimals,
        )?;
        ctx.accounts.reserve_vault.reload()?;
        let locked_atomic = ctx.accounts.reserve_vault.amount.checked_sub(reserve_before).ok_or(BridgeError::MathOverflow)?;
        require!(locked_atomic > 0 && locked_atomic <= amount_atomic, BridgeError::InvalidNetAmount);

        let record = &mut ctx.accounts.lock_record;
        record.owner = ctx.accounts.owner.key();
        record.amount_atomic = locked_atomic;
        record.nonce = nonce;
        record.sui_recipient = sui_recipient.clone();
        record.slot = Clock::get()?.slot;
        record.created_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.lock_record;
        emit!(PwrcLockedForSui { owner: record.owner, lock_record: record.key(), requested_amount_atomic: amount_atomic, locked_atomic, nonce, sui_recipient });
        Ok(())
    }

    /// Releases canonical PWRC after an independently verified Sui burn/message.
    /// `message_hash` is a replay-protection key and creates a one-time release receipt.
    pub fn release_from_sui(
        ctx: Context<ReleaseFromSui>,
        amount_atomic: u64,
        message_hash: [u8; 32],
        sui_burn_nonce: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, BridgeError::Paused);
        require!(amount_atomic > 0, BridgeError::InvalidAmount);
        let seeds: &[&[u8]] = &[b"bridge-config", &[ctx.accounts.config.bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.reserve_vault.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[seeds],
            ),
            amount_atomic,
            ctx.accounts.mint.decimals,
        )?;

        let receipt = &mut ctx.accounts.release_receipt;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.amount_atomic = amount_atomic;
        receipt.message_hash = message_hash;
        receipt.sui_burn_nonce = sui_burn_nonce;
        receipt.released_at = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.release_receipt;
        emit!(PwrcReleasedFromSui { recipient: receipt.recipient, amount_atomic, message_hash, sui_burn_nonce });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeBridge<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = authority, space = 8 + BridgeConfig::INIT_SPACE, seeds = [b"bridge-config"], bump)]
    pub config: Account<'info, BridgeConfig>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = config,
        associated_token::token_program = token_program
    )]
    pub reserve_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BridgeAdmin<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"bridge-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, BridgeConfig>,
}

#[derive(Accounts)]
#[instruction(amount_atomic: u64, nonce: [u8; 32])]
pub struct LockToSui<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"bridge-config"],
        bump = config.bump,
        constraint = config.pwrc_mint == mint.key() @ BridgeError::MintMismatch,
        constraint = config.reserve_vault == reserve_vault.key() @ BridgeError::ReserveMismatch,
    )]
    pub config: Account<'info, BridgeConfig>,
    #[account(
        init,
        payer = owner,
        space = 8 + LockRecord::INIT_SPACE,
        seeds = [b"lock", owner.key().as_ref(), nonce.as_ref()],
        bump
    )]
    pub lock_record: Account<'info, LockRecord>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.reserve_vault @ BridgeError::ReserveMismatch)]
    pub reserve_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount_atomic: u64, message_hash: [u8; 32])]
pub struct ReleaseFromSui<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"bridge-config"],
        bump = config.bump,
        has_one = authority,
        constraint = config.pwrc_mint == mint.key() @ BridgeError::MintMismatch,
        constraint = config.reserve_vault == reserve_vault.key() @ BridgeError::ReserveMismatch,
    )]
    pub config: Account<'info, BridgeConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + ReleaseReceipt::INIT_SPACE,
        seeds = [b"release", message_hash.as_ref()],
        bump
    )]
    pub release_receipt: Account<'info, ReleaseReceipt>,
    /// CHECK: recipient wallet identity; token account constraint enforces ownership.
    pub recipient: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = recipient, token::token_program = token_program)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.reserve_vault @ BridgeError::ReserveMismatch)]
    pub reserve_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct BridgeConfig {
    pub authority: Pubkey,
    pub pwrc_mint: Pubkey,
    pub reserve_vault: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LockRecord {
    pub owner: Pubkey,
    pub amount_atomic: u64,
    pub nonce: [u8; 32],
    #[max_len(96)]
    pub sui_recipient: Vec<u8>,
    pub slot: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReleaseReceipt {
    pub recipient: Pubkey,
    pub amount_atomic: u64,
    pub message_hash: [u8; 32],
    pub sui_burn_nonce: [u8; 32],
    pub released_at: i64,
    pub bump: u8,
}

#[event]
pub struct PwrcLockedForSui { pub owner: Pubkey, pub lock_record: Pubkey, pub requested_amount_atomic: u64, pub locked_atomic: u64, pub nonce: [u8; 32], pub sui_recipient: Vec<u8> }
#[event]
pub struct PwrcReleasedFromSui { pub recipient: Pubkey, pub amount_atomic: u64, pub message_hash: [u8; 32], pub sui_burn_nonce: [u8; 32] }
#[event]
pub struct BridgePauseChanged { pub paused: bool }
#[event]
pub struct BridgeAuthorityRotated { pub old_authority: Pubkey, pub new_authority: Pubkey }

#[error_code]
pub enum BridgeError {
    #[msg("Bridge is paused")] Paused,
    #[msg("Invalid bridge amount")] InvalidAmount,
    #[msg("Token-2022 transfer produced an invalid net reserve credit")] InvalidNetAmount,
    #[msg("Arithmetic overflow/underflow")] MathOverflow,
    #[msg("Invalid Sui recipient payload")] InvalidSuiRecipient,
    #[msg("PWRC mint mismatch")] MintMismatch,
    #[msg("Bridge reserve account mismatch")] ReserveMismatch,
    #[msg("Invalid bridge authority")] InvalidAuthority,
}
