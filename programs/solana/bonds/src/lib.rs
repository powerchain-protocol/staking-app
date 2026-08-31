use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("EpqCcMN2Ac2SnQuQaXmmNh61q8mD2YexoiESHAZosRBD");

const MAX_SERVICE_TYPE: usize = 96;

#[program]
pub mod powerchain_bonds {
    use super::*;

    pub fn initialize_bonds(ctx: Context<InitializeBonds>, unbonding_seconds: i64) -> Result<()> {
        require!(unbonding_seconds >= 0, BondError::InvalidUnbondingPeriod);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.pwrc_mint = ctx.accounts.mint.key();
        cfg.vault = ctx.accounts.vault.key();
        cfg.unbonding_seconds = unbonding_seconds;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_paused(ctx: Context<BondAdmin>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(BondPauseChanged { paused });
        Ok(())
    }

    pub fn create_bond(
        ctx: Context<CreateBond>,
        role: u8,
        role_seed: String,
        service_hash: [u8; 32],
        service_type: String,
        amount_atomic: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, BondError::Paused);
        validate_role(role, &role_seed)?;
        require!(!service_type.is_empty() && service_type.len() <= MAX_SERVICE_TYPE, BondError::InvalidServiceType);
        require!(amount_atomic > 0, BondError::InvalidAmount);

        let vault_before = ctx.accounts.vault.amount;
        transfer_user_to_vault(
            &ctx.accounts.owner,
            &ctx.accounts.owner_token_account,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.vault.reload()?;
        let bonded_atomic = ctx.accounts.vault.amount.checked_sub(vault_before).ok_or(BondError::MathOverflow)?;
        require!(bonded_atomic > 0 && bonded_atomic <= amount_atomic, BondError::InvalidNetAmount);

        let now = Clock::get()?.unix_timestamp;
        let bond = &mut ctx.accounts.bond;
        bond.owner = ctx.accounts.owner.key();
        bond.role = role;
        bond.service_hash = service_hash;
        bond.service_type = service_type.clone();
        bond.amount_atomic = bonded_atomic;
        bond.status = BondStatus::Active;
        bond.unbonding_ends_at = 0;
        bond.created_at = now;
        bond.bump = ctx.bumps.bond;
        emit!(BondCreated { owner: bond.owner, bond: bond.key(), role, service_type, requested_amount_atomic: amount_atomic, bonded_atomic });
        Ok(())
    }

    pub fn increase_bond(
        ctx: Context<BondAction>,
        role: u8,
        role_seed: String,
        service_hash: [u8; 32],
        service_type: String,
        amount_atomic: u64,
    ) -> Result<()> {
        validate_action_identity(&ctx.accounts.bond, role, &role_seed, service_hash, &service_type)?;
        require!(!ctx.accounts.config.paused, BondError::Paused);
        require!(ctx.accounts.bond.status == BondStatus::Active, BondError::InvalidBondState);
        require!(amount_atomic > 0, BondError::InvalidAmount);
        let vault_before = ctx.accounts.vault.amount;
        transfer_user_to_vault(
            &ctx.accounts.owner,
            &ctx.accounts.owner_token_account,
            &ctx.accounts.vault,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.vault.reload()?;
        let bonded_added_atomic = ctx.accounts.vault.amount.checked_sub(vault_before).ok_or(BondError::MathOverflow)?;
        require!(bonded_added_atomic > 0 && bonded_added_atomic <= amount_atomic, BondError::InvalidNetAmount);
        ctx.accounts.bond.amount_atomic = ctx.accounts.bond.amount_atomic.checked_add(bonded_added_atomic).ok_or(BondError::MathOverflow)?;
        emit!(BondIncreased { owner: ctx.accounts.owner.key(), bond: ctx.accounts.bond.key(), requested_amount_atomic: amount_atomic, bonded_added_atomic });
        Ok(())
    }

    pub fn request_unbond(
        ctx: Context<BondAction>,
        role: u8,
        role_seed: String,
        service_hash: [u8; 32],
        service_type: String,
    ) -> Result<()> {
        validate_action_identity(&ctx.accounts.bond, role, &role_seed, service_hash, &service_type)?;
        require!(!ctx.accounts.config.paused, BondError::Paused);
        require!(ctx.accounts.bond.status == BondStatus::Active, BondError::InvalidBondState);
        let now = Clock::get()?.unix_timestamp;
        ctx.accounts.bond.status = BondStatus::Unbonding;
        ctx.accounts.bond.unbonding_ends_at = now.checked_add(ctx.accounts.config.unbonding_seconds).ok_or(BondError::MathOverflow)?;
        emit!(BondUnbondingStarted { owner: ctx.accounts.owner.key(), bond: ctx.accounts.bond.key(), ends_at: ctx.accounts.bond.unbonding_ends_at });
        Ok(())
    }

    pub fn withdraw_bond(
        ctx: Context<BondAction>,
        role: u8,
        role_seed: String,
        service_hash: [u8; 32],
        service_type: String,
        amount_atomic: u64,
    ) -> Result<()> {
        validate_action_identity(&ctx.accounts.bond, role, &role_seed, service_hash, &service_type)?;
        require!(!ctx.accounts.config.paused, BondError::Paused);
        require!(ctx.accounts.bond.status == BondStatus::Unbonding, BondError::InvalidBondState);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.bond.unbonding_ends_at, BondError::UnbondingNotFinished);
        require!(amount_atomic > 0 && amount_atomic == ctx.accounts.bond.amount_atomic, BondError::AmountMismatch);
        transfer_config_to_destination(
            &ctx.accounts.config,
            &ctx.accounts.vault,
            &ctx.accounts.owner_token_account,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.bond.amount_atomic = 0;
        ctx.accounts.bond.status = BondStatus::Withdrawn;
        emit!(BondWithdrawn { owner: ctx.accounts.owner.key(), bond: ctx.accounts.bond.key(), amount_atomic });
        Ok(())
    }

    /// Slash is an explicit administrative service-bond action. The destination must be
    /// a PWRC Token-2022 account and the event supplies an immutable evidence reference.
    pub fn slash_bond(ctx: Context<SlashBond>, amount_atomic: u64, evidence_hash: [u8; 32]) -> Result<()> {
        require!(!ctx.accounts.config.paused, BondError::Paused);
        require!(amount_atomic > 0 && amount_atomic <= ctx.accounts.bond.amount_atomic, BondError::InvalidSlashAmount);
        transfer_config_to_destination(
            &ctx.accounts.config,
            &ctx.accounts.vault,
            &ctx.accounts.slash_destination,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.bond.amount_atomic = ctx.accounts.bond.amount_atomic.checked_sub(amount_atomic).ok_or(BondError::MathOverflow)?;
        if ctx.accounts.bond.amount_atomic == 0 { ctx.accounts.bond.status = BondStatus::Slashed; }
        emit!(BondSlashed { bond: ctx.accounts.bond.key(), owner: ctx.accounts.bond.owner, amount_atomic, evidence_hash });
        Ok(())
    }
}

fn validate_role(role: u8, role_seed: &str) -> Result<()> {
    let expected = match role { 0 => "operator", 1 => "verifier", _ => return err!(BondError::InvalidRole) };
    require!(role_seed == expected, BondError::InvalidRole);
    Ok(())
}

fn validate_action_identity(bond: &Bond, role: u8, role_seed: &str, service_hash: [u8; 32], service_type: &str) -> Result<()> {
    validate_role(role, role_seed)?;
    require!(bond.role == role, BondError::BondIdentityMismatch);
    require!(bond.service_hash == service_hash && bond.service_type == service_type, BondError::BondIdentityMismatch);
    Ok(())
}

fn transfer_user_to_vault<'info>(
    owner: &Signer<'info>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new(
            token_program.to_account_info(),
            TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: owner.to_account_info() },
        ),
        amount,
        mint.decimals,
    )
}

