use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};
use anchor_spl::token::spl_token::state::Account as SplTokenAccount;

declare_id!("5f19UuCzbvSCnZQtdHMv1fqghr9UjC7DvrwZ1QyhgdUH");

const MAX_TEAM_NAME_LEN: usize = 64;
const MAX_DESCRIPTION_LEN: usize = 160;
const MAX_MEMBERS: usize = 10;
const BPS_SCALE: u64 = 10_000;
const DEFAULT_PLATFORM_FEE_BPS: u16 = 30; // 0.3%
const PLATFORM_WALLET: &str = "8vEABHXNfegBG5dVVNi7DzXL9f9fztup15Y6ttSUTM9v";

#[program]
pub mod zplit_program {
    use super::*;

    /// Creates a reusable team profile to split future invoices.
    pub fn create_team_profile(
        ctx: Context<CreateTeamProfile>,
        team_name: String,
        split_type: SplitType,
        members: Vec<MemberShareInput>,
    ) -> Result<()> {
        validate_team_profile_input(&team_name, split_type, &members)?;

        let team_profile = &mut ctx.accounts.team_profile;
        team_profile.authority = ctx.accounts.authority.key();
        team_profile.team_name = team_name;
        team_profile.split_type = split_type;
        team_profile.members = members
            .into_iter()
            .map(|m| MemberShare {
                wallet: m.wallet,
                value: m.value,
            })
            .collect();
        team_profile.bump = ctx.bumps.team_profile;
        Ok(())
    }

    /// Creates an invoice linked to an existing team profile.
    pub fn create_invoice(
        ctx: Context<CreateInvoice>,
        invoice_seed: u64,
        amount: u64,
        description: String,
        due_date: i64,
    ) -> Result<()> {
        require!(amount > 0, ZplitError::InvalidAmount);
        require!(
            description.len() <= MAX_DESCRIPTION_LEN,
            ZplitError::DescriptionTooLong
        );

        let team_profile = &ctx.accounts.team_profile;
        require!(
            team_profile.members.len() > 0,
            ZplitError::TeamRequiresMembers
        );

        let invoice = &mut ctx.accounts.invoice;
        invoice.invoice_seed = invoice_seed;
        invoice.amount = amount;
        invoice.description = description;
        invoice.due_date = due_date;
        invoice.team_profile_pubkey = team_profile.key();
        invoice.payer = Pubkey::default();
        invoice.status = InvoiceStatus::Unpaid;
        invoice.platform_fee_bps = DEFAULT_PLATFORM_FEE_BPS;
        invoice.bump = ctx.bumps.invoice;
        Ok(())
    }

