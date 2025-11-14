import 'dotenv/config';
import * as tr from 'tronweb';
import { minusBalance } from '../db/wallets';
import prisma from "../db/prisma";

const ODDS_NUMERATOR = Number(process.env.ODDS_NUMERATOR!);
const ODDS_DENOMINATOR = Number(process.env.ODDS_DENOMINATOR!);

const FEE_NUMERATOR = Number(process.env.FEE_NUMERATOR!);
const FEE_DENOMINATOR = Number(process.env.FEE_DENOMINATOR!);

const tronWeb = new tr.TronWeb({
  fullHost: process.env.TRON_FULLNODE || "https://nile.trongrid.io"
});

// ---------------- BET INTERFACE ----------------
export interface Bet {
  id: string;
  txHash?: string;
  player?: string;
  token: string;
  amount: number;
  direction: "Small" | "Big";
  result?: "Small" | "Big";
  status: "pending" | "win" | "lose";
  payout?: number;
  blockNum: number;
  createdAt: Date;
  game: number,
  userId?: number
}

// ---------------- HELPER FUNCTIONS ----------------
function getBetDirection(amount: number): "Small" | "Big" {
  const lastDigit = Math.floor(amount) % 10;
  return lastDigit <= 4 ? "Small" : "Big";
}

export async function placeBet(player: string, amount: number, token: string, blockNum: number, userId: number = null, type: number = null) {

  const direction = getBetDirection(amount);

  const bet = await prisma.bet.create({
    data: { player, amount, token, direction, status: "pending", blockNum, game: 1, userId, type: type },
  });

  console.log(`📥 Bet stored: ${player} ${amount} ${token} -> ${direction}`);
}

async function getBlockLastDigit(blockNum: number): Promise<number> {
  const block = await tronWeb.trx.getBlock(blockNum);

  // Use blockID (hex string) as block hash
  const blockHash = block.blockID; // block.blockID is string like "0000abcd..."

  // Take last hex character and convert to decimal 0-15
  const lastHexChar = blockHash[blockHash.length - 1];
  const lastDigit = parseInt(lastHexChar, 16) % 10; // 0-9
  return lastDigit;
}

// ---------------- PAYOUT FUNCTION ----------------
async function settleBet(bet: Bet) {
  try {
    const lastDigit = await getBlockLastDigit(bet.blockNum);
    const result = lastDigit <= 4 ? "Small" : "Big";

    let payout = 0;
    let status: "win" | "lose" = "lose";

    if (result === bet.direction) {
      payout = ((bet.amount * ODDS_NUMERATOR) / ODDS_DENOMINATOR);
      payout = payout * (1 - FEE_NUMERATOR / FEE_DENOMINATOR);
      status = "win";

      await prisma.payout.create({ data: { to: bet.player, status: 'pending', currency: bet.token, amount: payout, userId: bet.userId } });
    }

    await prisma.bet.update({
      where: { id: bet.id },
      data: { result, status, payout },
    });

    console.log(`🎯 Bet settled: ${bet.player} ${status}, payout: ${payout} ${bet.token}`);
  } catch (err) {
    console.error("Error settling bet:", err);
  }
}

export const BetBigSmall = async (amount: number, token: string, userId: number) => {

  const fromBalance = await prisma.balance.findUnique({
    where: { userId_currency: { userId, currency: token } },
  });

  if (!fromBalance || Number(fromBalance.amount) < amount) {
    throw new Error('Insufficient balance');
  }

  const currentBlock = await tronWeb.trx.getCurrentBlock();
  const blockNum = currentBlock.block_header.raw_data.number;
  const direction = getBetDirection(amount);
  
  const bet = await prisma.bet.create({
    data: { amount, token, direction, status: "pending", blockNum, game: 1, userId, type: 3 },
  });

  await minusBalance(userId, amount, token);
  
  // Trigger referral bonuses for bets
  try {
    const { 
      triggerBetReferralBonus, 
      triggerFirstBetReferralBonus 
    } = require('../db/bonus');
    
    // Check if this is the user's first bet
    const existingBets = await prisma.bet.count({
      where: { userId },
    });

    // Trigger first bet bonus if this is the first bet
    if (existingBets === 1) { // 1 because we just created this bet
      await triggerFirstBetReferralBonus(userId, token);
    }

    // Always trigger regular bet bonus
    await triggerBetReferralBonus(userId, amount, token);
  } catch (error) {
    console.error("Error triggering referral bonuses for bet:", error);
    // Don't throw error to avoid breaking the bet flow
  }

  await settleBet(bet as Bet);
}

export async function placeBetInstant(player: string, amount: number, token: string, blockNum: number, userId: number = null, type: number = null) {

  const direction = getBetDirection(amount);

  const bet = await prisma.bet.create({
    data: { player, amount, token, direction, status: "pending", blockNum, game: 1, userId, type: type },
  });

  console.log(`📥 Bet stored: ${player} ${amount} ${token} -> ${direction}`);

  await settleBet(bet as Bet);

}

export const startBigSmall = () => {

  console.log("🚀 Big/Small Tron Game Started");

  setInterval(async () => {
    const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 1, type: 1 } });
    for (const bet of pendingBets) {
      await settleBet(bet as Bet);
    }
  }, 60000);

  setInterval(async () => {
    const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 1, type: 2 } });
    for (const bet of pendingBets) {
      await settleBet(bet as Bet);
    }
  }, 180000);

}

