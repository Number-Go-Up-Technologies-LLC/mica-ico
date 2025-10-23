#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

use anchor_spl::token::{self, Token, TokenAccount, Mint,Transfer};
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::system_instruction;

declare_id!("BUYLB52z4smtpLUMosr45FckaC1DhhFL9HHiUMUBNM5m");

#[program]
pub mod swan {
    use super::*;

    pub fn init(
        ctx: Context<Initialize>,
        token_provider: Pubkey,
        beneficiary: Pubkey,
        safeguarding_account: Pubkey,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(!state.initialized, CustomError::AlreadyInitialized);

        state.token_provider = token_provider;
        state.beneficiary = beneficiary;
        state.safeguarding_account = safeguarding_account;
        state.initialized = true;
        state.raise_cap = 5_000_000_000_000; // Hardcoded raise of 5,000 SOL

        msg!("MiCA-compliant ICO contract initialized; token provider: {}, beneficiary: {}, safeguarding_account: {}, raise cap: {}", 
          token_provider, beneficiary, safeguarding_account, state.raise_cap);

        Ok(())
    }

    // Deposit tokens to the ICO contract.
    // Can be called only once by the token provider
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.token_authority.key() == state.token_provider,
            CustomError::UnauthorizedCaller
        );
        require!(state.total_tokens == 0, CustomError::TokensAlreadyDeposited);

        let cpi_accounts = Transfer {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.program_token_account.to_account_info(),
            authority: ctx.accounts.token_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        state.token_mint = ctx.accounts.token_mint.key();
        state.total_tokens = amount;

        msg!(
            "Tokens deposited; total tokens: {}, token mint: {}",
            amount,
            ctx.accounts.token_mint.key()
        );

        Ok(())
    }

    pub fn activate(ctx: Context<Activate>, duration: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.token_provider.key() == state.token_provider,
            CustomError::UnauthorizedCaller
        );
        require!(!state.participation_active, CustomError::AlreadyActivated);

        state.participation_active = true;
        state.duration = duration;  // Save the duration
        state.participation_end = Clock::get()?.unix_timestamp as u64 + duration;

        msg!(
            "Participation period activated; participation period ends at: {}",
            state.participation_end
        );

        Ok(())
    }

    // Initialize a participant's participation account.
    // Must be called by the participant before participating.
    pub fn init_participant(ctx: Context<InitParticipant>) -> Result<()> {
        let mut participant = ctx.accounts.participant_account.load_init()?;
        participant.participant = ctx.accounts.participant.key();
        participant.amount = 0;
        participant.participation_time = 0;
        participant.cancelled = 0;
        
        Ok(())
    }

    pub fn participate(ctx: Context<Participate>, amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(state.participation_active, CustomError::NotActive);
        require!(Clock::get()?.unix_timestamp as u64 <= state.participation_end, CustomError::ParticipationClosed);
        require!(state.total_contributed + amount <= state.raise_cap, CustomError::RaiseCapExceeded);

        let mut participant = ctx.accounts.participant_account.load_mut()?;
        require!(participant.cancelled != 1, CustomError::ParticipationCancelledAlready);
        
        // Add check for maximum investment cap (250 SOL = 250_000_000_000 lamports)
        require!(
            participant.amount + amount <= 250_000_000_000,
            CustomError::MaxContributionExceeded
        );

        if participant.amount == 0 {
            state.unique_investor_count += 1;
            // Set early investor flag if they're among first 100
            if state.unique_investor_count <= 100 {
                participant.is_early_investor = 1;
                state.active_early_investor_count += 1;
            }
        }

        let was_large_investor = participant.amount >= 100_000_000_000;
        participant.amount += amount;
        let is_large_investor = participant.amount >= 100_000_000_000;

        // Update large investor count if status changed
        if !was_large_investor && is_large_investor {
            state.large_investor_count += 1;
        }

        participant.participation_time = Clock::get()?.unix_timestamp as u64;
        state.total_contributed = state.total_contributed
            .checked_add(amount)
            .ok_or(CustomError::ArithmeticOverflow)?;

       // Perform the transfer using the System Program
    let transfer_instruction = system_instruction::transfer(
        &ctx.accounts.participant.key(),
        &ctx.accounts.state.key(),
        amount,
    );

    invoke(
        &transfer_instruction,
        &[
            ctx.accounts.participant.to_account_info(),
            ctx.accounts.state.to_account_info(),
        ],
    )?;

        Ok(())
    }

    // Cancel participation and signal intent to cancel (must be done within 14 days of participation).
    // Can be called by the participant
    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let mut participant = ctx.accounts.participant_account.load_mut()?;
        let now = Clock::get()?.unix_timestamp as u64;

        require!(now <= state.participation_end, CustomError::WithdrawalClosed);
        require!(!state.tokens_distributed, CustomError::DistributionAlreadyStarted);
        
        let amount = participant.amount;
        require!(amount > 0, CustomError::NoContribution);
        require!(participant.cancelled == 0, CustomError::AlreadyCancelled);

        // Decrease large investor count if applicable
        if amount >= 100_000_000_000 {
            state.large_investor_count = state.large_investor_count.saturating_sub(1);
        }

        // Clear early investor flag and decrement active count
        if participant.is_early_investor == 1 {
            participant.is_early_investor = 0;
            state.active_early_investor_count = state.active_early_investor_count.saturating_sub(1);
        }

        state.total_cancelled += amount;
        participant.cancelled = 1;
        state.total_contributed -= amount;

        Ok(())
    }

    // Moves the SOL to the safeguarding account
    pub fn safeguard(ctx: Context<Safeguard>) -> Result<()> {
        let state = &ctx.accounts.state;
        require!(!state.tokens_distributed, CustomError::DistributionAlreadyStarted);   // Safeguarding can only be called before the distribution period starts
        require!(
            ctx.accounts.safeguarding_account.key() == state.safeguarding_account,
            CustomError::UnauthorizedSafeguardingAccount
        );

        let lamports = ctx.accounts.state.to_account_info().lamports();
        // Calculate the rent-exemption balance for the state account
        let rent = Rent::get()?;
        let rent_exempt_balance = rent.minimum_balance(ctx.accounts.state.to_account_info().data_len());
        
        // Transfer all lamports except rent-exempt balance and the amount reserved for refunds
        let transfer_amount = lamports - state.total_cancelled - rent_exempt_balance;
        **ctx.accounts.state.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
        **ctx.accounts.safeguarding_account.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

        msg!(
            "Funds safeguarded; amount: {}, safeguarding account: {}",
            transfer_amount,
            ctx.accounts.safeguarding_account.key()
        );

        Ok(())
    }


    // Begin distribution period
    // Participation period have ended and the duration has passed
    // Can be called by anyone
    pub fn distribute(ctx: Context<Distribute>) -> Result<()> {
        let lamports = ctx.accounts.state.to_account_info().lamports();
        let now = Clock::get()?.unix_timestamp as u64;
        // Calculate the rent-exemption balance for the state account
        let rent = Rent::get()?;
        let rent_exempt_balance = rent.minimum_balance(ctx.accounts.state.to_account_info().data_len());

        {
            let state = &mut ctx.accounts.state;
            let distribution_start_time = state.participation_end + state.duration;  // Use stored duration
            
            require!(now >= distribution_start_time, CustomError::WithdrawalWindowStillOpen);
            
            // Check if there are sufficient funds for refunds
            if lamports < state.total_cancelled {
                let missing_amount = state.total_cancelled.saturating_sub(lamports);
                msg!("Insufficient balance for refunds. Missing {} lamports", missing_amount);
                return Err(CustomError::InsufficientRefundBalance.into());
            }

            state.tokens_distributed = true;
            state.recipient_lamports = lamports - rent_exempt_balance;
        }

        // Transfer non-cancelled amount to beneficiary
        let transfer_amount = lamports - rent_exempt_balance;
        **ctx.accounts.state.to_account_info().try_borrow_mut_lamports()? -= transfer_amount;
        **ctx.accounts.beneficiary.to_account_info().try_borrow_mut_lamports()? += transfer_amount;

        msg!("Distribution period started; beneficiary: {}, recipient lamports: {}, reserved for refunds: {}", 
            ctx.accounts.state.beneficiary, 
            transfer_amount,
            ctx.accounts.state.total_cancelled
        );

        Ok(())
    }

    // Participant claims their tokens
    // Distribution period has started
    // Can be called by the participant
    pub fn claim(ctx: Context<Claim>, _program_token_account_bump: u8) -> Result<()> {
        let state = &ctx.accounts.state;
        let participant = ctx.accounts.participant_account.load()?;
        require!(state.tokens_distributed, CustomError::TokensNotDistributed);
        require!(participant.participation_time > 0, CustomError::NeverParticipated);

        if participant.cancelled == 0 {
            // Calculate total possible bonus tokens
            let total_bonus_tokens = 
                (state.active_early_investor_count as u128 * 1000) + // early investor bonuses
                (state.large_investor_count as u128  * 1000);         // large investor bonuses

            // Adjust total tokens by subtracting reserved bonus tokens
            let distributable_tokens = (state.total_tokens as u128).saturating_sub(total_bonus_tokens);

            // Calculate base share from remaining tokens
            let participant_amount = participant.amount as u128;
            let total_contributed = state.total_contributed as u128;
    
            let mut share = distributable_tokens
                .checked_mul(participant_amount)
                .ok_or(CustomError::ArithmeticOverflow)?
                .checked_div(total_contributed)
                .ok_or(CustomError::DivisionByZero)? as u64;
            
            // Add early investor bonus
            if participant.is_early_investor == 1 {
                share += 1000;
            }

            // Add large investor bonus
            if participant.amount >= 100_000_000_000 {
                share += 1000;
            }
            
            let token_mint_address = ctx.accounts.token_mint.key();
            let seeds = &[token_mint_address.as_ref(), &[_program_token_account_bump]];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.program_token_account.to_account_info(),
                    to: ctx.accounts.participant_token_account.to_account_info(),
                    authority: ctx.accounts.program_token_account.to_account_info(),
                },
                signer,
            );
            token::transfer(cpi_ctx, share)?;
        } else {

            // Participant cancelled - refund SOL
            let amount = participant.amount;
            let state_info = ctx.accounts.state.to_account_info();
            let participant_info = ctx.accounts.participant.to_account_info();
            
            // Get current balances
            let state_lamports = state_info.lamports();
            
            // Ensure state has enough lamports for the refund
            require!(
                state_lamports >= amount,
                CustomError::InsufficientRefundBalance
            );
            
            // Transfer lamports using safe arithmetic operations
            let new_state_lamports = state_lamports.checked_sub(amount)
                .ok_or(CustomError::ArithmeticOverflow)?;
            let new_participant_lamports = participant_info.lamports()
                .checked_add(amount)
                .ok_or(CustomError::ArithmeticOverflow)?;
            
            // Update lamport balances
            **state_info.try_borrow_mut_lamports()? = new_state_lamports;
            **participant_info.try_borrow_mut_lamports()? = new_participant_lamports;
        }

        Ok(())
    }

    // Helper function to decrease time for participation_end for tests
    pub fn end(ctx: Context<End>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            ctx.accounts.token_provider.key() == state.token_provider,
            CustomError::UnauthorizedCaller
        );
        
        state.participation_end = Clock::get()?.unix_timestamp as u64;
        state.duration = 0;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        space = 8 + State::INIT_SPACE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, State>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct State {
    pub initialized: bool,
    pub participation_active: bool,
    pub participation_end: u64,
    pub raise_cap: u64,
    pub total_contributed: u64,
    pub total_tokens: u64,
    pub tokens_distributed: bool,
    pub recipient_lamports: u64,
    pub token_provider: Pubkey,
    pub beneficiary: Pubkey,
    pub safeguarding_account: Pubkey,
    pub token_mint: Pubkey,
    pub total_cancelled: u64, // Track total amount of SOL to be refunded
    pub large_investor_count: u64, // Track number of investors with >= 100 SOL
    pub unique_investor_count: u64, // Track number of first-time investors
    pub active_early_investor_count: u64, // Track number of non-cancelled early investors
    pub duration: u64,  // Store the participation period duration
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub token_authority: Signer<'info>,
    #[account(
        init, // Safe because this is callable only once
        payer = token_authority,
        seeds = [  token_mint.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = program_token_account
    )]
    pub program_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,
    /// CHECK: This is the mint of the token being deposited
    pub token_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Activate<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    token_provider: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitParticipant<'info> {
    #[account(mut)]
    participant: Signer<'info>,
    #[account(
        init,
        payer = participant,
        space = ParticipantAccount::LEN,
        seeds = [b"participant", participant.key().as_ref()],
        bump
    )]
    participant_account: AccountLoader<'info, ParticipantAccount>,
    system_program: Program<'info, System>,
}

