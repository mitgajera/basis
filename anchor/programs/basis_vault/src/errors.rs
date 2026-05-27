use anchor_lang::prelude::*;

#[error_code]
pub enum BasisError {
    #[msg("Vault is paused")]
    Paused,
    #[msg("Unauthorized: keeper signature required")]
    NotKeeper,
    #[msg("Unauthorized: admin signature required")]
    NotAdmin,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("NAV update exceeds maximum delta")]
    NavDeltaExceeded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Zero amount not allowed")]
    ZeroAmount,
    #[msg("Deposit below minimum")]
    BelowMinimum,
}
