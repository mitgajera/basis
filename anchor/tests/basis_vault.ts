import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BasisVault } from "../target/types/basis_vault";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("basis_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.BasisVault as Program<BasisVault>;

  let usdcMint: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let vaultUsdcAccount: anchor.web3.PublicKey;
  let shareMint: anchor.web3.PublicKey;
  let keeperKp = anchor.web3.Keypair.generate();
  let userKp = anchor.web3.Keypair.generate();
  let userUsdc: anchor.web3.PublicKey;
  let userShareAccount: anchor.web3.PublicKey;

  before(async () => {
    // Fund test keypairs from provider wallet (more reliable than devnet airdrop)
    const fundTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: keeperKp.publicKey, lamports: 2e9 }),
      anchor.web3.SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: userKp.publicKey, lamports: 2e9 }),
    );
    await provider.sendAndConfirm(fundTx);
    await new Promise((r) => setTimeout(r, 500));

    usdcMint = await createMint(provider.connection, (provider.wallet as anchor.Wallet).payer, provider.wallet.publicKey, null, 6);

    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), usdcMint.toBuffer()],
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
    // Create USDC account for user and mint 100 USDC
    userUsdc = await createAccount(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, userKp.publicKey);
    await mintTo(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, userUsdc, provider.wallet.publicKey, 100_000_000);

    // Derive ATA for shares — init_if_needed will create it on first deposit
    userShareAccount = getAssociatedTokenAddressSync(shareMint, userKp.publicKey);

    const [userPosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), userKp.publicKey.toBuffer()],
      program.programId,
    );

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
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([userKp])
      .rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.totalAssets.toNumber(), 10_000_000);
    assert.equal(vault.totalShares.toNumber(), 10_000_000);

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
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([userKp])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "BelowMinimum");
    }
  });

  it("update_nav within 5% succeeds", async () => {
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
        .updateNav(new anchor.BN(20_000_000))
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
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: rogue.publicKey, lamports: 1e9 }),
    ));
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
      .withdraw(new anchor.BN(5_000_000))
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
    assert.isAbove(Number(balAfter - balBefore), 5_000_000);
  });

  it("second depositor receives pro-rata shares", async () => {
    const user2Kp = anchor.web3.Keypair.generate();
    await provider.sendAndConfirm(new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: user2Kp.publicKey, lamports: 2e9 }),
    ));
    await new Promise((r) => setTimeout(r, 500));

    const user2Usdc = await createAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      user2Kp.publicKey,
    );
    await mintTo(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, user2Usdc, provider.wallet.publicKey, 10_500_000);

    const user2ShareAccount = getAssociatedTokenAddressSync(shareMint, user2Kp.publicKey);

    const [user2PosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), user2Kp.publicKey.toBuffer()],
      program.programId,
    );

    const vaultBefore = await program.account.vault.fetch(vaultPda);

    await program.methods
      .deposit(new anchor.BN(10_500_000))
      .accounts({
        user: user2Kp.publicKey,
        vault: vaultPda,
        userPosition: user2PosPda,
        userUsdc: user2Usdc,
        vaultUsdc: vaultUsdcAccount,
        shareMint,
        userShareAccount: user2ShareAccount,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([user2Kp])
      .rpc();

    const user2Pos = await program.account.userPosition.fetch(user2PosPda);
    const vaultAfter = await program.account.vault.fetch(vaultPda);

    const expectedShares = Math.floor(
      (10_500_000 * vaultBefore.totalShares.toNumber()) / vaultBefore.totalAssets.toNumber(),
    );
    assert.approximately(user2Pos.shares.toNumber(), expectedShares, 1);
    assert.equal(vaultAfter.totalAssets.toNumber(), vaultBefore.totalAssets.toNumber() + 10_500_000);
  });

  it("pause blocks deposits but not withdrawals", async () => {
    await program.methods.pause().accounts({ admin: provider.wallet.publicKey, vault: vaultPda }).rpc();
    const vaultPaused = await program.account.vault.fetch(vaultPda);
    assert.equal(vaultPaused.paused, true);

    const [userPosPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_position"), userKp.publicKey.toBuffer()],
      program.programId,
    );

    try {
      await program.methods
        .deposit(new anchor.BN(1_000_000))
        .accounts({
          user: userKp.publicKey, vault: vaultPda, userPosition: userPosPda,
          userUsdc, vaultUsdc: vaultUsdcAccount, shareMint, userShareAccount,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([userKp])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "Paused");
    }

    const balBefore = (await getAccount(provider.connection, userUsdc)).amount;
    await program.methods
      .withdraw(new anchor.BN(1_000_000))
      .accounts({
        user: userKp.publicKey, vault: vaultPda, userPosition: userPosPda,
        userUsdc, vaultUsdc: vaultUsdcAccount, shareMint, userShareAccount,
      })
      .signers([userKp])
      .rpc();
    const balAfter = (await getAccount(provider.connection, userUsdc)).amount;
    assert.isAbove(Number(balAfter), Number(balBefore));

    await program.methods.unpause().accounts({ admin: provider.wallet.publicKey, vault: vaultPda }).rpc();
    const vaultUnpaused = await program.account.vault.fetch(vaultPda);
    assert.equal(vaultUnpaused.paused, false);
  });

  it("set_keeper rotates keeper", async () => {
    const newKeeper = anchor.web3.Keypair.generate();
    await program.methods.setKeeper(newKeeper.publicKey).accounts({ admin: provider.wallet.publicKey, vault: vaultPda }).rpc();

    const vault = await program.account.vault.fetch(vaultPda);
    assert.equal(vault.keeper.toBase58(), newKeeper.publicKey.toBase58());

    try {
      await program.methods
        .updateNav(new anchor.BN(5_000_000))
        .accounts({ keeper: keeperKp.publicKey, vault: vaultPda })
        .signers([keeperKp])
        .rpc();
      assert.fail("should have thrown");
    } catch (e: unknown) {
      assert.include(String(e), "NotKeeper");
    }

    await program.methods.setKeeper(keeperKp.publicKey).accounts({ admin: provider.wallet.publicKey, vault: vaultPda }).rpc();
  });
});
