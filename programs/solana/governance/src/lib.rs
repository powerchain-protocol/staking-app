use anchor_lang::prelude::*;

declare_id!("9KMi9SuzLHujJTVVuuzKrkVQ5V49ye8Qdw6snTohDbX7");

const MAX_PROPOSAL_KEY: usize = 96;

#[program]
pub mod powerchain_governance {
    use super::*;

    pub fn initialize_governance(
        ctx: Context<InitializeGovernance>,
        quorum_bps: u16,
        execution_delay_seconds: i64,
    ) -> Result<()> {
        require!(quorum_bps <= 10_000, GovernanceError::InvalidQuorum);
        require!(execution_delay_seconds >= 0, GovernanceError::InvalidExecutionDelay);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.quorum_bps = quorum_bps;
        cfg.execution_delay_seconds = execution_delay_seconds;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_paused(ctx: Context<GovernanceAdmin>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        emit!(GovernancePauseChanged { paused });
        Ok(())
    }

    pub fn set_voter_weight(
        ctx: Context<SetVoterWeight>,
        weight_atomic: u128,
        source_ref: [u8; 32],
    ) -> Result<()> {
        let record = &mut ctx.accounts.voter_weight;
        record.owner = ctx.accounts.owner.key();
        record.weight_atomic = weight_atomic;
        record.source_ref = source_ref;
        record.updated_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.voter_weight;
        emit!(VoterWeightPublished { owner: record.owner, weight_atomic, source_ref });
        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_seed: [u8; 32],
        proposal_key: String,
        voting_starts_at: i64,
        voting_ends_at: i64,
        total_eligible_weight_atomic: u128,
        action_hash: [u8; 32],
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GovernanceError::Paused);
        require!(!proposal_key.is_empty() && proposal_key.len() <= MAX_PROPOSAL_KEY, GovernanceError::InvalidProposalKey);
        require!(voting_ends_at > voting_starts_at, GovernanceError::InvalidVotingWindow);
        let proposal = &mut ctx.accounts.proposal;
        proposal.proposal_seed = proposal_seed;
        proposal.proposal_key = proposal_key.clone();
        proposal.proposer = ctx.accounts.authority.key();
        proposal.voting_starts_at = voting_starts_at;
        proposal.voting_ends_at = voting_ends_at;
        proposal.total_eligible_weight_atomic = total_eligible_weight_atomic;
        proposal.for_weight_atomic = 0;
        proposal.against_weight_atomic = 0;
        proposal.abstain_weight_atomic = 0;
        proposal.action_hash = action_hash;
        proposal.executed_at = 0;
        proposal.status = ProposalStatus::Active;
        proposal.bump = ctx.bumps.proposal;
        emit!(ProposalCreated { proposal: proposal.key(), proposal_key, voting_starts_at, voting_ends_at, action_hash });
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, choice: u8) -> Result<()> {
        require!(!ctx.accounts.config.paused, GovernanceError::Paused);
        let now = Clock::get()?.unix_timestamp;
        require!(ctx.accounts.proposal.status == ProposalStatus::Active, GovernanceError::ProposalNotActive);
        require!(now >= ctx.accounts.proposal.voting_starts_at && now < ctx.accounts.proposal.voting_ends_at, GovernanceError::VotingClosed);
        let weight = ctx.accounts.voter_weight.weight_atomic;
        require!(weight > 0, GovernanceError::NoVotingWeight);

        match choice {
            0 => ctx.accounts.proposal.for_weight_atomic = ctx.accounts.proposal.for_weight_atomic.checked_add(weight).ok_or(GovernanceError::MathOverflow)?,
            1 => ctx.accounts.proposal.against_weight_atomic = ctx.accounts.proposal.against_weight_atomic.checked_add(weight).ok_or(GovernanceError::MathOverflow)?,
            2 => ctx.accounts.proposal.abstain_weight_atomic = ctx.accounts.proposal.abstain_weight_atomic.checked_add(weight).ok_or(GovernanceError::MathOverflow)?,
            _ => return err!(GovernanceError::InvalidChoice),
        }

        let record = &mut ctx.accounts.vote_record;
        record.proposal = ctx.accounts.proposal.key();
        record.voter = ctx.accounts.voter.key();
        record.choice = choice;
        record.weight_atomic = weight;
        record.voted_at = now;
        record.bump = ctx.bumps.vote_record;
        emit!(VoteCast { proposal: record.proposal, voter: record.voter, choice, weight_atomic: weight });
        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GovernanceError::Paused);
        let now = Clock::get()?.unix_timestamp;
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.status == ProposalStatus::Active || proposal.status == ProposalStatus::Passed, GovernanceError::ProposalNotExecutable);
        require!(now >= proposal.voting_ends_at, GovernanceError::VotingStillOpen);

        let participating = proposal.for_weight_atomic
            .checked_add(proposal.against_weight_atomic).ok_or(GovernanceError::MathOverflow)?
            .checked_add(proposal.abstain_weight_atomic).ok_or(GovernanceError::MathOverflow)?;
        let quorum_met = if proposal.total_eligible_weight_atomic == 0 {
            false
        } else {
            participating.saturating_mul(10_000) >= proposal.total_eligible_weight_atomic.saturating_mul(ctx.accounts.config.quorum_bps as u128)
        };
        require!(quorum_met, GovernanceError::QuorumNotMet);
        require!(proposal.for_weight_atomic > proposal.against_weight_atomic, GovernanceError::ProposalRejected);

        let executable_at = proposal.voting_ends_at
            .checked_add(ctx.accounts.config.execution_delay_seconds)
            .ok_or(GovernanceError::MathOverflow)?;
        require!(now >= executable_at, GovernanceError::ExecutionTimelock);

        proposal.status = ProposalStatus::Executed;
        proposal.executed_at = now;
        emit!(ProposalExecuted {
            proposal: proposal.key(),
            proposal_key: proposal.proposal_key.clone(),
            action_hash: proposal.action_hash,
            executor: ctx.accounts.executor.key(),
            executed_at: now,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + GovernanceConfig::INIT_SPACE, seeds = [b"governance-config"], bump)]
    pub config: Account<'info, GovernanceConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GovernanceAdmin<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"governance-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, GovernanceConfig>,
}

