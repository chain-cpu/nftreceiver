declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

use std::hash;

use anchor_lang::{prelude::*, solana_program::blake3::hash};
use anchor_spl::token::{ self, Transfer, Mint, Token, TokenAccount, Burn};

#[program]
pub mod nftreceiver {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = *ctx.accounts.deployer.key;
        config.mana_token = ctx.accounts.mana_token.key().clone();
        config.bump = *ctx.bumps.get("config").unwrap();
        Ok(())
    }

    pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = new_authority;
        Ok(())
    }

    pub fn add_wl_config(ctx: Context<AddWlConfig>, mint: Pubkey, color: u8, rarity: u8, set: u8) -> Result<()> {
        let wl_config = &mut ctx.accounts.wl_config;
        wl_config.mint = mint;
        wl_config.color = color;
        wl_config.rarity = rarity;
        wl_config.set = set;

        Ok(())
    }

    pub fn add_reward_config(ctx: Context<AddRewardConfig>, rarity: u8, set: u8, mana_cost: u64, reward_token: Pubkey) -> Result<()> {
        let reward_config = &mut ctx.accounts.reward_config;
        reward_config.rarity = rarity;
        reward_config.set = set;
        reward_config.mana_cost = mana_cost;
        reward_config.reward_token = reward_token.key().clone();
        Ok(())
    }


    pub fn burn_nfts<'info>(ctx: Context<'_, '_, '_, 'info, BurnNfts<'info>>, nfts: Vec<NftData>) -> Result<()> {

        let config = &ctx.accounts.config;
        let iter = nfts.iter();
        let mut flag = [0;12]; // 12 is mas color range
        let rarity = &nfts[0].rarity;
        for (pos, nft) in iter.enumerate() {
            let (_wl_config_pda, _wl_config_bump) = Pubkey::find_program_address(
                &[
                    b"wl-config".as_ref(), 
                    nft.mint.key().as_ref(), 
                    &[nft.color], 
                    &[nft.rarity], 
                    &[nft.set]
                ], ctx.program_id);
            let wl_config = & ctx.remaining_accounts[pos];
            assert_eq!(wl_config.key(), _wl_config_pda, "nft {} is not in whitelist", pos);

            // assert color is unique,
            assert_eq!(flag[nft.color as usize], 0, "nft {} color is duplicated", pos);
            flag[nft.color as usize] = 1;
            // assert rarity is same
            assert_eq!(rarity, &nft.rarity, "nft {} rarity is different", pos);
        }
        
        // TODO - generate rand value from 0 - 3
        let rand = get_random(
            ctx.accounts.clock.slot, ctx.accounts.clock.unix_timestamp as u64).unwrap();        
        // TODO - burn nft

        // get reward config of nft[rand]
        let lucky_nft = &nfts[rand];
        let (_reward_config_pda, _reward_config_bump) = Pubkey::find_program_address(
            &[
                b"reward-config".as_ref(), 
                &[lucky_nft.rarity], 
                &[lucky_nft.set]
            ], ctx.program_id);

        let reward_config = match rand {
            0 => &ctx.accounts.reward_config0,
            1 => &ctx.accounts.reward_config1,
            2 => &ctx.accounts.reward_config2,
            3 => &ctx.accounts.reward_config3,
            _ => &ctx.accounts.reward_config3,
        };
        
        let reward_vault = match rand {
            0 => &ctx.accounts.reward_vault0,
            1 => &ctx.accounts.reward_vault1,
            2 => &ctx.accounts.reward_vault2,
            3 => &ctx.accounts.reward_vault3,
            _ => &ctx.accounts.reward_vault3,
        };

        let user_reward_account = match rand {
            0 => &ctx.accounts.user_reward_account0,
            1 => &ctx.accounts.user_reward_account1,
            2 => &ctx.accounts.user_reward_account2,
            3 => &ctx.accounts.user_reward_account3,
            _ => &ctx.accounts.user_reward_account3,
        };

        assert_eq!(reward_config.key(), _reward_config_pda);
        // transfer mana
        burn_mana(
            ctx.accounts.user_mana_account.to_account_info(),
            ctx.accounts.mint_mana.to_account_info(),
            ctx.accounts.payer.to_account_info(),
            reward_config.mana_cost,
            ctx.accounts.token_program.to_account_info(),
        )?;
        let mint_nfts = [
            &ctx.accounts.mint_nft0, 
            &ctx.accounts.mint_nft1,
            &ctx.accounts.mint_nft2,
            &ctx.accounts.mint_nft3,
        ];
        let user_nft_accounts = [
            &ctx.accounts.user_nft_account0,
            &ctx.accounts.user_nft_account1,
            &ctx.accounts.user_nft_account2,
            &ctx.accounts.user_nft_account3,
        ];

        for item in mint_nfts.into_iter().enumerate() {
            let (i, mint_nft) = item;
            let burn_cpi_accounts = Burn {
                mint: mint_nft.to_account_info().clone(),
                from: user_nft_accounts[i].to_account_info().clone(),
                authority: ctx.accounts.payer.to_account_info(),
            };
    
            token::burn(CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                burn_cpi_accounts,
            ), 1);
        }

        let cpi_accounts = Transfer {
            from: reward_vault.to_account_info(),
            to: user_reward_account.to_account_info(),
            authority: config.to_account_info(),
        };

        // TODO - should set reward_token amount
        // transfer reward
        // panic!("rand: {}", rand);
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info().clone(), 
                cpi_accounts,
                &[&[
                    b"config".as_ref(),
                    &[config.bump],
                ]]
            ),
            100
        )?;

        Ok(())
    }   

}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        space = 8 + 32 + 32 + 1,
        payer = deployer,
        seeds = [b"config".as_ref()],
        bump,
    )]
    config: Account<'info, Config>,
    #[account(
        init,
        payer = deployer,
        seeds = [b"mana-token", mana_token.key().as_ref()],
        bump,
        token::mint = mana_token,
        token::authority = config,
    )]
    pda_mana_account: Account<'info, TokenAccount>,
    #[account(
        init,
        space = 8,
        payer = deployer,
        seeds = [b"wrong-pda"],
        bump,
    )]
    wrong_pda: Account<'info, Wrong>,
    #[account(mut)]
    deployer: Signer<'info>,
    mana_token: Account<'info, Mint>,
    /// CHECK:
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(mut, 
        has_one=authority,
        seeds=[b"config".as_ref()], bump=config.bump 
    )]
    config: Account<'info, Config>,
    authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(mint: Pubkey, color: u8, rarity: u8, set: u8)]
