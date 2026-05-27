use anchor_lang::prelude::*;
use crate::errors::BasisError;
use crate::state::{Vault, VAULT_SEED};

#[derive(Accounts)]
pub struct PauseVault<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
        constraint = vault.authority == admin.key() @ BasisError::NotAdmin,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn pause_handler(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.paused = true;
    Ok(())
}

pub fn unpause_handler(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.paused = false;
    Ok(())
}
