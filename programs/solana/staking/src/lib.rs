use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("GEEXw67SDvppmYS1arWpNBxxJgcK7js4YTYq2QQNAeSh");

const MAX_POOL_ID: usize = 32;
const MAX_INTENT_ID: usize = 64;

#[program]
pub mod powerchain_staking {
    use super::*;

    pub fn initialize_global(ctx: Context<InitializeGlobal>) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        config.authority = ctx.accounts.authority.key();
        config.pwrc_mint = ctx.accounts.mint.key();
        config.staking_vault = ctx.accounts.staking_vault.key();
        config.reward_vault = ctx.accounts.reward_vault.key();
        config.paused = false;
        config.bump = ctx.bumps.global_config;
        Ok(())
    }

    pub fn create_pool(
        ctx: Context<CreatePool>,
        pool_id: String,
        lock_seconds: i64,
        cooldown_seconds: i64,
        governance_multiplier_bps: u32,
    ) -> Result<()> {
        require!(!pool_id.is_empty() && pool_id.len() <= MAX_POOL_ID, StakingError::InvalidPoolId);
        require!(lock_seconds >= 0 && cooldown_seconds >= 0, StakingError::InvalidDuration);
        require!(governance_multiplier_bps > 0, StakingError::InvalidMultiplier);
        let pool = &mut ctx.accounts.pool;
        pool.pool_id = pool_id;
        pool.lock_seconds = lock_seconds;
        pool.cooldown_seconds = cooldown_seconds;
        pool.governance_multiplier_bps = governance_multiplier_bps;
        pool.total_staked = 0;
        pool.enabled = true;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    pub fn update_pool(
        ctx: Context<UpdatePool>,
        lock_seconds: i64,
        cooldown_seconds: i64,
        governance_multiplier_bps: u32,
        enabled: bool,
    ) -> Result<()> {
        require!(lock_seconds >= 0 && cooldown_seconds >= 0, StakingError::InvalidDuration);
        require!(governance_multiplier_bps > 0, StakingError::InvalidMultiplier);
        let pool = &mut ctx.accounts.pool;
        pool.lock_seconds = lock_seconds;
        pool.cooldown_seconds = cooldown_seconds;
        pool.governance_multiplier_bps = governance_multiplier_bps;
        pool.enabled = enabled;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.global_config.paused = paused;
        emit!(StakingPauseChanged { paused });
        Ok(())
    }

    pub fn rotate_authority(ctx: Context<AdminConfig>, new_authority: Pubkey) -> Result<()> {
        require!(new_authority != Pubkey::default(), StakingError::InvalidAuthority);
        let old = ctx.accounts.global_config.authority;
        ctx.accounts.global_config.authority = new_authority;
        emit!(StakingAuthorityRotated { old_authority: old, new_authority });
        Ok(())
    }

    pub fn stake(
        ctx: Context<Stake>,
        amount_atomic: u64,
        pool_id: String,
        intent_seed: [u8; 32],
        intent_id: String,
    ) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(amount_atomic > 0, StakingError::InvalidAmount);
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        require!(ctx.accounts.pool.enabled, StakingError::PoolDisabled);
        require!(ctx.accounts.pool.pool_id == pool_id, StakingError::PoolMismatch);

        let vault_before = ctx.accounts.staking_vault.amount;
        transfer_user_to_vault(
            &ctx.accounts.owner,
            &ctx.accounts.user_token_account,
            &ctx.accounts.staking_vault,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.staking_vault.reload()?;
        let principal_atomic = ctx.accounts.staking_vault.amount.checked_sub(vault_before).ok_or(StakingError::MathOverflow)?;
        require!(principal_atomic > 0 && principal_atomic <= amount_atomic, StakingError::InvalidNetAmount);

        let now = Clock::get()?.unix_timestamp;
        let lock_end = now.checked_add(ctx.accounts.pool.lock_seconds).ok_or(StakingError::MathOverflow)?;
        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.pool = ctx.accounts.pool.key();
        position.pool_id = pool_id.clone();
        position.principal_atomic = principal_atomic;
        position.claimable_rewards_atomic = 0;
        position.total_claimed_atomic = 0;
        position.lock_ends_at = lock_end;
        position.unbonding_ends_at = 0;
        position.status = if ctx.accounts.pool.lock_seconds > 0 { PositionStatus::Locked } else { PositionStatus::Active };
        position.created_at = now;
        position.intent_seed = intent_seed;
        position.bump = ctx.bumps.position;

        ctx.accounts.pool.total_staked = ctx.accounts.pool.total_staked.checked_add(principal_atomic).ok_or(StakingError::MathOverflow)?;
        emit!(StakeCreated {
            owner: position.owner,
            position: position.key(),
            pool_id,
            requested_amount_atomic: amount_atomic,
            principal_atomic,
            intent_id,
        });
        Ok(())
    }

    pub fn increase_stake(ctx: Context<PositionAction>, amount_atomic: u64, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(amount_atomic > 0, StakingError::InvalidAmount);
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        require!(matches!(ctx.accounts.position.status, PositionStatus::Active | PositionStatus::Locked), StakingError::InvalidPositionState);

        let vault_before = ctx.accounts.staking_vault.amount;
        transfer_user_to_vault(
            &ctx.accounts.owner,
            &ctx.accounts.user_token_account,
            &ctx.accounts.staking_vault,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.staking_vault.reload()?;
        let principal_added_atomic = ctx.accounts.staking_vault.amount.checked_sub(vault_before).ok_or(StakingError::MathOverflow)?;
        require!(principal_added_atomic > 0 && principal_added_atomic <= amount_atomic, StakingError::InvalidNetAmount);
        ctx.accounts.position.principal_atomic = ctx.accounts.position.principal_atomic.checked_add(principal_added_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.pool.total_staked = ctx.accounts.pool.total_staked.checked_add(principal_added_atomic).ok_or(StakingError::MathOverflow)?;
        emit!(StakeIncreased { owner: ctx.accounts.owner.key(), position: ctx.accounts.position.key(), requested_amount_atomic: amount_atomic, principal_added_atomic, intent_id });
        Ok(())
    }

    pub fn request_unstake(ctx: Context<PositionAction>, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        let now = Clock::get()?.unix_timestamp;
        require!(matches!(ctx.accounts.position.status, PositionStatus::Active | PositionStatus::Locked), StakingError::InvalidPositionState);
        require!(now >= ctx.accounts.position.lock_ends_at, StakingError::PositionLocked);
        ctx.accounts.position.status = PositionStatus::Unbonding;
        ctx.accounts.position.unbonding_ends_at = now.checked_add(ctx.accounts.pool.cooldown_seconds).ok_or(StakingError::MathOverflow)?;
        emit!(UnstakeRequested {
            owner: ctx.accounts.owner.key(),
            position: ctx.accounts.position.key(),
            unbonding_ends_at: ctx.accounts.position.unbonding_ends_at,
            intent_id,
        });
        Ok(())
    }

    pub fn cancel_unstake(ctx: Context<PositionAction>, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.position.status == PositionStatus::Unbonding, StakingError::InvalidPositionState);
        require!(now < ctx.accounts.position.unbonding_ends_at, StakingError::AlreadyWithdrawable);
        ctx.accounts.position.status = PositionStatus::Active;
        ctx.accounts.position.unbonding_ends_at = 0;
        emit!(UnstakeCancelled { owner: ctx.accounts.owner.key(), position: ctx.accounts.position.key(), intent_id });
        Ok(())
    }

    pub fn withdraw(ctx: Context<PositionAction>, amount_atomic: u64, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.position.status == PositionStatus::Unbonding, StakingError::InvalidPositionState);
        require!(now >= ctx.accounts.position.unbonding_ends_at, StakingError::UnbondingNotFinished);
        require!(amount_atomic == ctx.accounts.position.principal_atomic && amount_atomic > 0, StakingError::AmountMismatch);

        transfer_config_to_user(
            &ctx.accounts.global_config,
            &ctx.accounts.staking_vault,
            &ctx.accounts.user_token_account,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.pool.total_staked = ctx.accounts.pool.total_staked.checked_sub(amount_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.position.principal_atomic = 0;
        ctx.accounts.position.status = PositionStatus::Closed;
        emit!(StakeWithdrawn { owner: ctx.accounts.owner.key(), position: ctx.accounts.position.key(), amount_atomic, intent_id });
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<PositionAction>, amount_atomic: u64, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        require!(matches!(ctx.accounts.position.status, PositionStatus::Active | PositionStatus::Locked), StakingError::InvalidPositionState);
        require!(amount_atomic > 0 && amount_atomic <= ctx.accounts.position.claimable_rewards_atomic, StakingError::RewardEntitlementExceeded);

        transfer_config_to_user(
            &ctx.accounts.global_config,
            &ctx.accounts.reward_vault,
            &ctx.accounts.user_token_account,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.position.claimable_rewards_atomic = ctx.accounts.position.claimable_rewards_atomic.checked_sub(amount_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.position.total_claimed_atomic = ctx.accounts.position.total_claimed_atomic.checked_add(amount_atomic).ok_or(StakingError::MathOverflow)?;
        emit!(RewardsClaimed { owner: ctx.accounts.owner.key(), position: ctx.accounts.position.key(), amount_atomic, intent_id });
        Ok(())
    }

    pub fn compound_rewards(ctx: Context<PositionAction>, amount_atomic: u64, intent_id: String) -> Result<()> {
        validate_intent(&intent_id)?;
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        require!(matches!(ctx.accounts.position.status, PositionStatus::Active | PositionStatus::Locked), StakingError::InvalidPositionState);
        require!(amount_atomic > 0 && amount_atomic <= ctx.accounts.position.claimable_rewards_atomic, StakingError::RewardEntitlementExceeded);

        let staking_vault_before = ctx.accounts.staking_vault.amount;
        transfer_config_between_vaults(
            &ctx.accounts.global_config,
            &ctx.accounts.reward_vault,
            &ctx.accounts.staking_vault,
            &ctx.accounts.mint,
            &ctx.accounts.token_program,
            amount_atomic,
        )?;
        ctx.accounts.staking_vault.reload()?;
        let principal_added_atomic = ctx.accounts.staking_vault.amount.checked_sub(staking_vault_before).ok_or(StakingError::MathOverflow)?;
        require!(principal_added_atomic > 0 && principal_added_atomic <= amount_atomic, StakingError::InvalidNetAmount);
        ctx.accounts.position.claimable_rewards_atomic = ctx.accounts.position.claimable_rewards_atomic.checked_sub(amount_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.position.total_claimed_atomic = ctx.accounts.position.total_claimed_atomic.checked_add(amount_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.position.principal_atomic = ctx.accounts.position.principal_atomic.checked_add(principal_added_atomic).ok_or(StakingError::MathOverflow)?;
        ctx.accounts.pool.total_staked = ctx.accounts.pool.total_staked.checked_add(principal_added_atomic).ok_or(StakingError::MathOverflow)?;
        emit!(RewardsCompounded { owner: ctx.accounts.owner.key(), position: ctx.accounts.position.key(), reward_amount_atomic: amount_atomic, principal_added_atomic, intent_id });
        Ok(())
    }

    /// Publishes an already-accounted reward entitlement to the on-chain position.
    /// The backend reward epoch engine remains responsible for funded-source accounting;
    /// this instruction is the on-chain ceiling that prevents a user-crafted claim from
    /// withdrawing more than the published entitlement.
    pub fn accrue_rewards(ctx: Context<AccrueRewards>, amount_atomic: u64, accounting_ref: [u8; 32]) -> Result<()> {
        require!(amount_atomic > 0, StakingError::InvalidAmount);
        require!(!ctx.accounts.global_config.paused, StakingError::Paused);
        ctx.accounts.position.claimable_rewards_atomic = ctx.accounts.position.claimable_rewards_atomic.checked_add(amount_atomic).ok_or(StakingError::MathOverflow)?;
        emit!(RewardsAccrued {
            position: ctx.accounts.position.key(),
            amount_atomic,
            accounting_ref,
        });
        Ok(())
    }
}

fn validate_intent(intent_id: &str) -> Result<()> {
    require!(!intent_id.is_empty() && intent_id.len() <= MAX_INTENT_ID, StakingError::InvalidIntentId);
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
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: owner.to_account_info(),
            },
        ),
        amount,
        mint.decimals,
    )
}

fn transfer_config_to_user<'info>(
    config: &Account<'info, GlobalConfig>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"global-config", &[config.bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

fn transfer_config_between_vaults<'info>(
    config: &Account<'info, GlobalConfig>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    transfer_config_to_user(config, from, to, mint, token_program, amount)
}

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"global-config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = global_config,
        associated_token::token_program = token_program,
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = authority,
        seeds = [b"reward-vault"],
        bump,
        token::mint = mint,
        token::authority = global_config,
        token::token_program = token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pool_id: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"global-config"], bump = global_config.bump, has_one = authority)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", pool_id.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global-config"], bump = global_config.bump, has_one = authority)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"global-config"], bump = global_config.bump, has_one = authority)]
    pub global_config: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