fn transfer_config_to_destination<'info>(
    config: &Account<'info, BondConfig>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"bonds-config", &[config.bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked { from: from.to_account_info(), mint: mint.to_account_info(), to: to.to_account_info(), authority: config.to_account_info() },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

#[derive(Accounts)]
pub struct InitializeBonds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = authority, space = 8 + BondConfig::INIT_SPACE, seeds = [b"bonds-config"], bump)]
    pub config: Account<'info, BondConfig>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = config,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BondAdmin<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"bonds-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, BondConfig>,
}

#[derive(Accounts)]
#[instruction(role: u8, role_seed: String, service_hash: [u8; 32])]
pub struct CreateBond<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"bonds-config"],
        bump = config.bump,
        constraint = config.pwrc_mint == mint.key() @ BondError::MintMismatch,
        constraint = config.vault == vault.key() @ BondError::VaultMismatch,
    )]
    pub config: Account<'info, BondConfig>,
    #[account(
        init,
        payer = owner,
        space = 8 + Bond::INIT_SPACE,
        seeds = [b"bond", role_seed.as_bytes(), owner.key().as_ref(), service_hash.as_ref()],
        bump
    )]
    pub bond: Account<'info, Bond>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.vault @ BondError::VaultMismatch)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BondAction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"bonds-config"],
        bump = config.bump,
        constraint = config.pwrc_mint == mint.key() @ BondError::MintMismatch,
        constraint = config.vault == vault.key() @ BondError::VaultMismatch,
    )]
    pub config: Account<'info, BondConfig>,
    #[account(mut, has_one = owner)]
    pub bond: Account<'info, Bond>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = config.vault @ BondError::VaultMismatch)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    /// CHECK: retained as the final account for backend compatibility; not read by non-create actions.
    pub system_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SlashBond<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"bonds-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, BondConfig>,
    #[account(mut)]
    pub bond: Account<'info, Bond>,
    #[account(mut, address = config.vault @ BondError::VaultMismatch)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub slash_destination: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct BondConfig {
    pub authority: Pubkey,
    pub pwrc_mint: Pubkey,
    pub vault: Pubkey,
    pub unbonding_seconds: i64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bond {
    pub owner: Pubkey,
    pub role: u8,
    pub service_hash: [u8; 32],
    #[max_len(96)]
    pub service_type: String,
    pub amount_atomic: u64,
    pub status: BondStatus,
    pub unbonding_ends_at: i64,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BondStatus { Active, Unbonding, Withdrawn, Slashed }

#[event]
pub struct BondCreated { pub owner: Pubkey, pub bond: Pubkey, pub role: u8, pub service_type: String, pub requested_amount_atomic: u64, pub bonded_atomic: u64 }
#[event]
pub struct BondIncreased { pub owner: Pubkey, pub bond: Pubkey, pub requested_amount_atomic: u64, pub bonded_added_atomic: u64 }
#[event]
pub struct BondUnbondingStarted { pub owner: Pubkey, pub bond: Pubkey, pub ends_at: i64 }
#[event]
pub struct BondWithdrawn { pub owner: Pubkey, pub bond: Pubkey, pub amount_atomic: u64 }
#[event]
pub struct BondSlashed { pub bond: Pubkey, pub owner: Pubkey, pub amount_atomic: u64, pub evidence_hash: [u8; 32] }
#[event]
pub struct BondPauseChanged { pub paused: bool }

#[error_code]
pub enum BondError {
    #[msg("Bond program is paused")] Paused,
    #[msg("Invalid bond amount")] InvalidAmount,
    #[msg("Token-2022 transfer produced an invalid net bonded amount")] InvalidNetAmount,
    #[msg("Invalid service bond role")] InvalidRole,
    #[msg("Invalid service type")] InvalidServiceType,
    #[msg("Invalid service-bond state")] InvalidBondState,
    #[msg("Bond identity does not match role/service arguments")] BondIdentityMismatch,
    #[msg("Unbonding period has not finished")] UnbondingNotFinished,
    #[msg("Requested amount does not match authoritative bond principal")] AmountMismatch,
    #[msg("Invalid slash amount")] InvalidSlashAmount,
    #[msg("PWRC mint mismatch")] MintMismatch,
    #[msg("Bond vault mismatch")] VaultMismatch,
    #[msg("Invalid unbonding period")] InvalidUnbondingPeriod,
    #[msg("Arithmetic overflow/underflow")] MathOverflow,
}
