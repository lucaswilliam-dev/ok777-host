import * as tr from 'tronweb';
import BigNumber from 'bignumber.js';
import { minusBalance } from '../db/wallets';
import prisma from "../db/prisma";

// ============ CONFIG ============
const NODE = process.env.TRON_FULLNODE || "https://nile.trongrid.io";


const tronWeb = new tr.TronWeb({
    fullHost: NODE
});

// ============ HELPERS ============
function last5(hashHex: string): string {
    return hashHex.replace(/^0x/i, "").slice(-5).toLowerCase();
}

function charVal(c: string): number {
    return /[0-9]/.test(c) ? Number(c) : 10;
}

function niuPoints(triple: string): number {
    const sum = triple.split("").reduce((a, c) => a + charVal(c), 0);
    const mod = sum % 10;
    return mod === 0 ? 10 : mod;
}

function compute(last5str: string) {
    const bankerTrip = last5str.slice(0, 3);
    const playerTrip = last5str.slice(2, 5);
    return {
        banker: niuPoints(bankerTrip),
        player: niuPoints(playerTrip),
        bankerTrip,
        playerTrip,
    };
}

function calcSettlement(betBase: BigNumber, banker: number, player: number) {
    const bet = new BigNumber(betBase);

    if (player > banker) {
        // player wins
        const gross = bet.times(10).plus(bet.times(player).times(0.95));
        let fee = new BigNumber(0);

        if (player === 9 || player === 10) {
            // 10% fee on winnings portion only
            const winnings = bet.times(player).times(0.95);
            fee = winnings.times(0.10);
        }

        const net = gross.minus(fee);
        return { type: "player", gross, fee, net };
    }

    if (banker > player) {
        // banker wins
        const gross = bet.times(10 - banker);
        const fee = new BigNumber(0);
        const net = gross;
        return { type: "banker", gross, fee, net };
    }

    // tie
    const fee = bet.times(0.01);
    const net = bet.minus(fee);
    return { type: "tie", gross: bet, fee, net };

}

function fmt(amountBase: BigNumber, decimals: number): string {
    return amountBase.div(10 ** decimals).toFixed();
}


// ============ CORE PROCESS ============
const processBet = async (id: string, asset: string, from: string, amountBase: BigNumber, blockHash: string, txid: string) => {

    const last5str = last5(blockHash);
    const { banker, player, bankerTrip, playerTrip } = compute(last5str);
    const res = calcSettlement(amountBase, banker, player);

    console.log(
        `\nTX ${txid}\nAsset: ${asset}\nFrom: ${from}\nBet: ${fmt(amountBase, 6)} ${asset}` +
        `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}` +
        `\nResult=${res.type} -> payout=${fmt(res.net, 6)} ${asset} (fee=${fmt(res.fee, 6)})`
    );

    const status = res.type == "player" ? "win" : "loose";

    if (res.type == "player") {
        await prisma.payout.create({ data: { to: from, status: 'pending', currency: asset, amount: Number(fmt(res.net, 6)) } });
        console.log(`[PAID] ${fmt(res.net, 6)} base units of ${asset} to ${from}`);
    }

    await prisma.bet.update({
        where: { id: id },
        data: { status, payout: Number(fmt(res.net, 6)), result: `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}` },
    });

}

export const setBet = async (from: string, amount: number, blockNum: number, type: number, token: string, txHash: string) => {

    await prisma.bet.create({
        data: {
            player: from,
            token: token,
            amount: amount,
            blockNum: blockNum,
            status: "pending",
            game: 3,
            direction: "",
            type,
            txHash
        },
    });

    console.log(
        `🎲 Niuniu  Bet: ${from} bet ${token} ${amount} type ${type}`
    );
}

export const startNiuNiu = async () => {

    console.log("🚀 NiuNui Tron Game Started");

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 3, type: 1 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await processBet(bet.id, bet.token, bet.player, new BigNumber(Math.floor(bet.amount * 1_000_000)), blockHash, bet.txHash);
        }
    }, 60000);

    setInterval(async () => {
        const pendingBets = await prisma.bet.findMany({ where: { status: "pending", game: 3, type: 2 } });
        const block = await tronWeb.trx.getCurrentBlock();
        const blockHash = block.blockID.slice(-8);
        for (const bet of pendingBets) {
            await processBet(bet.id, bet.token, bet.player, new BigNumber(Math.floor(bet.amount * 1_000_000)), blockHash, bet.txHash);
        }
    }, 180000);

}

export const betNuiNuiInstant = async (from: string, amount: number, currency: string) => {

    const block = await tronWeb.trx.getCurrentBlock();
    const amountBase = new BigNumber(Math.floor(amount * 1_000_000));

    const last5str = last5(block.blockID);
    const { banker, player, bankerTrip, playerTrip } = compute(last5str);
    const res = calcSettlement(amountBase, banker, player);

    console.log(
        `\nTX ${""}\nAsset: ${currency}\nFrom: ${from}\nBet: ${fmt(amountBase, 6)} ${currency}` +
        `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}` +
        `\nResult=${res.type} -> payout=${fmt(res.net, 6)} ${currency} (fee=${fmt(res.fee, 6)})`
    );

    if (res.type == "player") {
        await prisma.payout.create({ data: { to: from, status: 'pending', currency: currency, amount: Number(fmt(res.net, 6)) } });
        console.log(`[PAID] ${fmt(res.net, 6)} base units of ${currency} to ${from}`);
    }

    await prisma.bet.create({
        data: {
            player: from,
            token: currency,
            amount: Number(fmt(amountBase, 6)),
            payout: res.type == "player" ? Number(fmt(res.net, 6)) : 0,
            blockNum: block.block_header.raw_data.number,
            status: res.type == "player" ? "win" : "lose",
            game: 3,
            direction: "",
            result: `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}`,
            type: 3
        },
    });


}

export const BetNuiNui = async (userId: number, amount: number, currency: string) => {

    const fromBalance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: currency } },
    });

    if (!fromBalance || Number(fromBalance.amount) < amount) {
        throw new Error('Insufficient balance');
    }

    const block = await tronWeb.trx.getCurrentBlock();

    const amountBase = new BigNumber(Math.floor(amount * 1_000_000));

    const last5str = last5(block.blockID);
    const { banker, player, bankerTrip, playerTrip } = compute(last5str);
    const res = calcSettlement(amountBase, banker, player);

    console.log(
        `\nTX ${""}\nAsset: ${currency}\nFrom: ${userId}\nBet: ${fmt(amountBase, 6)} ${currency}` +
        `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}` +
        `\nResult=${res.type} -> payout=${fmt(res.net, 6)} ${currency} (fee=${fmt(res.fee, 6)})`
    );

    if (res.type == "player") {
        await prisma.payout.create({ data: { status: 'pending', currency: currency, amount: Number(fmt(res.net, 6)), userId: userId } });
        console.log(`[PAID] ${fmt(res.net, 6)} base units of ${currency} to ${userId}`);
    }else{
        await minusBalance(userId, amount, currency);
    }

    await prisma.bet.create({
        data: {
            player: '',
            token: currency,
            amount: Number(fmt(amountBase, 6)),
            payout: res.type == "player" ? Number(fmt(res.net, 6)) : 0,
            blockNum: block.block_header.raw_data.number,
            status: res.type == "player" ? "win" : "lose",
            game: 3,
            direction: "",
            result: `\nLast5=${last5str} | Banker(${bankerTrip})=Niu${banker}, Player(${playerTrip})=Niu${player}`,
            userId: userId,
            type: 3
        },
    });


}