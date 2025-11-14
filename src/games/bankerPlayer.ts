import * as tr from 'tronweb';
import { minusBalance } from '../db/wallets';
import prisma from "../db/prisma";

// ============ CONFIG ============
const NODE = process.env.TRON_FULLNODE || "https://nile.trongrid.io";
const FEE_PERCENT = 1; // 1%

const tronWeb = new tr.TronWeb({
    fullHost: NODE
});


// === HELPERS ===
function fmt(amount: bigint, decimals: number): string {
    return (Number(amount) / 10 ** decimals).toFixed(2);
}

function hexToValue(hex: string): number {
    return [...hex.toLowerCase()].reduce((sum, ch) => {
        const v = ch >= "0" && ch <= "9" ? parseInt(ch, 10) : 0;
        return sum + v;
    }, 0) % 10;
}

function playBankerPlayerTie(betAmount: bigint, blockHash: string) {
    const betType = Number(betAmount % BigInt(10)); // last digit decides bet type
    const bankerVal = hexToValue(blockHash.slice(0, 2));
    const playerVal = hexToValue(blockHash.slice(-2));

    let result: "banker" | "player" | "tie";
    if (bankerVal > playerVal) result = "banker";
    else if (playerVal > bankerVal) result = "player";
    else result = "tie";

    let payout = 0;

    if (result === "tie") {
        if (betType === 3) {
            payout = Number(betAmount) * 8;
            payout -= payout * (FEE_PERCENT / 100);
        } else {
            payout = Number(betAmount) * 0.5; // 50% refund
        }
    } else if ((result === "banker" && betType === 1) || (result === "player" && betType === 2)) {
        payout = Number(betAmount) * 1.95;
        payout -= payout * (FEE_PERCENT / 100);
    }

    return {
        betType,
        bankerVal,
        playerVal,
        result,
        payout: Number(payout.toFixed(2))
    };
}


export const setBet = async (from: string, amount: number, blockNum: number, type: number, token: string, txHash: string) => {

    await prisma.bet.create({
        data: {
            player: from,
            token: token,
            amount: amount,
            blockNum: blockNum,
            status: "pending",
            game: 4,
            direction: "",
            type,
            txHash
        },
    });

    console.log(
        `🎲 BankerPlayer  Bet: ${from} bet ${token} ${amount} type ${type}`
    );
}

const processBet = async (id: string, asset: string, from: string, amountBase: bigint, blockHash: string, txid: string) => {

    const res = playBankerPlayerTie(amountBase, blockHash);
    const result = `\nTX ${txid}\nFrom: ${from}\nAsset: ${asset}\nBet: ${fmt(amountBase, 6)} ${asset}\nBanker=${res.bankerVal}, Player=${res.playerVal}\nResult=${res.result} | BetType=${res.betType}\nPayout=${res.payout} ${asset}`
    console.log(result)
    const win = res.result == "player";

    await prisma.bet.update({
        where: { id: id },
        data: { status: win ? "win" : "lose", payout: res.payout, result: `` },
    });

    if (win) {
        await prisma.payout.create({ data: { to: from, status: 'pending', currency: asset, amount: res.payout } });
        console.log(`[PAID] ${res.payout} base units of ${asset} to ${from}`);
    } else {
        console.log(`[LOST] ${res.payout} base units of ${asset} to ${from}`);
    }

}


export const starBankerPlayer = async () => {

    console.log("🚀 Banker Player Tron Game Started");

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 4, type: 1 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await processBet(bet.id, bet.token, bet.player, BigInt(Math.floor(bet.amount * 1_000_000)), blockHash, bet.txHash);
        }
    }, 60000);

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 4, type: 2 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await processBet(bet.id, bet.token, bet.player, BigInt(Math.floor(bet.amount * 1_000_000)), blockHash, bet.txHash);
        }
    }, 180000);

}

export const betBankerPlayerInstant = async (from: string, amount: number, currency: string) => {

    const block = await tronWeb.trx.getCurrentBlock();
    const blockHash = block.blockID.slice(-8);

    const amountBase = BigInt(Math.floor(amount * 1_000_000));

    const res = playBankerPlayerTie(amountBase, blockHash);

    const result = `\nFrom: ${from}\nAsset: ${currency}\nBet: ${fmt(amountBase, 6)} ${currency}\nBanker=${res.bankerVal}, Player=${res.playerVal}\nResult=${res.result} | BetType=${res.betType}\nPayout=${res.payout} ${currency}`
    console.log(result)

    const win = res.result == "player";

    await prisma.bet.create({
        data: {
            player: '',
            token: currency,
            amount: Number(fmt(amountBase, 6)),
            payout: win ? res.payout : 0,
            blockNum: block.block_header.raw_data.number,
            status: win ? "win" : "lose",
            game: 4,
            direction: "",
            result: result,
            type: 3
        },
    });

    if (win) {
       await prisma.payout.create({ data: { status: 'pending', currency: currency, amount: res.payout, to: from } });
        console.log(`[PAID] ${currency} base units of ${res.payout}`);
    } else {
        console.log(`[MINUS] ${currency} base units of ${amount}`);
    }

}

export const BetBankerPlayer = async (userId: number, amount: number, currency: string) => {

    const fromBalance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: currency } },
    });

    if (!fromBalance || Number(fromBalance.amount) < amount) {
        throw new Error('Insufficient balance');
    }

    const block = await tronWeb.trx.getCurrentBlock();
    const blockHash = block.blockID.slice(-8);

    const amountBase = BigInt(Math.floor(amount * 1_000_000));

    const res = playBankerPlayerTie(amountBase, blockHash);

    const result = `\nFrom: ${userId}\nAsset: ${currency}\nBet: ${fmt(amountBase, 6)} ${currency}\nBanker=${res.bankerVal}, Player=${res.playerVal}\nResult=${res.result} | BetType=${res.betType}\nPayout=${res.payout} ${currency}`
    console.log(result)

    const win = res.result == "player";

    await prisma.bet.create({
        data: {
            player: '',
            token: currency,
            amount: Number(fmt(amountBase, 6)),
            payout: win ? res.payout : 0,
            blockNum: block.block_header.raw_data.number,
            status: win ? "win" : "lose",
            game: 4,
            direction: "",
            result: result,
            type: 3
        },
    });

    if (win) {
        await prisma.payout.create({ data: { status: 'pending', currency: currency, amount: res.payout, userId: userId } });
        console.log(`[PAID] ${res.payout} base units of ${currency} to ${userId}`);
    } else {
        await minusBalance(userId, amount, currency);
        console.log(`[MINUS] ${amount} base units of ${currency}`);
    }

}