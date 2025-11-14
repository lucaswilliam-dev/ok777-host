import * as tr from 'tronweb';
import * as bigSmallGame from "./bigSmall";
import * as luckyGame from "./lucky";
import * as niuniuGame from "./niuniu";
import * as bankerPlayer from "./bankerPlayer";
import * as oddEvenGame from "./oddEven";
import { io } from "../app";
import prisma from "../db/prisma";
import 'dotenv/config';


const tronWeb = new tr.TronWeb({
    fullHost: process.env.TRON_FULLNODE || "https://nile.trongrid.io"
});

const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT!;
const GAME_WALLETS = [];

let GAME_TYPE_INSTANT = null;
let GAME_TYPE_1_MINUTE = null;
let GAME_TYPE_3_MINUTE = null;
let GAME_SETTINGS = null;

const processTRX = (to: string, from: string, amount: number, blockNum: number, token: string, txHash: string) => {

    io.emit("newBet", { to, from, amount, token });

    const limits = token === "TRX" ? { min: GAME_SETTINGS.trxMin, max: GAME_SETTINGS.trxMax } : { min: GAME_SETTINGS.usdtMin, max: GAME_SETTINGS.usdtMax };
    if (amount < limits.min) {
        console.log(`⚠️ Bet too small, deducted: ${amount} ${token}`);
        return;
    }
    if (amount > limits.max) {
        console.log(`❌ Bet invalid, above limit: ${amount} ${token}`);
        return;
    }

    // 1 minute
    if (to == GAME_TYPE_1_MINUTE.bigSmallHouseAddress) {
        bigSmallGame.placeBet(from, amount, token, blockNum, null, 1);
    }
    else if (to == GAME_TYPE_1_MINUTE.luckyHouseAddress) {
        luckyGame.setBet(from, amount, blockNum, 1, token);
    }
    else if (to == GAME_TYPE_1_MINUTE.niuNiuHouseAddress) {
        niuniuGame.setBet(from, amount, blockNum, 1, token, txHash);
    }
    else if (to == GAME_TYPE_1_MINUTE.bankerPlayerHouseAddress) {
        bankerPlayer.setBet(from, amount, blockNum, 1, token, txHash);
    }
    else if (to == GAME_TYPE_1_MINUTE.oddEvenHouseAddress) {
        oddEvenGame.placeBet(from, amount, token, blockNum, null, 1);
    }
    // 3 minute
    else if (to == GAME_TYPE_3_MINUTE.bigSmallHouseAddress) {
        bigSmallGame.placeBet(from, amount, token, blockNum, null, 2);
    }
    else if (to == GAME_TYPE_3_MINUTE.luckyHouseAddress) {
        luckyGame.setBet(from, amount, blockNum, 2, token);
    }
    else if (to == GAME_TYPE_3_MINUTE.niuNiuHouseAddress) {
        niuniuGame.setBet(from, amount, blockNum, 2, token, txHash);
    }
    else if (to == GAME_TYPE_3_MINUTE.bankerPlayerHouseAddress) {
        bankerPlayer.setBet(from, amount, blockNum, 2, token, txHash);
    }
    else if (to == GAME_TYPE_3_MINUTE.oddEvenHouseAddress) {
        oddEvenGame.placeBet(from, amount, token, blockNum, null, 2);
    }
    // instant
    else if (to == GAME_TYPE_INSTANT.bigSmallHouseAddress) {
        bigSmallGame.placeBetInstant(from, amount, token, blockNum, null, 3);
    }
    else if (to == GAME_TYPE_INSTANT.luckyHouseAddress) {
        luckyGame.betLuckyInstant(from, amount, token);
    }
    else if (to == GAME_TYPE_INSTANT.niuNiuHouseAddress) {
        niuniuGame.betNuiNuiInstant(from, amount, token);
    }
    else if (to == GAME_TYPE_INSTANT.bankerPlayerHouseAddress) {
        bankerPlayer.betBankerPlayerInstant(from, amount, token);
    }
    else if (to == GAME_TYPE_INSTANT.oddEvenHouseAddress) {
        oddEvenGame.betOddEvenInstant(from, amount, token);
    }

}