#[instruction(amount_atomic: u64, pool_id: String, intent_seed: [u8; 32], intent_id: String)]
pub struct Stake<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"global-config"],
        bump = global_config.bump,
        constraint = global_config.pwrc_mint == mint.key() @ StakingError::MintMismatch,
        constraint = global_config.staking_vault == staking_vault.key() @ StakingError::VaultMismatch,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"pool", pool_id.as_bytes()], bump = pool.bump)]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", owner.key().as_ref(), intent_seed.as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = global_config.staking_vault @ StakingError::VaultMismatch)]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PositionAction<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"global-config"],
        bump = global_config.bump,
        constraint = global_config.pwrc_mint == mint.key() @ StakingError::MintMismatch,
        constraint = global_config.staking_vault == staking_vault.key() @ StakingError::VaultMismatch,
        constraint = global_config.reward_vault == reward_vault.key() @ StakingError::VaultMismatch,
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    #[account(mut, has_one = owner, constraint = position.pool == pool.key() @ StakingError::PoolMismatch, constraint = position.pool_id == pool.pool_id @ StakingError::PoolMismatch)]
    pub position: Account<'info, Position>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = global_config.staking_vault @ StakingError::VaultMismatch)]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, address = global_config.reward_vault @ StakingError::VaultMismatch)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AccrueRewards<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global-config"], bump = global_config.bump, has_one = authority)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub pwrc_mint: Pubkey,
    pub staking_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    #[max_len(32)]
    pub pool_id: String,
    pub lock_seconds: i64,
    pub cooldown_seconds: i64,
    pub governance_multiplier_bps: u32,
    pub total_staked: u64,
    pub enabled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub pool: Pubkey,
    #[max_len(32)]
    pub pool_id: String,
    pub principal_atomic: u64,
    pub claimable_rewards_atomic: u64,
    pub total_claimed_atomic: u64,
    pub lock_ends_at: i64,
    pub unbonding_ends_at: i64,
    pub status: PositionStatus,
    pub created_at: i64,
    pub intent_seed: [u8; 32],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionStatus {
    Active,
    Locked,
    Unbonding,
    Closed,
}

