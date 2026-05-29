import path from "path";
import * as dotenv from "dotenv";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function main() {
  const c = new Connection(process.env.HELIUS_RPC_URL!, "confirmed");
  const mint = new PublicKey(process.env.USDC_MINT!);
  const kp = Keypair.fromSeed(Buffer.from(process.env.KEEPER_PRIVATE_KEY!, "base64").slice(0, 32));
  const m = await getMint(c, mint);
  console.log("mint:           ", mint.toBase58());
  console.log("decimals:       ", m.decimals);
  console.log("mintAuthority:  ", m.mintAuthority?.toBase58() ?? "(none — fixed supply)");
  console.log("keeper:         ", kp.publicKey.toBase58());
  console.log("keeper can mint:", m.mintAuthority?.equals(kp.publicKey) ?? false);
}
main().catch((e) => { console.error(e); process.exit(1); });
