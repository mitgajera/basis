use anchor_lang::prelude::*;
use crate::errors::BasisError;
use crate::state::{Vault, MAX_NAV_DELTA_BPS, VAULT_SEED};

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    pub keeper: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump = vault.bump,
        constraint = vault.keeper == keeper.key() @ BasisError::NotKeeper,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handler(ctx: Context<UpdateNav>, new_total_assets: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    // Reject zero unless vault is empty
    if new_total_assets == 0 {
        require!(vault.total_shares == 0, BasisError::ZeroAmount);
        vault.total_assets = 0;
        vault.last_nav_update = Clock::get()?.unix_timestamp;
        return Ok(());
    }

    // Reject if delta > MAX_NAV_DELTA_BPS of current total_assets
    if vault.total_assets > 0 {
        let current = vault.total_assets as u128;
        let new_val = new_total_assets as u128;
        let delta = if new_val > current { new_val - current } else { current - new_val };
        let max_delta = current
            .checked_mul(MAX_NAV_DELTA_BPS as u128)
            .ok_or(BasisError::MathOverflow)?
            / 10_000;

        require!(delta <= max_delta, BasisError::NavDeltaExceeded);
    }

    vault.total_assets = new_total_assets;
    vault.last_nav_update = Clock::get()?.unix_timestamp;

    if new_total_assets > vault.high_water_mark {
        vault.high_water_mark = new_total_assets;
    }

    Ok(())
}
