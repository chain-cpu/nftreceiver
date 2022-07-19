import * as anchor from "@project-serum/anchor";
import { Program, } from "@project-serum/anchor";
import { Nftreceiver } from "../target/types/nftreceiver";
import {TOKEN_PROGRAM_ID, createMint, mintToChecked, createAssociatedTokenAccount, transferChecked} from "@solana/spl-token"
import {PublicKey} from "@solana/web3.js"
import { config, expect } from "chai";

describe("nftreceiver", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider();
  const program = anchor.workspace.Nftreceiver as Program<Nftreceiver>;
  let mintMana = null as PublicKey;
  let mintA = null as PublicKey;
  let mintB = null as PublicKey;

  let mintNFT = null as PublicKey;

  const deployerKeyPair = anchor.web3.Keypair.generate();
  const authorityKeyPair = anchor.web3.Keypair.generate();
  const userKeyPair = anchor.web3.Keypair.generate();
  
  let configPDA = null as PublicKey;
  let pdaManaAccount = null as PublicKey;
  let userManaAccount = null as PublicKey;

  let userAAccount = null as PublicKey;
  let userBBaccount = null as PublicKey;

  before(async() => {
    // request airdrop to accounts
    // Airdropping tokens to a deployerKeyPair.
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(deployerKeyPair.publicKey, 1000000000),
      "processed"
    );
    // Airdropping tokens to a authorityKeyPair.
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(authorityKeyPair.publicKey, 1000000000),
      "processed"
    );

    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(userKeyPair.publicKey, 1000000000),
      "processed"
    );

    // create tokenMana, tokenA, tokenB
    mintMana = await createMint(
      provider.connection,
      deployerKeyPair,
      deployerKeyPair.publicKey,
      null,
      0
    ); 

    mintNFT = await createMint(
      provider.connection,
      deployerKeyPair,
      deployerKeyPair.publicKey,
      null,
      0
    ); 

    mintA = await createMint(
      provider.connection,
      deployerKeyPair,
      deployerKeyPair.publicKey,
      null,
      0,
    ); 

    mintB = await createMint(
      /* connection: */ provider.connection,
      /* payer: */ deployerKeyPair,
      /* mintAuthority: */ deployerKeyPair.publicKey,
      /* freezeAuthority: */ null,
      /* decimals: */ 0    
    );

    // create mana tokenAccount of user
    userManaAccount = await createAssociatedTokenAccount(
      /* connection: */ provider.connection,
      /* payer: */ deployerKeyPair,
      /* mint: */ mintMana,
      /* account: */ userKeyPair.publicKey
    );
  
    // mint initial supply of mintMana (to user), mintA (to program account), mintB (program account)
    await mintToChecked(
      /* connection: */ provider.connection,
      /* payer: */ deployerKeyPair,
      /* mint: */ mintMana,
      /* receiver: */ userManaAccount,
      /* authority: */ deployerKeyPair,
      /* amount: */ 100,
      /* decimals: */ 0
    );

    // create mana, tokenA, tokenB account of the program (PDA)
  
    
    // create NFT collection 
    const userManaBalance = await provider.connection.getTokenAccountBalance(userManaAccount);
    console.log("userManaBalance", userManaBalance);
  })

  it("Initialize Program", async () => {
    const [_configPDA, _configBump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("config"))],
      program.programId
    );
    const [_manaPDA, _manaPDABump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("mana-token")), mintMana.toBuffer()],
      program.programId
    );
    
    configPDA = _configPDA;
    pdaManaAccount = _manaPDA;
    
    // invoke initialize method (manatoken)
    const tx = await program.methods.initialize()
    .accounts({config: configPDA, deployer:deployerKeyPair.publicKey, manaToken: mintMana, pdaManaAccount})
    .signers([deployerKeyPair])
    .rpc();

    // fetch Config from program
    const configPdaData = await program.account.config.fetch(configPDA);

    expect(configPdaData.manaToken.toString()).to.be.equal(mintMana.toString());
    expect(configPdaData.authority.toString()).to.be.equal(deployerKeyPair.publicKey.toString());

  });

  it("Is Authority transfered", async () => {
    // transfer authority to authoritykeypair
    await transferAuthority(authorityKeyPair.publicKey);
    // fetch authority value
    const configPdaData = await program.account.config.fetch(configPDA);
    // check if authority is authoritykeypair      
    expect(configPdaData.authority.toString()).to.be.equal(authorityKeyPair.publicKey.toString());

  })

  it("Add WL", async () => {
    const mint = mintNFT;
    const color = 0;
    const set = 0;
    const rarity = 1;
    const [_wlConfigPDA, _] = await getWLConfigPda(mint, color, rarity, set);

    await addWlConfig(mint, color, rarity, set);
    // return;
    const wlConfig = await getWLConfig(mint, color, rarity, set);
    expect(wlConfig.mint.toString()).to.be.equal(mint.toString());
    expect(wlConfig.color).to.be.equal(color);
    expect(wlConfig.set).to.be.equal(set);
    expect(wlConfig.rarity).to.be.equal(rarity);

    await addWlConfig(mint, 1, rarity, 0);
    await addWlConfig(mint, 2, rarity, 1);
    await addWlConfig(mint, 3, rarity, 1);
    await addWlConfig(mint, 4, rarity, 0);

  })

  it("Add reward Config", async() => {
    const rarity = 0;
    const manaCost = new anchor.BN(100);
    await addRewardConfig(rarity, 0, manaCost, mintA);
    await addRewardConfig(rarity, 1, manaCost, mintB);
    let rewardConfigData1 = await getRewardConfig(rarity, 0);
    let rewardConfigData2 = await getRewardConfig(rarity, 1);

    expect(rewardConfigData1.manaCost.toString()).to.be.equal(manaCost.toString());
    expect(rewardConfigData1.rewardToken.toString()).to.be.equal(mintA.toString());

    expect(rewardConfigData2.manaCost.toString()).to.be.equal(manaCost.toString());
    expect(rewardConfigData2.rewardToken.toString()).to.be.equal(mintB.toString());

    
  })

  it("Burn", async () => {
    let nfts = [
      {mint: mintNFT, rarity: 0, set: 0, color: 0},
      {mint: mintNFT, rarity: 0, set: 1, color: 1},
      {mint: mintNFT, rarity: 0, set: 1, color: 2},
      {mint: mintNFT, rarity: 0, set: 3, color: 3},
    ]  
    // invoke upgrade(nft1, nft2, nft3, nft4, mana_account,reward_account)
    // check if it has receivced reward_token
    // check if it has consumed mana token

  })

  async function transferAuthority(newAuthor: anchor.web3.PublicKey) {
    await program.methods.transferAuthority(authorityKeyPair.publicKey)
    .accounts({config: configPDA, authority: deployerKeyPair.publicKey})
    .signers([deployerKeyPair])
    .rpc()
  }
  async function addWlConfig(mint, color, rarity, set) {
    const [_wlConfigPDA, _] = await getWLConfigPda(mint, color, rarity, set);

    await program.methods.addWlConfig(mint, color, rarity, set)
    .accounts({wlConfig: _wlConfigPDA as anchor.web3.PublicKey, authority: authorityKeyPair.publicKey})
    .signers([authorityKeyPair])
    .rpc()
  }

  async function getWLConfigPda(mint: anchor.web3.PublicKey, color, rarity, set) {
    const [_wlConfigPda, _wlConfigBump] = await PublicKey.findProgramAddress(
      //@ts-ignore
      [Buffer.from(anchor.utils.bytes.utf8.encode("wl-config")), mint.toBuffer(), Buffer.from([color]), Buffer.from([rarity]), Buffer.from([set])],
      program.programId
    );
    return [_wlConfigPda as anchor.web3.PublicKey, _wlConfigBump];
  }
  async function getWLConfig(mint, color, rarity, set) {
    const [_wlConfigPda, _wlConfigBump] = await getWLConfigPda(mint, color, rarity, set);
    const wlConfig = await program.account.wlConfig.fetch(_wlConfigPda as anchor.web3.PublicKey);
    return wlConfig;
  }

  async function addRewardConfig(rarity, set, manaCost, rewardToken: anchor.web3.PublicKey) {
    const [_rewardConfigPda, _rewardConfigBump] = await getRewardConfigPda(rarity, set);
    const [_rewardVaultPda, _rewardVaultBump] = await getRewardVaultPda(rarity, set, rewardToken);

    await program.methods.addRewardConfig(rarity, set, manaCost, rewardToken)
    .accounts({authority: authorityKeyPair.publicKey, rewardToken: rewardToken, rewardConfig: _rewardConfigPda as anchor.web3.PublicKey, rewardVault: _rewardVaultPda})
    .signers([authorityKeyPair]).rpc();

    // should provide initial supply to reward_vault_pda
    await mintToChecked(
      /* connection: */ provider.connection,
      /* payer: */ deployerKeyPair,
      /* mint: */ rewardToken,
      /* receiver: */ _rewardVaultPda as anchor.web3.PublicKey,
      /* authority: */ deployerKeyPair,
      /* amount: */ 10000,
      /* decimals: */ 0
    );
    
  }

  async function getRewardConfigPda(rarity, set) {
    const [_rewardConfigPda, _rewardConfigBump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("reward-config")), Buffer.from([rarity]), Buffer.from([set])],
      program.programId
    );
    return [_rewardConfigPda as anchor.web3.PublicKey, _rewardConfigBump]
  }

  async function getRewardVaultPda(rarity, set, rewardToken) {
    const [_rewardVaultPda, _rewardVaultBump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("reward-vault")), rewardToken.toBuffer()],
      program.programId
    );  
    return [_rewardVaultPda, _rewardVaultBump];
  }
  async function getRewardConfig(rarity, set) {
    const [_rewardConfigPda, _rewardConfigBump] = await getRewardConfigPda(rarity, set);
    const rewardConfig = await program.account.rewardConfig.fetch(_rewardConfigPda as anchor.web3.PublicKey);
    return rewardConfig;
  }
});
