use anchor_lang::prelude::*;

pub const MAX_NAV_DELTA_BPS: u64 = 500;
pub const MIN_DEPOSIT: u64 = 1_000_000;
pub const VAULT_SEED: &[u8] = b"vault";
pub const USER_POSITION_SEED: &[u8] = b"user_position";

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault_usdc_account: Pubkey,
    pub share_mint: Pubkey,
    pub total_shares: u64,
    pub total_assets: u64,
    pub high_water_mark: u64,
    pub last_nav_update: i64,
    pub paused: bool,
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 8  // discriminator
        + 32  // authority
        + 32  // keeper
        + 32  // usdc_mint
        + 32  // vault_usdc_account
        + 32  // share_mint
        + 8   // total_shares
        + 8   // total_assets
        + 8   // high_water_mark
        + 8   // last_nav_update
        + 1   // paused
        + 1;  // bump
}

#[account]
pub struct UserPosition {
    pub user: Pubkey,
    pub shares: u64,
    pub deposited_total: u64,
    pub bump: u8,
}

impl UserPosition {
    pub const LEN: usize = 8  // discriminator
        + 32  // user
        + 8   // shares
        + 8   // deposited_total
        + 1;  // bump
}
