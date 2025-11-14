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
interface Bet {
    id: string;
    txHash?: string;
    player?: string;
    token: string;
    amount: number;
    direction: string;
    result?: "Small" | "Big";
    status: "pending" | "win" | "lose";
    payout?: number;
    blockNum: number;
    createdAt: Date;
    game: number,
    userId?: number
}

// ---------------- HELPER FUNCTIONS ----------------

function getBetDirection(amount: number): "Odd" | "Even" {
    const lastDigit = parseInt(amount.toString().slice(-1));
    return lastDigit % 2 === 0 ? "Even" : "Odd";
}

function getResultFromBlock(blockHash: string) {
    const lastChar = blockHash.slice(-1).toLowerCase();
    if (!/[0-9]/.test(lastChar)) return "Even"; // letters treated as Even
    const digit = parseInt(lastChar, 10);
    return digit % 2 === 0 ? "Even" : "Odd";
}


export const placeBet = async (player: string, amount: number, token: string, blockNum: number, userId: number = null, type: number = null) => {

    const direction = getBetDirection(amount);

    const bet = await prisma.bet.create({
        data: { player, amount, token, direction, status: "pending", blockNum, game: 5, userId, type },
    });

    console.log(`📥 Bet stored: ${player} ${amount} ${token} -> ${direction}`);
}


export const settleBet = async (bet: Bet, blockHash: string) => {
    try {

        const result = getResultFromBlock(blockHash);

        let payout = 0;
        let status: "win" | "lose" = "lose";

        if (result == bet.direction) {
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

export const BetOddEven = async (amount: number, token: string, userId: number) => {

    const fromBalance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: token } },
    });

    if (!fromBalance || Number(fromBalance.amount) < amount) {
        throw new Error('Insufficient balance');
    }

    const block = await tronWeb.trx.getCurrentBlock();
    const blockNum = block.block_header.raw_data.number;
    const blockHash = block.blockID.slice(-8);
    const direction = getBetDirection(amount);
    const result = getResultFromBlock(blockHash);

    let payout = 0;
    let status: "win" | "lose" = "lose";

    if (result == direction) {
        payout = ((amount * ODDS_NUMERATOR) / ODDS_DENOMINATOR);
        payout = payout * (1 - FEE_NUMERATOR / FEE_DENOMINATOR);
        status = "win";
        await prisma.payout.create({ data: { status: 'pending', currency: token, amount: payout, userId } });
    }

    const bet = await prisma.bet.create({
        data: { amount, token, direction, status: status, game: 5, type: 3, blockNum, userId },
    });

    console.log(`📥 Bet stored: ${userId} ${amount} ${token} -> ${direction}`);

}

export const betOddEvenInstant = async (from: string, amount: number, token: string) => {

    const block = await tronWeb.trx.getCurrentBlock();
    const blockNum = block.block_header.raw_data.number;
    const blockHash = block.blockID.slice(-8);
    const direction = getBetDirection(amount);
    const result = getResultFromBlock(blockHash);

    let payout = 0;
    let status: "win" | "lose" = "lose";

    if (result == direction) {
        payout = ((amount * ODDS_NUMERATOR) / ODDS_DENOMINATOR);
        payout = payout * (1 - FEE_NUMERATOR / FEE_DENOMINATOR);
        status = "win";
        await prisma.payout.create({ data: { to: from, status: 'pending', currency: token, amount: payout } });
    }

    const bet = await prisma.bet.create({
        data: { player: from, amount, token, direction, status: status, game: 5, type: 3, blockNum },
    });

    console.log(`📥 Bet stored: ${from} ${amount} ${token} -> ${direction}`);

}

export const startOddEven = () => {

    console.log("🚀 OddEven Tron Game Started");

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 5, type: 3 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await settleBet(bet as Bet, blockHash);
        }
    }, 60000);

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 5, type: 3 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await settleBet(bet as Bet, blockHash);
        }
    }, 180000);

}