    /// Pays an invoice in USDC and atomically splits all funds.
    ///
    /// Remaining accounts expected order:
    /// 1..=N member USDC ATAs (same order as team_profile.members)
    /// N+1 platform USDC ATA
    pub fn pay_invoice<'info>(
        ctx: Context<'_, '_, '_, 'info, PayInvoice<'info>>,
    ) -> Result<()> {
        let invoice = &mut ctx.accounts.invoice;
        require!(
            invoice.status == InvoiceStatus::Unpaid,
            ZplitError::InvoiceAlreadyPaid
        );
        require!(
            invoice.team_profile_pubkey == ctx.accounts.team_profile.key(),
            ZplitError::InvoiceTeamMismatch
        );

        let now = Clock::get()?.unix_timestamp;
        require!(invoice.due_date >= now, ZplitError::InvoicePastDue);

        let team_profile = &ctx.accounts.team_profile;
        let member_count = team_profile.members.len();
        require!(member_count > 0, ZplitError::TeamRequiresMembers);

        let expected_remaining = member_count + 1;
        require!(
            ctx.remaining_accounts.len() == expected_remaining,
            ZplitError::InvalidRemainingAccounts
        );

        let platform_wallet = Pubkey::try_from(PLATFORM_WALLET).map_err(|_| ZplitError::InvalidPlatformWallet)?;
        let platform_ata_info = &ctx.remaining_accounts[member_count];
        validate_token_account(
            platform_ata_info,
            &ctx.accounts.usdc_mint.key(),
            &platform_wallet,
            ZplitError::InvalidPlatformAtaOwner,
        )?;

        let total_amount = invoice.amount;
        let platform_fee = total_amount
            .checked_mul(invoice.platform_fee_bps as u64)
            .ok_or(ZplitError::MathOverflow)?
            / BPS_SCALE;
        let distributable = total_amount
            .checked_sub(platform_fee)
            .ok_or(ZplitError::MathOverflow)?;

        let payouts = calculate_payouts(&team_profile.split_type, &team_profile.members, distributable)?;

        for (idx, member) in team_profile.members.iter().enumerate() {
            let recipient_info = &ctx.remaining_accounts[idx];
            validate_token_account(
                recipient_info,
                &ctx.accounts.usdc_mint.key(),
                &member.wallet,
                ZplitError::InvalidRecipientOwner,
            )?;

            if payouts[idx] > 0 {
                let cpi_accounts = TransferChecked {
                    from: ctx.accounts.payer_usdc_ata.to_account_info(),
                    to: recipient_info.clone(),
                    authority: ctx.accounts.payer.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                transfer_checked(cpi_ctx, payouts[idx], ctx.accounts.usdc_mint.decimals)?;
            }
        }

        if platform_fee > 0 {
            let cpi_accounts = TransferChecked {
                from: ctx.accounts.payer_usdc_ata.to_account_info(),
                to: platform_ata_info.clone(),
                authority: ctx.accounts.payer.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
            transfer_checked(cpi_ctx, platform_fee, ctx.accounts.usdc_mint.decimals)?;
        }

        invoice.payer = ctx.accounts.payer.key();
        invoice.status = InvoiceStatus::Paid;
        Ok(())
    }
}

fn validate_token_account(
    token_account_info: &AccountInfo,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
    owner_error: ZplitError,
) -> Result<()> {
    let token_account_data = token_account_info.try_borrow_data()?;
    let parsed = SplTokenAccount::unpack(&token_account_data)
        .map_err(|_| error!(ZplitError::InvalidRecipientMint))?;

    require_keys_eq!(parsed.mint, *expected_mint, ZplitError::InvalidRecipientMint);
    require_keys_eq!(parsed.owner, *expected_owner, owner_error);
    Ok(())
}

fn validate_team_profile_input(
    team_name: &str,
    split_type: SplitType,
    members: &[MemberShareInput],
) -> Result<()> {
    require!(!team_name.trim().is_empty(), ZplitError::InvalidTeamName);
    require!(
        team_name.len() <= MAX_TEAM_NAME_LEN,
        ZplitError::TeamNameTooLong
    );
    require!(!members.is_empty(), ZplitError::TeamRequiresMembers);
    require!(members.len() <= MAX_MEMBERS, ZplitError::TooManyMembers);

    match split_type {
        SplitType::Percentage => {
            let total = members.iter().try_fold(0_u64, |acc, member| {
                acc.checked_add(member.value).ok_or(ZplitError::MathOverflow)
            })?;
            require!(total == BPS_SCALE, ZplitError::InvalidPercentageTotal);
        }
        SplitType::Fixed => {
            for member in members {
                require!(member.value > 0, ZplitError::InvalidFixedAmount);
            }
        }
    }

    Ok(())
}

fn calculate_payouts(
    split_type: &SplitType,
    members: &[MemberShare],
    distributable_amount: u64,
) -> Result<Vec<u64>> {
    match split_type {
        SplitType::Percentage => {
            let mut payouts = Vec::with_capacity(members.len());
            let mut running_sum = 0_u64;

            for member in members {
                let payout = distributable_amount
                    .checked_mul(member.value)
                    .ok_or(ZplitError::MathOverflow)?
                    / BPS_SCALE;
                payouts.push(payout);
                running_sum = running_sum
                    .checked_add(payout)
                    .ok_or(ZplitError::MathOverflow)?;
            }

            // Assign rounding remainder to the first member.
            let remainder = distributable_amount
                .checked_sub(running_sum)
                .ok_or(ZplitError::MathOverflow)?;
            if let Some(first) = payouts.first_mut() {
                *first = first.checked_add(remainder).ok_or(ZplitError::MathOverflow)?;
            }

            Ok(payouts)
        }
        SplitType::Fixed => {
            let mut payouts = Vec::with_capacity(members.len());
            let mut fixed_total = 0_u64;

            for member in members {
                payouts.push(member.value);
                fixed_total = fixed_total
                    .checked_add(member.value)
                    .ok_or(ZplitError::MathOverflow)?;
            }

            require!(
                fixed_total == distributable_amount,
                ZplitError::FixedTotalMustMatchInvoice
            );
            Ok(payouts)
        }
    }
}

#[derive(Accounts)]
#[instruction(team_name: String)]
pub struct CreateTeamProfile<'info> {
    #[account(
        init,
        payer = authority,
        space = TeamProfile::SPACE,
        seeds = [b"team-profile", authority.key().as_ref(), team_name.as_bytes()],
        bump
    )]
    pub team_profile: Account<'info, TeamProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(invoice_seed: u64)]