#[account(zero_copy)]
#[repr(C, packed)]
pub struct ParticipantAccount {
    pub amount: u64,
    pub participation_time: u64,
    pub participant: Pubkey,
    pub cancelled: u8,
    pub is_early_investor: u8,
    pub _padding: [u8; 6],
}

impl ParticipantAccount {
    pub const LEN: usize = 
        8 +   // discriminator
        8 +   // amount
        8 +   // participation_time
        32 +  // participant pubkey
        1 +   // cancelled boolean
        1 +   // is_early_investor boolean
        6;    // padding
}

#[derive(Accounts)]
pub struct Participate<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    #[account(mut)]
    participant: Signer<'info>,
    #[account(
        mut,
        seeds = [b"participant", participant.key().as_ref()],
        bump,
        has_one = participant
    )]
    participant_account: AccountLoader<'info, ParticipantAccount>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    #[account(mut)]
    participant: Signer<'info>,
    #[account(mut, has_one = participant)]
    participant_account: AccountLoader<'info, ParticipantAccount>,
}
#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    #[account(mut)]
    /// CHECK: Beneficiary account is verified in the state account
    beneficiary: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct End<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    token_provider: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_program_token_account_bump: u8)]
pub struct Claim<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    #[account(mut)]
    participant: Signer<'info>,
    #[account(
        mut,
        close = participant,
        seeds = [b"participant", participant.key().as_ref()],
        bump,
        has_one = participant
    )]
    participant_account: AccountLoader<'info, ParticipantAccount>,
    #[account(
        mut,
        seeds = [ token_mint.key().as_ref() ],
        bump = _program_token_account_bump,
    )]
    program_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = participant_token_account.mint == token_mint.key(),
        constraint = participant_token_account.owner == participant.key()
    )]
    participant_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    token_mint: Account<'info, Mint>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Safeguard<'info> {
    #[account(mut)]
    state: Account<'info, State>,
    token_provider: Signer<'info>,
    /// CHECK: Safeguarding account is verified against the state account
    #[account(mut)]
    safeguarding_account: AccountInfo<'info>,
}