pub struct AddWlConfig<'info> {
    #[account(
        init,
        payer=authority,
        space = 8 + 32 + 1 + 1 + 1,
        seeds = [b"wl-config".as_ref(), mint.key().as_ref(), &[color], &[rarity], &[set]],
        bump
    )]
    wl_config: Account<'info, WlConfig>,
    #[account(mut)]
    authority: Signer<'info>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(rarity: u8, set: u8, mana_cost: u64, reward_token_mint: Pubkey)]
pub struct AddRewardConfig<'info> {
    #[account(mut)]
    authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config".as_ref()],
        bump = config.bump,
    )]
    config: Account<'info, Config>,
    #[account(
        constraint=reward_token_mint == reward_token.key()
    )]
    reward_token: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 1 + 1 + 8 + 32,
        seeds = [b"reward-config".as_ref(), &[rarity], &[set]],
        bump
    )]
    reward_config: Account<'info, RewardConfig>,
    #[account(
        init_if_needed,
        payer = authority,
        seeds = [b"reward-vault".as_ref(), reward_token.key().as_ref()],
        token::mint=reward_token, 
        token::authority=config,
        bump,
    )]
    reward_vault: Account<'info, TokenAccount>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
#[instruction(nfts: Vec<NftData>)]
pub struct BurnNfts<'info> {
    #[account(
        mut,
        seeds=[b"config"],
        bump=config.bump
    )]
    config: Account<'info, Config>,
    #[account(mut)]
    payer: Signer<'info>,
    
    #[account(mut)]
    mint_mana: Account<'info, Mint>,

    #[account(
        mut,
        token::mint=config.mana_token,
        token::authority=payer,
    )]
    user_mana_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"reward-config".as_ref(), &[nfts[0].rarity], &[nfts[0].set]],
        bump,
    )]
    reward_config0: Account<'info, RewardConfig>,
    
    #[account(
        seeds = [b"reward-config".as_ref(), &[nfts[1].rarity], &[nfts[1].set]],
        bump,
    )]
    reward_config1: Account<'info, RewardConfig>,
    
    #[account(
        seeds = [b"reward-config".as_ref(), &[nfts[2].rarity], &[nfts[2].set]],
        bump,
    )]
    reward_config2: Account<'info, RewardConfig>,
    
    #[account(
        seeds = [b"reward-config".as_ref(), &[nfts[3].rarity], &[nfts[3].set]],
        bump,
    )]
    reward_config3: Account<'info, RewardConfig>,
    
    #[account(
        mut,
        seeds = [b"reward-vault", reward_config0.reward_token.key().as_ref()],
        token::mint=reward_config0.reward_token.key(), 
        token::authority=config,
        bump,
    )]
    reward_vault0: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"reward-vault", reward_config1.reward_token.key().as_ref()],
        token::mint=reward_config1.reward_token.key(), 
        token::authority=config,
        bump,
    )]
    reward_vault1: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"reward-vault", reward_config2.reward_token.key().as_ref()],
        token::mint=reward_config2.reward_token.key(), 
        token::authority=config,
        bump,
    )]
    reward_vault2: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"reward-vault", reward_config3.reward_token.key().as_ref()],
        token::mint=reward_config3.reward_token.key(), 
        token::authority=config,
        bump,
    )]
    reward_vault3: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=reward_config0.reward_token.key(),
        token::authority=payer
    )]
    user_reward_account0: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=reward_config1.reward_token.key(),
        token::authority=payer
    )]
    user_reward_account1: Box<Account<'info, TokenAccount>>,


    #[account(
        mut,
        token::mint=reward_config2.reward_token.key(),
        token::authority=payer
    )]
    user_reward_account2: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=reward_config3.reward_token.key(),
        token::authority=payer
    )]
    user_reward_account3: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    mint_nft0: Box<Account<'info, Mint>>,

    #[account(mut)]
    mint_nft1: Box<Account<'info, Mint>>,

    #[account(mut)]
    mint_nft2: Box<Account<'info, Mint>>,

    #[account(mut)]
    mint_nft3: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint=nfts[0].mint.key(),
        token::authority=payer,
    )]
    user_nft_account0: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=nfts[1].mint.key(),
        token::authority=payer,
    )]
    user_nft_account1: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=nfts[2].mint.key(),
        token::authority=payer,
    )]
    user_nft_account2: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint=nfts[3].mint.key(),
        token::authority=payer,
    )]
    user_nft_account3: Box<Account<'info, TokenAccount>>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
    clock: Sysvar<'info, Clock>,
}

