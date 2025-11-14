import * as tr from "tronweb";
import { minusBalance } from '../db/wallets';
import { Bet } from './bigSmall';
import prisma from "../db/prisma";

// ==== CONFIG ====
const NODE = process.env.TRON_FULLNODE || "https://nile.trongrid.io";

const ODDS_NUMERATOR = 195; // 1.95x
const ODDS_DENOMINATOR = 100;
const PLATFORM_FEE = 1; // %

const tronWeb = new tr.TronWeb({
    fullHost: NODE
});

// ==== HELPERS ====
function isLetter(c: string) {
    return /[a-f]/i.test(c);
}
function isDigit(c: string) {
    return /[0-9]/.test(c);
}

function checkWin(blockHash: string): boolean {
    const lastTwo = blockHash.slice(-2).toLowerCase();
    const [c1, c2] = lastTwo.split("");
    return (
        (isDigit(c1) && isLetter(c2)) ||
        (isLetter(c1) && isDigit(c2))
    );
}

function calculatePayout(amount: number): number {
    const raw = BigInt(Math.floor(amount * 1e6));
    let payout = (raw * BigInt(ODDS_NUMERATOR)) / BigInt(ODDS_DENOMINATOR);
    payout = (payout * BigInt(100 - PLATFORM_FEE)) / BigInt(100);
    return Number(payout) / 1e6;
}


export const setBet = async (from: string, amount: number, blockNum: number, type: number, token: string) => {
    await prisma.bet.create({
        data: {
            player: from,
            token: token,
            amount: amount,
            blockNum: blockNum,
            status: "pending",
            game: 2,
            direction: "",
            type
        },
    });

    console.log(
        `🎲 LetterNumber  Bet: ${from} bet ${token} ${amount} type ${type}`
    );
}

const settleBet = async (bet: Bet, block: string) => {

    const win = checkWin(block);

    const payout = win ? calculatePayout(bet.amount) : 0;
    const status = win ? "win" : "loose";

    await prisma.bet.update({
        where: { id: bet.id },
        data: { status, payout },
    });

    if (payout > 0) {
        await prisma.payout.create({ data: { to: bet.player, status: 'pending', currency: bet.token, amount: payout, userId: bet.userId } });
    }

    console.log(
        `🎲 LetterNumber  Bet: ${bet.player}, payout=${payout}`
    );
}


export const startLuckyGame = () => {
    console.log("🚀 Lucky Tron Game Started");
    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 2, type: 1 } });
        const block = await tronWeb.trx.getCurrentBlock();
        for (const bet of pendingBets) {
            await settleBet(bet as Bet, block.blockID);
        }
    }, 60000);

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 2, type: 2 } });
        const block = await tronWeb.trx.getCurrentBlock();
        for (const bet of pendingBets) {
            await settleBet(bet as Bet, block.blockID);
        }
    }, 180000);
}

export const betLuckyInstant = async (from: string, amount: number, token: string) => {

    const block = await tronWeb.trx.getCurrentBlock();

    const win = checkWin(block.blockID);
    const payout = win ? calculatePayout(amount) : 0;

    await prisma.bet.create({
        data: {
            player: from,
            token: token,
            amount: amount,
            payout,
            blockNum: block.block_header.raw_data.number,
            status: win ? "win" : "lose",
            game: 2,
            direction: "",
            type: 3
        },
    });

    if (payout > 0) {
        await prisma.payout.create({ data: { to: from, status: 'pending', currency: token, amount: payout } });
    }

    console.log(
        `🎲 LetterNumber ${token} Bet: ${from} bet ${amount}, result=${win ? "WIN" : "LOSE"}, payout=${payout}`
    );

}

export const BetLucky = async (userId: number, amount: number, currency: string) => {

    const fromBalance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: currency } },
    });

    if (!fromBalance || Number(fromBalance.amount) < amount) {
        throw new Error('Insufficient balance');
    }

    const block = await tronWeb.trx.getCurrentBlock();

    const win = checkWin(block.blockID);
    const payout = win ? calculatePayout(amount) : 0;

    await prisma.bet.create({
        data: {
            player: '',
            token: currency,
            amount: amount,
            payout,
            blockNum: block.block_header.raw_data.number,
            status: win ? "win" : "lose",
            game: 2,
            direction: "",
            userId: userId,
            type: 3
        },
    });

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
            await triggerFirstBetReferralBonus(userId, currency);
        }

        // Always trigger regular bet bonus
        await triggerBetReferralBonus(userId, amount, currency);
    } catch (error) {
        console.error("Error triggering referral bonuses for bet:", error);
        // Don't throw error to avoid breaking the bet flow
    }

    if (payout > 0) {
        console.log("win")
        await prisma.payout.create({ data: { status: 'pending', currency: currency, amount: payout, userId: userId } });
    }else{
        await minusBalance(userId, amount, currency);
    }

    console.log(
        `🎲 LetterNumber ${currency} Bet: ${userId} bet ${amount}, result=${win ? "WIN" : "LOSE"}, payout=${payout}`
    );

}