#[error_code]
pub enum CustomError {
    #[msg("The contract has already been initialized.")]
    AlreadyInitialized,
    #[msg("Unauthorized caller.")]
    UnauthorizedCaller,
    #[msg("Tokens have already been deposited.")]
    TokensAlreadyDeposited,
    #[msg("Invalid token mint.")]
    InvalidTokenMint,
    #[msg("The contract has already been activated.")]
    AlreadyActivated,
    #[msg("Participation period is not active.")]
    NotActive,
    #[msg("Participation period has ended.")]
    ParticipationClosed,
    #[msg("Raise cap exceeded.")]
    RaiseCapExceeded,
    #[msg("Participation cancelled already.")]
    ParticipationCancelledAlready,
    #[msg("Maximum contribution exceeded.")]
    MaxContributionExceeded,
    #[msg("Withdrawal period has ended.")]
    WithdrawalClosed,
    #[msg("Tokens have already been distributed.")]
    DistributionAlreadyStarted,
    #[msg("No contribution to cancel.")]
    NoContribution,
    #[msg("Participation already cancelled.")]
    AlreadyCancelled,
    #[msg("Withdrawal window still open.")]
    WithdrawalWindowStillOpen,
    #[msg("Insufficient balance for refunds")]
    InsufficientRefundBalance,
    #[msg("Tokens have not been distributed yet.")]
    TokensNotDistributed,
    #[msg("Participant has never participated.")]
    NeverParticipated,
    #[msg("Unauthorized safeguarding account.")]
    UnauthorizedSafeguardingAccount,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Division by zero.")]
    DivisionByZero,
    #[msg("Participant has not claimed their tokens/SOL yet")]
    ParticipantHasNotClaimed,
    #[msg("Participant has already been initialized")]
    ParticipantAlreadyInitialized,
}