pub struct CreateInvoice<'info> {
    #[account(
        init,
        payer = authority,
        space = Invoice::SPACE,
        seeds = [b"invoice", team_profile.key().as_ref(), &invoice_seed.to_le_bytes()],
        bump
    )]
    pub invoice: Account<'info, Invoice>,
    pub team_profile: Account<'info, TeamProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayInvoice<'info> {
    #[account(mut, constraint = invoice.team_profile_pubkey == team_profile.key() @ ZplitError::InvoiceTeamMismatch)]
    pub invoice: Account<'info, Invoice>,
    pub team_profile: Account<'info, TeamProfile>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        constraint = payer_usdc_ata.owner == payer.key() @ ZplitError::InvalidPayerAtaOwner,
        constraint = payer_usdc_ata.mint == usdc_mint.key() @ ZplitError::InvalidRecipientMint,
    )]
    pub payer_usdc_ata: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct TeamProfile {
    pub authority: Pubkey,
    pub team_name: String,
    pub split_type: SplitType,
    pub members: Vec<MemberShare>,
    pub bump: u8,
}

impl TeamProfile {
    pub const SPACE: usize = 8
        + 32
        + 4
        + MAX_TEAM_NAME_LEN
        + 1
        + 4
        + (MAX_MEMBERS * MemberShare::SPACE)
        + 1;
}

#[account]
pub struct Invoice {
    pub invoice_seed: u64,
    pub amount: u64,
    pub description: String,
    pub due_date: i64,
    pub team_profile_pubkey: Pubkey,
    pub payer: Pubkey,
    pub status: InvoiceStatus,
    pub platform_fee_bps: u16,
    pub bump: u8,
}

impl Invoice {
    pub const SPACE: usize = 8 + 8 + 8 + 4 + MAX_DESCRIPTION_LEN + 8 + 32 + 32 + 1 + 2 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SplitType {
    Percentage,
    Fixed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum InvoiceStatus {
    Unpaid,
    Paid,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MemberShareInput {
    pub wallet: Pubkey,
    pub value: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MemberShare {
    pub wallet: Pubkey,
    pub value: u64,
}

impl MemberShare {
    pub const SPACE: usize = 32 + 8;
}

#[error_code]
pub enum ZplitError {
    #[msg("Team name cannot be empty.")]
    InvalidTeamName,
    #[msg("Team name is too long.")]
    TeamNameTooLong,
    #[msg("Description is too long.")]
    DescriptionTooLong,
    #[msg("At least one team member is required.")]
    TeamRequiresMembers,
    #[msg("Too many team members.")]
    TooManyMembers,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Math overflow.")]
    MathOverflow,
    #[msg("Percentage splits must total exactly 10000 bps.")]
    InvalidPercentageTotal,
    #[msg("Fixed split amount must be greater than 0.")]
    InvalidFixedAmount,
    #[msg("Invoice is already paid.")]
    InvoiceAlreadyPaid,
    #[msg("Invoice due date has passed.")]
    InvoicePastDue,
    #[msg("Invoice and team profile mismatch.")]
    InvoiceTeamMismatch,
    #[msg("Fixed split total must match distributable invoice amount.")]
    FixedTotalMustMatchInvoice,
    #[msg("Incorrect number of remaining accounts passed to pay_invoice.")]
    InvalidRemainingAccounts,
    #[msg("Invalid recipient ATA owner.")]
    InvalidRecipientOwner,
    #[msg("Invalid recipient mint.")]
    InvalidRecipientMint,
    #[msg("Payer token account owner mismatch.")]
    InvalidPayerAtaOwner,
    #[msg("Platform wallet constant is invalid.")]
    InvalidPlatformWallet,
    #[msg("Platform ATA owner mismatch.")]
    InvalidPlatformAtaOwner,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentage_payouts_handle_remainder() {
        let members = vec![
            MemberShare {
                wallet: Pubkey::default(),
                value: 3_333,
            },
            MemberShare {
                wallet: Pubkey::default(),
                value: 3_333,
            },
            MemberShare {
                wallet: Pubkey::default(),
                value: 3_334,
            },
        ];

        let payouts =
            calculate_payouts(&SplitType::Percentage, &members, 1_000).expect("must calculate");
        assert_eq!(payouts.iter().sum::<u64>(), 1_000);
    }

    #[test]
    fn fixed_payouts_must_match_distributable() {
        let members = vec![
            MemberShare {
                wallet: Pubkey::default(),
                value: 700,
            },
            MemberShare {
                wallet: Pubkey::default(),
                value: 300,
            },
        ];

        let payouts =
            calculate_payouts(&SplitType::Fixed, &members, 1_000).expect("must calculate");
        assert_eq!(payouts, vec![700, 300]);
    }
}
