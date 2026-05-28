use anchor_lang::prelude::*;
use crate::errors::BasisError;
use crate::state::{Vault, VAULT_SEED};

#[derive(Accounts)]
pub struct SetKeeper<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.usdc_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.authority == admin.key() @ BasisError::NotAdmin,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(ctx: Context<SetKeeper>, new_keeper: Pubkey) -> Result<()> {
    ctx.accounts.vault.keeper = new_keeper;
    Ok(())
}