#[event]
pub struct StakeCreated { pub owner: Pubkey, pub position: Pubkey, pub pool_id: String, pub requested_amount_atomic: u64, pub principal_atomic: u64, pub intent_id: String }
#[event]
pub struct StakeIncreased { pub owner: Pubkey, pub position: Pubkey, pub requested_amount_atomic: u64, pub principal_added_atomic: u64, pub intent_id: String }
#[event]
pub struct UnstakeRequested { pub owner: Pubkey, pub position: Pubkey, pub unbonding_ends_at: i64, pub intent_id: String }
#[event]
pub struct UnstakeCancelled { pub owner: Pubkey, pub position: Pubkey, pub intent_id: String }
#[event]
pub struct StakeWithdrawn { pub owner: Pubkey, pub position: Pubkey, pub amount_atomic: u64, pub intent_id: String }
#[event]
pub struct RewardsAccrued { pub position: Pubkey, pub amount_atomic: u64, pub accounting_ref: [u8; 32] }
#[event]
pub struct RewardsClaimed { pub owner: Pubkey, pub position: Pubkey, pub amount_atomic: u64, pub intent_id: String }
#[event]
pub struct RewardsCompounded { pub owner: Pubkey, pub position: Pubkey, pub reward_amount_atomic: u64, pub principal_added_atomic: u64, pub intent_id: String }
#[event]
pub struct StakingPauseChanged { pub paused: bool }
#[event]
pub struct StakingAuthorityRotated { pub old_authority: Pubkey, pub new_authority: Pubkey }

