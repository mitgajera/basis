use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Vault, VAULT_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Vault::LEN,
        seeds = [VAULT_SEED],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = vault,
        seeds = [b"vault_usdc", vault.key().as_ref()],
        bump,
    )]
    pub vault_usdc_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = vault,
        seeds = [b"share_mint", vault.key().as_ref()],
        bump,
    )]
    pub share_mint: Account<'info, Mint>,

    /// CHECK: keeper pubkey provided by admin
    pub keeper: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let bump = ctx.bumps.vault;

    vault.authority = ctx.accounts.admin.key();
    vault.keeper = ctx.accounts.keeper.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.vault_usdc_account = ctx.accounts.vault_usdc_account.key();
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.total_shares = 0;
    vault.total_assets = 0;
    vault.high_water_mark = 0;
    vault.last_nav_update = Clock::get()?.unix_timestamp;
    vault.paused = false;
    vault.bump = bump;

    Ok(())
}
