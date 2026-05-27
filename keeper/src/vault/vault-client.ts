import { Config } from "../config";
import { VaultSnapshot } from "@basis/shared";

// Vault client stubs — implemented in Phase 3 after Anchor program is deployed.
// All methods throw until VAULT_PROGRAM_ID is set and the program is on-chain.
export class VaultClient {
  constructor(private config: Config) {}

  async getSnapshot(): Promise<VaultSnapshot> {
    if (!this.config.VAULT_PROGRAM_ID) {
      // Return a zero-state snapshot before vault is deployed
      return { tvl: 0, totalShares: 0, navPerShare: 1, lastUpdated: Date.now() };
    }
    throw new Error("VaultClient.getSnapshot not yet implemented; deploy anchor program first");
  }

  async updateNav(totalAssetsUsd: number): Promise<void> {
    if (!this.config.VAULT_PROGRAM_ID) return;
    throw new Error("VaultClient.updateNav not yet implemented; deploy anchor program first");
  }

  async getIdleBalance(): Promise<number> {
    if (!this.config.VAULT_PROGRAM_ID) return 0;
    throw new Error("VaultClient.getIdleBalance not yet implemented");
  }
}
