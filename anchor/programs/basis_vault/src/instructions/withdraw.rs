use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use crate::errors::BasisError;
use crate::state::{UserPosition, Vault, USER_POSITION_SEED, VAULT_SEED};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [USER_POSITION_SEED, user.key().as_ref()],
        bump = user_position.bump,
        constraint = user_position.user == user.key(),
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
        mut,
        constraint = user_share_account.mint == vault.share_mint,
        constraint = user_share_account.owner == user.key(),
    )]
    pub user_share_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, BasisError::ZeroAmount);

    let pos = &ctx.accounts.user_position;
    require!(pos.shares >= shares, BasisError::InsufficientShares);

    let vault = &ctx.accounts.vault;
    require!(vault.total_shares > 0, BasisError::ZeroAmount);

    // Compute USDC to return using u128 intermediates
    let usdc_out: u64 = {
        let num = (shares as u128)
            .checked_mul(vault.total_assets as u128)
            .ok_or(BasisError::MathOverflow)?;
        let denom = vault.total_shares as u128;
        u64::try_from(num / denom).map_err(|_| BasisError::MathOverflow)?
    };

    require!(usdc_out > 0, BasisError::ZeroAmount);

    // Burn share tokens
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_share_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shares,
    )?;

    // Transfer USDC from vault to user (vault PDA signs)
    let vault_bump = vault.bump;
    let seeds: &[&[u8]] = &[VAULT_SEED, &[vault_bump]];
    let signer = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        usdc_out,
    )?;

    // Update state
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = vault.total_assets.saturating_sub(usdc_out);
    vault.total_shares = vault.total_shares.saturating_sub(shares);

    let pos = &mut ctx.accounts.user_position;
    pos.shares = pos.shares.saturating_sub(shares);

    Ok(())
}