#[derive(Accounts)]
pub struct SetVoterWeight<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"governance-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, GovernanceConfig>,
    /// CHECK: wallet identity only; no data is read.
    pub owner: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + VoterWeight::INIT_SPACE,
        seeds = [b"voter-weight", owner.key().as_ref()],
        bump
    )]
    pub voter_weight: Account<'info, VoterWeight>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_seed: [u8; 32])]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"governance-config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [b"proposal", proposal_seed.as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"governance-config"], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(seeds = [b"voter-weight", voter.key().as_ref()], bump = voter_weight.bump, constraint = voter_weight.owner == voter.key() @ GovernanceError::VoterWeightOwnerMismatch)]
    pub voter_weight: Account<'info, VoterWeight>,
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub executor: Signer<'info>,
    #[account(seeds = [b"governance-config"], bump = config.bump)]
    pub config: Account<'info, GovernanceConfig>,
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

#[account]
#[derive(InitSpace)]
pub struct GovernanceConfig {
    pub authority: Pubkey,
    pub quorum_bps: u16,
    pub execution_delay_seconds: i64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoterWeight {
    pub owner: Pubkey,
    pub weight_atomic: u128,
    pub source_ref: [u8; 32],
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Proposal {
    pub proposal_seed: [u8; 32],
    #[max_len(96)]
    pub proposal_key: String,
    pub proposer: Pubkey,
    pub voting_starts_at: i64,
    pub voting_ends_at: i64,
    pub total_eligible_weight_atomic: u128,
    pub for_weight_atomic: u128,
    pub against_weight_atomic: u128,
    pub abstain_weight_atomic: u128,
    pub action_hash: [u8; 32],
    pub executed_at: i64,
    pub status: ProposalStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: u8,
    pub weight_atomic: u128,
    pub voted_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProposalStatus { Active, Passed, Rejected, Executed, Cancelled }

#[event]
pub struct VoterWeightPublished { pub owner: Pubkey, pub weight_atomic: u128, pub source_ref: [u8; 32] }
#[event]
pub struct ProposalCreated { pub proposal: Pubkey, pub proposal_key: String, pub voting_starts_at: i64, pub voting_ends_at: i64, pub action_hash: [u8; 32] }
#[event]
pub struct VoteCast { pub proposal: Pubkey, pub voter: Pubkey, pub choice: u8, pub weight_atomic: u128 }
#[event]
pub struct ProposalExecuted { pub proposal: Pubkey, pub proposal_key: String, pub action_hash: [u8; 32], pub executor: Pubkey, pub executed_at: i64 }
#[event]
pub struct GovernancePauseChanged { pub paused: bool }

#[error_code]
pub enum GovernanceError {
    #[msg("Governance program is paused")] Paused,
    #[msg("Quorum basis points must be <= 10000")] InvalidQuorum,
    #[msg("Execution delay must be non-negative")] InvalidExecutionDelay,
    #[msg("Invalid proposal key")] InvalidProposalKey,
    #[msg("Invalid voting window")] InvalidVotingWindow,
    #[msg("Proposal is not active")] ProposalNotActive,
    #[msg("Voting window is closed or has not started")] VotingClosed,
    #[msg("Voter has no published voting weight")] NoVotingWeight,
    #[msg("Voter-weight record owner does not match the signing wallet")] VoterWeightOwnerMismatch,
    #[msg("Vote choice must be FOR, AGAINST or ABSTAIN")] InvalidChoice,
    #[msg("Proposal cannot be executed in its current state")] ProposalNotExecutable,
    #[msg("Voting period is still open")] VotingStillOpen,
    #[msg("Proposal quorum was not met")] QuorumNotMet,
    #[msg("Proposal did not receive more FOR than AGAINST weight")] ProposalRejected,
    #[msg("Governance execution timelock has not elapsed")] ExecutionTimelock,
    #[msg("Arithmetic overflow")] MathOverflow,
}
