import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BasisVault } from "../target/types/basis_vault";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("basis_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BasisVault as Program<BasisVault>;

  let usdcMint: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;
  let vaultUsdcAccount: anchor.web3.PublicKey;
  let shareMint: anchor.web3.PublicKey;
  let keeperKp = anchor.web3.Keypair.generate();
  let userKp = anchor.web3.Keypair.generate();
  let userUsdc: anchor.web3.PublicKey;
  let userShareAccount: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop
    await provider.connection.requestAirdrop(keeperKp.publicKey, 2e9);
    await provider.connection.requestAirdrop(userKp.publicKey, 2e9);
    await new Promise((r) => setTimeout(r, 500));

    // Create devnet USDC mock
    usdcMint = await createMint(provider.connection, (provider.wallet as anchor.Wallet).payer, provider.wallet.publicKey, null, 6);

    [vaultPda, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId,
    );

    [vaultUsdcAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault_usdc"), vaultPda.toBuffer()],
      program.programId,
    );

    [shareMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("share_mint"), vaultPda.toBuffer()],
      program.programId,
    );
  });

  it("initializes the vault", async () => {
    await program.methods
      .initialize()
      .accounts({
        admin: provider.wallet.publicKey,
        vault: vaultPda,
        usdcMint,
        vaultUsdcAccount,
        shareMint,
        keeper: keeperKp.publicKey,
      })
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.keeper.toBase58(), keeperKp.publicKey.toBase58());
    assert.equal(vault.totalShares.toNumber(), 0);
    assert.equal(vault.totalAssets.toNumber(), 0);
    assert.equal(vault.paused, false);
  });

  it("deposits bootstrap 1:1 and mints shares", async () => {
    userUsdc = await createAccount(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, userKp.publicKey);
    // Mint 100 USDC to user
    await mintTo(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, userUsdc, provider.wallet.publicKey, 100_000_000);

    const [userPosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), userKp.publicKey.toBuffer()],
      program.programId,
    );

    userShareAccount = await createAccount(provider.connection, (provider.wallet as anchor.Wallet).payer, shareMint, userKp.publicKey);

    await program.methods
      .deposit(new anchor.BN(10_000_000)) // 10 USDC
      .accounts({
        user: userKp.publicKey,
        vault: vaultPda,
        userPosition: userPosPda,
        userUsdc,
        vaultUsdc: vaultUsdcAccount,
        shareMint,
        userShareAccount,
      })
      .signers([userKp])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalAssets.toNumber(), 10_000_000);
    assert.equal(vault.totalShares.toNumber(), 10_000_000); // bootstrap 1:1

    const userPos = await program.account.userPosition.fetch(userPosPda);
    assert.equal(userPos.shares.toNumber(), 10_000_000);
  });

  it("rejects deposit below MIN_DEPOSIT", async () => {
    const [userPosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), userKp.publicKey.toBuffer()],
      program.programId,
    );
    try {
      await program.methods
        .deposit(new anchor.BN(500_000)) // 0.5 USDC — below min
        .accounts({
          user: userKp.publicKey,
          vault: vaultPda,
          userPosition: userPosPda,
          userUsdc,
          vaultUsdc: vaultUsdcAccount,
          shareMint,
          userShareAccount,
        })
        .signers([userKp])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "BelowMinimum");
    }
  });

  it("update_nav within 5% succeeds", async () => {
    // 10 USDC → allow up to 10.5 USDC
    await program.methods
      .updateNav(new anchor.BN(10_500_000))
      .accounts({ keeper: keeperKp.publicKey, vault: vaultPda })
      .signers([keeperKp])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalAssets.toNumber(), 10_500_000);
  });

  it("update_nav exceeding 5% is rejected", async () => {
    try {
      await program.methods
        .updateNav(new anchor.BN(20_000_000)) // +90% — exceeds 5%
        .accounts({ keeper: keeperKp.publicKey, vault: vaultPda })
        .signers([keeperKp])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "NavDeltaExceeded");
    }
  });

  it("non-keeper cannot update_nav", async () => {
    const rogue = anchor.web3.Keypair.generate();
    await provider.connection.requestAirdrop(rogue.publicKey, 1e9);
    await new Promise((r) => setTimeout(r, 300));
    try {
      await program.methods
        .updateNav(new anchor.BN(10_000_000))
        .accounts({ keeper: rogue.publicKey, vault: vaultPda })
        .signers([rogue])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "NotKeeper");
    }
  });

  it("withdraws shares pro-rata", async () => {
    const [userPosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), userKp.publicKey.toBuffer()],
      program.programId,
    );

    const balBefore = (await getAccount(provider.connection, userUsdc)).amount;

    await program.methods
      .withdraw(new anchor.BN(5_000_000)) // half of shares
      .accounts({
        user: userKp.publicKey,
        vault: vaultPda,
        userPosition: userPosPda,
        userUsdc,
        vaultUsdc: vaultUsdcAccount,
        shareMint,
        userShareAccount,
      })
      .signers([userKp])
      .rpc();

    const balAfter = (await getAccount(provider.connection, userUsdc)).amount;
    // Received half of 10.5 USDC ≈ 5_250_000 lamports
    assert.isAbove(Number(balAfter - balBefore), 5_000_000);
  });
});