#[account]
pub struct Config {
    mana_token: Pubkey,
    authority: Pubkey,
    bump: u8,
}

#[account]
pub struct WlConfig {
    mint: Pubkey,
    color: u8,
    rarity: u8,
    set: u8,
}



#[account]
pub struct RewardConfig {
    rarity: u8,
    set: u8,
    mana_cost: u64,
    reward_token: Pubkey,
}

#[account]
pub struct Wrong {
}


#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct NftData {
    mint: Pubkey,
    color: u8,
    rarity: u8,
    set: u8,   
}



fn burn_mana<'info> (
    user_mana_account: AccountInfo<'info>,
    mint_mana: AccountInfo<'info>,
    payer: AccountInfo<'info>,
    amount: u64,
    token_program: AccountInfo<'info>,

) -> Result<()> {
    let burn_cpi_accounts = Burn {
        mint: mint_mana.to_account_info().clone(),
        from: user_mana_account.to_account_info().clone(),
        authority: payer.to_account_info(),
    };

    token::burn(CpiContext::new(
        token_program.to_account_info(),
        burn_cpi_accounts,
    ), amount);

    Ok(())
}

fn get_random(seed0: u64, seed1: u64) -> Result<usize> {
    // NOTE - For the test scripts, let it bedeterministic.
    let hash_val0 = hash(&seed0.to_be_bytes());
    let hash_val1 = hash(&seed1.to_be_bytes());

    Ok((hash_val0.0[(hash_val1.0[1] as usize % hash_val0.0.len()) as usize] % 4u8 )as usize)

}