#[error_code]
pub enum StakingError {
    #[msg("Staking program is paused")] Paused,
    #[msg("Invalid amount")] InvalidAmount,
    #[msg("Token-2022 transfer produced an invalid net credited amount")] InvalidNetAmount,
    #[msg("Invalid staking pool id")] InvalidPoolId,
    #[msg("Invalid intent id")] InvalidIntentId,
    #[msg("Invalid lock or cooldown duration")] InvalidDuration,
    #[msg("Invalid governance multiplier")] InvalidMultiplier,
    #[msg("Staking pool is disabled")] PoolDisabled,
    #[msg("Pool account does not match the requested position/pool")] PoolMismatch,
    #[msg("PWRC mint does not match global configuration")] MintMismatch,
    #[msg("Configured vault does not match global configuration")] VaultMismatch,
    #[msg("Position state does not permit this operation")] InvalidPositionState,
    #[msg("Position is still locked")] PositionLocked,
    #[msg("Position has already completed its unbonding period")] AlreadyWithdrawable,
    #[msg("Unbonding period has not finished")] UnbondingNotFinished,
    #[msg("Requested amount does not match authoritative position principal")] AmountMismatch,
    #[msg("Requested reward exceeds the published on-chain reward entitlement")] RewardEntitlementExceeded,
    #[msg("Arithmetic overflow/underflow")] MathOverflow,
    #[msg("Invalid protocol authority")] InvalidAuthority,
}
