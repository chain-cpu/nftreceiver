import * as anchor from "@project-serum/anchor";
import { Program, } from "@project-serum/anchor";
import { Nftreceiver } from "../target/types/nftreceiver";
import {TOKEN_PROGRAM_ID, createMint, mintToChecked, createAssociatedTokenAccount, getOrCreateAssociatedTokenAccount, transferChecked, revokeInstructionData} from "@solana/spl-token"
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
    
    const [_wrongPda, _wrongBump] = await getWrongPda();

    configPDA = _configPDA;
    pdaManaAccount = _manaPDA;
    
    // invoke initialize method (manatoken)
    const tx = await program.methods.initialize()
    .accounts({config: configPDA, wrongPda: _wrongPda as anchor.web3.PublicKey, deployer:deployerKeyPair.publicKey, manaToken: mintMana, pdaManaAccount})
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
    const whiteList = [
      {mint: mintNFT, color: 0, rarity: 0, set: 0},
      {mint: mintNFT, color: 0, rarity: 0, set: 1},
      {mint: mintNFT, color: 1, rarity: 0, set: 0},
      {mint: mintNFT, color: 1, rarity: 0, set: 1},
      {mint: mintNFT, color: 2, rarity: 0, set: 0},
      {mint: mintNFT, color: 2, rarity: 0, set: 1},
      {mint: mintNFT, color: 3, rarity: 0, set: 0},
      {mint: mintNFT, color: 3, rarity: 0, set: 1},
    ];
    for(let i in whiteList) {
      const wlConfig = whiteList[i];
      await addWlConfig(wlConfig.mint, wlConfig.color, wlConfig.rarity, wlConfig.set);
    }
    const testConfig = whiteList[0];
    const wlConfig = await getWlConfig(testConfig.mint, testConfig.color, testConfig.rarity, testConfig.set);
    expect(wlConfig.mint.toString()).to.be.equal(testConfig.mint.toString());
    expect(wlConfig.color).to.be.equal(testConfig.color);
    expect(wlConfig.rarity).to.be.equal(testConfig.rarity);
    expect(wlConfig.set).to.be.equal(testConfig.set);
    
  })

  it("Add reward Config", async() => {
    const rewardConfigList = [
      {rarity: 0, set: 0, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 0, set: 1, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 0, set: 2, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 1, set: 0, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 1, set: 1, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 1, set: 2, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 2, set: 0, manaCost: new anchor.BN(100), rewardToken:mintA},
      {rarity: 2, set: 1, manaCost: new anchor.BN(100), rewardToken:mintA},
    ];

    for(let i in rewardConfigList) {
      const rewardConfig = rewardConfigList[i];
      await addRewardConfig(
        rewardConfig.rarity, 
        rewardConfig.set, 
        rewardConfig.manaCost, 
        rewardConfig.rewardToken
      );
    }

    const testConfig = rewardConfigList[0];
    const rewardConfig = await getRewardConfig(testConfig.rarity, testConfig.set);

    expect(rewardConfig.rarity).to.be.equal(testConfig.rarity);
    expect(rewardConfig.set).to.be.equal(testConfig.set);
    expect(rewardConfig.manaCost.toString()).to.be.equal(testConfig.manaCost.toString());
    expect(rewardConfig.rewardToken.toString()).to.be.equal(testConfig.rewardToken.toString());

  })

  it("Burn Success", async () => {
    
    let nfts = [
      {mint: mintNFT, color: 0, rarity: 0, set: 0},
      {mint: mintNFT, color: 1, rarity: 0, set: 0},
      {mint: mintNFT, color: 2, rarity: 0, set: 0},
      {mint: mintNFT, color: 3, rarity: 0, set: 0},
    ];
    
    const [_configPda, _configBump] = await getConfigPda();
    
    const rewardConfigs = await Promise.all(
         nfts.map(async (nft) => {
          const [_rewardConfigPda, _rewardConfigBump] = await getRewardConfigPda(nft.rarity, nft.set);
          return _rewardConfigPda;
         })
    );

    const rewardVaults = await Promise.all(
      nfts.map(async (nft) => {
        const rewardConfig = await getRewardConfig(nft.rarity, nft.set);
        const [_rewardVaultPda, _] = await getRewardVaultPda(nft.rarity, nft.set, rewardConfig.rewardToken)
        return _rewardVaultPda;
      })
    );

    const userRewardAccounts = await Promise.all(
      nfts.map(async (nft) => {
        const rewardConfig = await getRewardConfig(nft.rarity, nft.set);

        const rewardAccount = await getOrCreateAssociatedTokenAccount(program.provider.connection, userKeyPair, rewardConfig.rewardToken, userKeyPair.publicKey);

        return rewardAccount;
      })
    );
    
    const wlConfigs = await Promise.all(
         nfts.map(async (nft) => {
          const [_rewardConfigPda, _rewardConfigBump] = await getWlConfigPda(nft.mint, nft.color, nft.rarity, nft.set);
          return {pubkey: _rewardConfigPda as anchor.web3.PublicKey, isSigner: false, isWritable: false};
         })
    );

    try {
      await program.methods.burnNfts(nfts)
      .accounts({
        config: _configPda as anchor.web3.PublicKey,
        payer :  userKeyPair.publicKey,
        pdaManaAccount: pdaManaAccount,
        userManaAccount: userManaAccount,
        rewardConfig0: rewardConfigs[0] as anchor.web3.PublicKey,
        rewardConfig1: rewardConfigs[1] as anchor.web3.PublicKey,
        rewardConfig2: rewardConfigs[2] as anchor.web3.PublicKey,
        rewardConfig3: rewardConfigs[3] as anchor.web3.PublicKey,
        rewardVault0: rewardVaults[0] as anchor.web3.PublicKey,
        rewardVault1: rewardVaults[1] as anchor.web3.PublicKey,
        rewardVault2: rewardVaults[2] as anchor.web3.PublicKey,
        rewardVault3: rewardVaults[3] as anchor.web3.PublicKey,
        userRewardAccount0: userRewardAccounts[0].address as anchor.web3.PublicKey,
        userRewardAccount1: userRewardAccounts[1].address as anchor.web3.PublicKey,
        userRewardAccount2: userRewardAccounts[2].address as anchor.web3.PublicKey,
        userRewardAccount3: userRewardAccounts[3].address as anchor.web3.PublicKey,
      })
      .remainingAccounts(wlConfigs)
      .signers([userKeyPair])
      .rpc();
    } catch (error) {
      console.log(error);
    }
    

    
    const userManaBalance = await provider.connection.getTokenAccountBalance(userManaAccount);

    const userRewardBalance = await provider.connection.getTokenAccountBalance(userRewardAccounts[0].address);
    
    expect(userRewardBalance.value.amount).to.be.equal("100");
    expect(userManaBalance.value.amount).to.be.equal("0");
    

  })

  async function transferAuthority(newAuthor: anchor.web3.PublicKey) {
    await program.methods.transferAuthority(authorityKeyPair.publicKey)
    .accounts({config: configPDA, authority: deployerKeyPair.publicKey})
    .signers([deployerKeyPair])
    .rpc()
  }
  async function addWlConfig(mint, color, rarity, set) {
    const [_wlConfigPDA, _] = await getWlConfigPda(mint, color, rarity, set);

    await program.methods.addWlConfig(mint, color, rarity, set)
    .accounts({wlConfig: _wlConfigPDA as anchor.web3.PublicKey, authority: authorityKeyPair.publicKey})
    .signers([authorityKeyPair])
    .rpc()
  }

  async function getWlConfigPda(mint: anchor.web3.PublicKey, color, rarity, set) {
    const [_wlConfigPda, _wlConfigBump] = await PublicKey.findProgramAddress(
      //@ts-ignore
      [Buffer.from(anchor.utils.bytes.utf8.encode("wl-config")), mint.toBuffer(), Buffer.from([color]), Buffer.from([rarity]), Buffer.from([set])],
      program.programId
    );
    return [_wlConfigPda as anchor.web3.PublicKey, _wlConfigBump];
  }

  async function getWrongPda() {
    const [_wrongPda, _wrongBump] = await PublicKey.findProgramAddress(
      //@ts-ignore
      [Buffer.from(anchor.utils.bytes.utf8.encode("wrong-pda"))],
      program.programId
    );
    return [_wrongPda as anchor.web3.PublicKey, _wrongBump];
  }


  async function getConfig() {
    const [_configPda, _configBump] = await PublicKey.findProgramAddress(
      //@ts-ignore
      [Buffer.from(anchor.utils.bytes.utf8.encode("config"))],
      program.programId
    );
    return [_configPda as anchor.web3.PublicKey, _configBump];
  }

  async function addRewardConfig(rarity, set, manaCost, rewardToken: anchor.web3.PublicKey) {
    const [_rewardConfigPda, _rewardConfigBump] = await getRewardConfigPda(rarity, set);
    const [_rewardVaultPda, _rewardVaultBump] = await getRewardVaultPda(rarity, set, rewardToken);
    const [_configPda, _] = await getConfigPda();
    await program.methods.addRewardConfig(rarity, set, manaCost, rewardToken)
    .accounts({config: _configPda as anchor.web3.PublicKey, authority: authorityKeyPair.publicKey, rewardToken: rewardToken, rewardConfig: _rewardConfigPda as anchor.web3.PublicKey, rewardVault: _rewardVaultPda})
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

  async function getConfigPda() {
    const [_configPda, _configBump] = await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("config"))],
      program.programId
    );
    return [_configPda as anchor.web3.PublicKey, _configBump];
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

  async function getWlConfig(mint, color, rarity, set) {
    const [_wlConfigPda, _wlConfigBump] = await getWlConfigPda(mint, color, rarity, set);
    const wlConfig = await program.account.wlConfig.fetch(_wlConfigPda as anchor.web3.PublicKey);
    return wlConfig;
  }

});
