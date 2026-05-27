use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use crate::errors::BasisError;
use crate::state::{UserPosition, Vault, MIN_DEPOSIT, USER_POSITION_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        payer = user,
        space = UserPosition::LEN,
        seeds = [USER_POSITION_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_position: Account<'info, UserPosition>,

    #[account(
        mut,
        constraint = user_usdc.mint == vault.usdc_mint,
        constraint = user_usdc.owner == user.key(),
    )]
    pub user_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_usdc.key() == vault.vault_usdc_account,
    )]
    pub vault_usdc: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = share_mint.key() == vault.share_mint,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = user,
        token::mint = share_mint,
        token::authority = user,
    )]
    pub user_share_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, BasisError::ZeroAmount);
    require!(amount >= MIN_DEPOSIT, BasisError::BelowMinimum);

    let vault = &mut ctx.accounts.vault;
    require!(!vault.paused, BasisError::Paused);

    // Compute shares to mint using u128 intermediates
    let shares_to_mint: u64 = if vault.total_shares == 0 {
        amount
    } else {
        let num = (amount as u128)
            .checked_mul(vault.total_shares as u128)
            .ok_or(BasisError::MathOverflow)?;
        let denom = vault.total_assets as u128;
        require!(denom > 0, BasisError::ZeroAmount);
        u64::try_from(num / denom).map_err(|_| BasisError::MathOverflow)?
    };

    require!(shares_to_mint > 0, BasisError::ZeroAmount);

    // Transfer USDC from user to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // Mint share tokens to user
    let vault_bump = vault.bump;
    let seeds: &[&[u8]] = &[VAULT_SEED, &[vault_bump]];
    let signer = &[seeds];

    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_share_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        shares_to_mint,
    )?;

    // Update state
    vault.total_assets = vault.total_assets.checked_add(amount).ok_or(BasisError::MathOverflow)?;
    vault.total_shares = vault.total_shares.checked_add(shares_to_mint).ok_or(BasisError::MathOverflow)?;

    let pos = &mut ctx.accounts.user_position;
    if pos.user == Pubkey::default() {
        pos.user = ctx.accounts.user.key();
        pos.bump = ctx.bumps.user_position;
    }
    pos.shares = pos.shares.checked_add(shares_to_mint).ok_or(BasisError::MathOverflow)?;
    pos.deposited_total = pos.deposited_total.checked_add(amount).ok_or(BasisError::MathOverflow)?;

    Ok(())
}
