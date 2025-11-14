import * as tr from 'tronweb';
import BigNumber from 'bignumber.js';
import {
    getAllWallets,
    saveTransaction,
    topBalance,
    minusBalance,
    getBalance
} from '../db/wallets';
import { decryptPrivateKey } from '../utils/bcrypt';
import { convert } from '../utils/exchange';
import 'dotenv/config';


let tronWebInstance: any | null = null;
function getTronWeb() {
    const url = process.env.TRON_FULLNODE;
    if (!url || !/^https?:\/\//.test(url)) {
        throw new Error('TRON_FULLNODE is not configured as a valid http(s) URL');
    }
    if (!tronWebInstance) {
        tronWebInstance = new tr.TronWeb({ fullHost: url });
    }
    return tronWebInstance;
}
const MAIN_POOL_ADDRESS = process.env.TRON_MAIN_POOL_ADDRESS;
const MAIN_POOL_PK = process.env.TRON_MAIN_POOL_PK;
const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT;
const MIN_SWEEP_USDT = 10;
const GAS_AMOUNT = 2_000_000;

let lastBlockNumber = 0;
let wallets = [];

setInterval(async () => {
    wallets = await getAllWallets("Tron");
}, 10000);


const pollBlocks = async () => {

    const tronWeb = getTronWeb();
    const currentBlock = await tronWeb.trx.getCurrentBlock();
    const currentBlockNumber = currentBlock.block_header.raw_data.number;

    if (!lastBlockNumber) lastBlockNumber = currentBlockNumber - 1;

    for (let bn = lastBlockNumber + 1; bn <= currentBlockNumber; bn++) {
        const block = await tronWeb.trx.getBlock(bn);
        if (!block.transactions) continue;

        for (const tx of block.transactions) {
            for (const c of tx.raw_data.contract) {
                if (c.type === 'TransferContract') {
                    const data = c.parameter.value;
                    const to = tronWeb.address.fromHex(data['to_address']);
                    const amount = new BigNumber(data['amount']).div(1e6); // TRX has 6 decimals

                    const addr = wallets.find(a => a.publicKey === to);
                    if (addr && amount.gt(0)) {
                        const incomingTxId = tx.txID;
                        console.log(`💰 TRX deposit: ${amount.toString()} TRX to user ${addr.userId}`);
                        if (amount.toNumber() > 5) {
                            transferToMain(addr, amount, incomingTxId);
                        }
                    }
                }
            }
        }
    }

    lastBlockNumber = currentBlockNumber;

}

const transferToMain = async (wallet: any, amount: BigNumber, txId: string) => {

    try {

        const pkFrom = await decryptPrivateKey(wallet.privateKey);
        const tronWebIns = new tr.TronWeb({ fullHost: process.env.TRON_FULLNODE });
        tronWebIns.setPrivateKey(pkFrom);

        const feeBuffer = new BigNumber(0.1);

        const amountToSend = amount.minus(feeBuffer);

        const amountSun = new BigNumber(amountToSend).multipliedBy(1e6).toNumber();
        const tx = await tronWebIns.trx.sendTransaction(MAIN_POOL_ADDRESS, amountSun);
        const amountUSD = await convert(amount, "TRX", "USDT");
        await saveTransaction(wallet.userId, wallet.publicKey, amountToSend.toNumber(), "TRX", txId, "deposit");
        await topBalance(wallet.userId, amountUSD, "USD");

        console.log(`✅ TRX swept: ${amountToSend} TRX to main pool | User ${wallet.userId} | TX: ${tx.txid}`);

    } catch (err) {
        console.log(err);
    }

}


const waitForConfirmation = async (txId: string, timeout = 60000) => {
    const tronWeb = getTronWeb();
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const receipt = await tronWeb.trx.getTransactionInfo(txId);
        if (receipt && receipt.receipt) return receipt;
        await new Promise(r => setTimeout(r, 3000));
    }
    throw new Error(`Tx ${txId} not confirmed within timeout`);
};

export const maybeSweepUserDeposit = async (
    depositAddr: string,
    depositPk: string,
    incomingTxId: string,
    userId: number,
    balanceRaw: any,
	) => {

	const tw = getTronWeb();
	const balance = parseFloat(tw.toBigNumber(balanceRaw).div(1e6).toString());

    if (balance < MIN_SWEEP_USDT) {
        return;
    }

	// check TRX balance for fees
	const trxBalance = await tw.trx.getBalance(depositAddr);
    if (trxBalance < GAS_AMOUNT) {
	const tronWebIns = getTronWeb();
        tronWebIns.setPrivateKey(MAIN_POOL_PK);
        const { txid } = await tronWebIns.trx.sendTransaction(depositAddr, GAS_AMOUNT,);
        await waitForConfirmation(txid);
    }

    const tronWebIns = getTronWeb();
    tronWebIns.setPrivateKey(decryptPrivateKey(depositPk));
    const contract2 = await tronWebIns.contract().at(USDT_CONTRACT);
    const txId = await contract2.transfer(MAIN_POOL_ADDRESS, balanceRaw).send({
        feeLimit: 100_000_000,  // energy limit
        callValue: 0,           // TRX amount to send (0 for tokens)
        shouldPollResponse: true
    });

	const amountToSend = tw.toBigNumber(balanceRaw).div(1e6);

    await saveTransaction(userId, depositAddr, amountToSend.toNumber(), "USDT", incomingTxId, "deposit");
    await topBalance(userId, amountToSend.toNumber(), "USD");

    console.log(`💰 USDT deposit: ${balance} USDT swept to main pool | User ${userId} | TX: ${txId}`)

    return txId;
};