const listenTransactions = async () => {

    let lastBlockNum = 0;

    while (true) {
        try {
            const block = await tronWeb.trx.getCurrentBlock();
            const blockNum = block.block_header.raw_data.number;

            if (blockNum <= lastBlockNum) {
                await new Promise((r) => setTimeout(r, 2000));
                continue;
            }

            lastBlockNum = blockNum;

            const transactions = block.transactions || [];

            for (const tx of transactions) {
                if (!tx.raw_data?.contract?.length) continue;

                for (const c of tx.raw_data.contract) {
                    const { type, parameter } = c;

                    // ---------------- TRX ----------------
                    if (type === "TransferContract") {
                        const val = parameter.value as {
                            owner_address: string;
                            to_address: string;
                            amount: number;
                        };

                        const to = tronWeb.address.fromHex(val.to_address);
                        const from = tronWeb.address.fromHex(val.owner_address);
                        const amount = val.amount / 1e6;

                        if (GAME_WALLETS.includes(to)) {
                            processTRX(to, from, amount, blockNum, "TRX", tx.txID);
                        }
                    }

                    // ---------------- USDT ----------------
                    if (type === "TriggerSmartContract") {
                        const val = parameter.value as {
                            owner_address: string;
                            contract_address: string;
                            data: string;
                        };

                        const contract = tronWeb.address.fromHex(val.contract_address);
                        if (contract === USDT_CONTRACT) {

                            try {

                                let rawData = val.data;

                                if (rawData.startsWith("0x")) rawData = rawData.slice(2);

                                // Remove method ID (first 4 bytes = 8 hex chars)
                                let paramsHex = rawData.slice(8);

                                // Pad to multiple of 64 characters
                                const padded = paramsHex.padStart(Math.ceil(paramsHex.length / 64) * 64, "0");


                                const decoded = tronWeb.utils.abi.decodeParams(
                                    ["_to", "_value"],
                                    ["address", "uint256"],
                                    "0x" + padded,
                                    true // ignore method ID
                                );


                                const to = tronWeb.address.fromHex(decoded._to as string);
                                const rawAmount = BigInt(decoded._value.toString());
                                const amount = Number(rawAmount) / 1e6;
                                const from = tronWeb.address.fromHex(val.owner_address);

                                if (GAME_WALLETS.includes(to)) {
                                    processTRX(to, from, amount, blockNum, "USDT", tx.txID);
                                }
                            }
                            catch (err) {
                                console.log("Decode error");
                            }

                        }
                    }
                }
            }

        } catch (err) {
            console.error("Transaction listener error:", err);
        }

        await new Promise((r) => setTimeout(r, 2000));
    }
}

export const startGames = async () => {

    GAME_SETTINGS = await prisma.gameSettings.findUnique({
        where: { id: 1 },
    });
    
    const configs = await prisma.hashGameConfig.findMany();

    configs.forEach((config: any) => {

        GAME_WALLETS.push(config.bigSmallHouseAddress);
        GAME_WALLETS.push(config.luckyHouseAddress);
        GAME_WALLETS.push(config.niuNiuHouseAddress);
        GAME_WALLETS.push(config.bankerPlayerHouseAddress);
        GAME_WALLETS.push(config.oddEvenHouseAddress);

        if (config.type == 'instant') {
            GAME_TYPE_INSTANT = config;
        } else if (config.type == '1minute') {
            GAME_TYPE_1_MINUTE = config;
        } else if (config.type == '3minutes') {
            GAME_TYPE_3_MINUTE = config;
        }

    });

    bigSmallGame.startBigSmall();
    luckyGame.startLuckyGame();
    niuniuGame.startNiuNiu();
    bankerPlayer.starBankerPlayer();
    oddEvenGame.startOddEven();
    listenTransactions();

}