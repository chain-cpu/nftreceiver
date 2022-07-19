declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

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
        payer=deployer,
        seeds=[b"mana-token", mana_token.key().as_ref()],
        bump,
        token::mint=mana_token,
        token::authority=config,
    )]
    pda_mana_account: Account<'info, TokenAccount>,
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
        constraint=reward_token_mint == reward_token.key()
    )]
    reward_token: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + 1 + 1 + 8 + 32,
        seeds = [b"reward-config".as_ref(), &[rarity], &[set]],
        bump
    )]
    reward_config: Account<'info, RewardConfig>,
    #[account(
        init,
        payer = authority,
        seeds = [b"reward-vault", reward_token.key().as_ref()],
        token::mint=reward_token,
        token::authority=reward_config,
        bump,
    )]
    reward_vault: Account<'info, TokenAccount>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
pub struct BurnNfts {

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