const checkBalances = async () => {
    try {
        if (!USDT_CONTRACT) {
            console.error('❌ TRON_USDT_CONTRACT not configured in .env file');
            return;
        }

        if (wallets.length === 0) {
            // No wallets to check yet
            setTimeout(checkBalances, 60 * 1000);
            return;
        }

        const tronWebIns = getTronWeb();

        // Method 1: Using TronWeb contract (try-catch for each wallet)
        for (const wallet of wallets) {
            const addr = wallet.publicKey;

            try {
                // Call contract using triggerSmartContract for more reliable results
                const parameter = [{ type: 'address', value: addr }];
                const options = {};
                
                const transaction = await tronWebIns.transactionBuilder.triggerSmartContract(
                    USDT_CONTRACT,
                    'balanceOf(address)',
                    options,
                    parameter
                );

                if (!transaction || !transaction.constant_result || !transaction.constant_result[0]) {
                    continue;
                }

                // Decode the result (it's a hex string)
                const balanceHex = transaction.constant_result[0];
                const balanceRaw = tronWebIns.toBigNumber(balanceHex);
                const balance = new BigNumber(balanceRaw.toString()).div(1e6);

                if (balance.gte(MIN_SWEEP_USDT)) {
                    console.log(`💰 Found ${balance.toString()} USDT for user ${wallet.userId}`);
                    try {
                        await maybeSweepUserDeposit(wallet.publicKey, wallet.privateKey, '-', wallet.userId, balanceRaw.toString());
                    } catch (err) {
                        console.error(`❌ USDT sweep failed for user ${wallet.userId}:`, err.message);
                    }
                }
            } catch (err) {
                // Skip this wallet and continue with others
                console.error(`Error checking balance for ${addr}:`, err.message);
                continue;
            }
        }
    } catch (err) {
        console.error('Error in checkBalances:', err);
    }

    setTimeout(checkBalances, 60 * 1000);
};


export const startObserverTron = () => {
    checkBalances();
    setInterval(pollBlocks, 3000);
}

export const withdrawTokenTron = async (userId: number, to: string, amount: number) => {

    const tronWebIns = getTronWeb();
    tronWebIns.setPrivateKey(MAIN_POOL_PK);

    const contract = await tronWebIns.contract().at(USDT_CONTRACT);

    const rawAmount = new BigNumber(amount).times(1e6).toFixed(0);

    const txId = await contract.transfer(to, rawAmount).send({
        feeLimit: 100_000_000,
        callValue: 0,
        shouldPollResponse: true
    });

    await saveTransaction(userId, to, -amount, "USDT", '-', "withdraw")

    console.log(`💸 USDT withdrawal: ${amount} USDT to ${to} | User ${userId} | TX: ${txId}`);
    return txId;

};

export const withdrawTrx = async (userId: number, to: string, amount: number) => {


    const tronWebIns = getTronWeb();
    tronWebIns.setPrivateKey(MAIN_POOL_PK);

    const rawAmount = new BigNumber(parseInt(amount.toString())).times(1e6);

    const tx = await tronWebIns.trx.sendTransaction(to, rawAmount.toNumber());

    if (!tx?.txid) throw new Error('Tx failed or not broadcasted');

    await saveTransaction(userId, to, -amount, "TRX", tx.txid, "withdraw")

    console.log(`💸 TRX withdrawal: ${amount} TRX to ${to} | User ${userId} | TX: ${tx.txid}`);

};


export const withdrawTrxOnchain = async (to: string, amount: number) => {

    const tronWebIns = new tr.TronWeb({ fullHost: process.env.TRON_FULLNODE });
    tronWebIns.setPrivateKey(MAIN_POOL_PK);

    const rawAmount = new BigNumber(amount).times(1e6);

    console.log(`🚀 Withdrawing ${amount} TRX to ${to}`);

    const tx = await tronWebIns.trx.sendTransaction(to, rawAmount.toNumber());

    if (!tx?.txid) throw new Error('Tx failed or not broadcasted');

    console.log(`✅ Tx confirmed: ${tx.txid}`);

};

export const withdrawTokenTronOnchain = async (to: string, amount: number) => {

    const tronWebIns = new tr.TronWeb({ fullHost: process.env.TRON_FULLNODE });
    tronWebIns.setPrivateKey(MAIN_POOL_PK);

    const contract = await tronWebIns.contract().at(USDT_CONTRACT);

    const rawAmount = new BigNumber(amount).times(1e6).toFixed(0);

    console.log(`🚀 Withdrawing ${amount} USDT from main pool -> ${to}`);

    const txId = await contract.transfer(to, rawAmount).send({
        feeLimit: 100_000_000,
        callValue: 0,
        shouldPollResponse: true
    });

    console.log(`✅ Withdrawal successful | TxID: ${txId}`);
    
    return txId;

};