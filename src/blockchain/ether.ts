import { ethers } from "ethers";
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

const MAIN_POOL_ADDRESS = process.env.ETH_MAIN_POOL_ADDRESS;
const MAIN_POOL_PK = process.env.ETH_MAIN_POOL_PK;
const MIN_ETH_BALANCE = 0.0002;
let wallets = [];

const ERC20_ADDRESS = process.env.ETH_USDT_CONTRACT;

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

setInterval(async () => {
    wallets = await getAllWallets("Ethereum");
}, 10000);

const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC);

const ensureGasFee = async (walletAddr: string) => {

    const signer = new ethers.Wallet(MAIN_POOL_PK, provider);

    const balance = await provider.getBalance(walletAddr);
    if (balance >= MIN_ETH_BALANCE) {
        console.log(`✅ ${walletAddr} has enough ETH for gas`);
        return;
    }

    console.log(`⚠️ ${walletAddr} has low ETH (${ethers.formatEther(balance)}). Funding...`);

    const tx = await signer.sendTransaction({
        to: walletAddr,
        value: ethers.parseEther("0.0002"), // top-up a bit more than min
    });

    console.log(`📤 Sent gas fee from main pool: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Gas fee confirmed for ${walletAddr}`);
}

const checkErc20 = async () => {

    const token = new ethers.Contract(ERC20_ADDRESS, ERC20_ABI, provider);

    for (const w of wallets) {
        try {
            const signer = new ethers.Wallet(decryptPrivateKey(w.privateKey), provider);
            const tokenWithSigner = token.connect(signer);

            // Get token balance
            const balance = await token.balanceOf(w.publicKey);

            if (balance === BigInt(0)) {
                continue;
            }

            const balanceEth = ethers.formatUnits(balance, 6);

            if (Number(balanceEth) < 10) {
                console.log(`Wallet ${w.publicKey} to low balance`);
                continue;
            }

            console.log(
                `Wallet ${w.publicKey} has ${balanceEth} tokens`
            ); // USDT has 6 decimals

            await ensureGasFee(w.publicKey);


            // Send all tokens
            const tx = await (tokenWithSigner as any).transfer(MAIN_POOL_ADDRESS, balance);

            console.log(
                `📤 Sweeping ${ethers.formatUnits(balance, 6)} tokens from ${w.publicKey}`
            );
            console.log("TX Hash:", tx.hash);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
            await topBalance(w.userId, Number(balanceEth), "USD");
            await saveTransaction(w.userId, w.publicKey, Number(balanceEth), "USDT", tx.hash, "deposit");
        } catch (err) {
            console.error(`❌ Error sweeping wallet ${w.publicKey}:`, err);
        }
    }

    setTimeout(checkEth, 10000);
}

const checkEth = async () => {

    for (const w of wallets) {
        try {

            const signer = new ethers.Wallet(decryptPrivateKey(w.privateKey), provider);

            const balanceWei = await provider.getBalance(w.publicKey);
            const balanceEth = ethers.formatEther(balanceWei);

            if (balanceWei === BigInt(0)) {
                continue;
            }

            if (Number(balanceEth) < 0.01) {
                console.log(`Wallet ${w.publicKey} has too low`);
                continue;
            }

            const estimatedGas = await provider.estimateGas({
                from: signer.address,
                to: MAIN_POOL_ADDRESS,
                value: balanceWei - BigInt(21_000),
            }).catch(() => BigInt(21_000));

            // Gas price
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            const fee = estimatedGas * gasPrice;

            if (balanceWei <= fee) {
                console.log(`Wallet ${w.publicKey} has not enough for gas`);
                continue;
            }

            const amountToSend = balanceWei - fee;

            const tx = await signer.sendTransaction({
                to: MAIN_POOL_ADDRESS,
                value: amountToSend,
                gasLimit: estimatedGas,
                gasPrice,
            });

            await tx.wait();

            console.log(`Sent ${ethers.formatEther(amountToSend)} ETH from ${w.publicKey} → ${MAIN_POOL_ADDRESS}`);
            console.log(`TX Hash: ${tx.hash}`);
            const amountUSD = await convert(balanceEth, "ETH", "USDT");
            await topBalance(w.userId, amountUSD, "USD");
            await saveTransaction(w.userId, w.publicKey, Number(balanceEth), "ETH", tx.hash, "deposit");

        } catch (err) {
            console.error(`Error sweeping wallet ${w.publicKey}:`, err);
        }
    }

    setTimeout(checkErc20, 10000);
}

export const watchEth = () => {
    checkErc20();
}

export const withdrawEth = async (userId: number, to: string, amountEth: number) => {


    const signer = new ethers.Wallet(MAIN_POOL_PK, provider);
    const amount = ethers.parseEther(amountEth.toString());

    const mainBalance = await provider.getBalance(signer.address);
    if (mainBalance < amount) {
        console.log("❌ Main pool has insufficient ETH");
        return;
    }

    const tx = await signer.sendTransaction({
        to,
        value: amount
    });

    console.log(`📤 Sent ${amountEth} ETH to ${to}. TX: ${tx.hash}`);

    const receipt = await tx.wait();
    await saveTransaction(userId, to, -amountEth, "ETH", tx.hash, "withdraw")
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

}

export const withdrawERC20 = async (userId: number, to: string, amountTokens: number) => {

    const token = new ethers.Contract(ERC20_ADDRESS, ERC20_ABI, provider);
    const mainPool = new ethers.Wallet(MAIN_POOL_PK, provider);
    const tokenWithSigner = token.connect(mainPool);

    const decimals = await token.decimals();
    const amount = ethers.parseUnits(amountTokens.toString(), decimals);

    const mainBalance = await token.balanceOf(mainPool.address);
    if (mainBalance < amount) {
        console.log("❌ Main pool has insufficient tokens");
        return;
    }

    const tx = await (tokenWithSigner as any).transfer(to, amount);
    console.log(`📤 Sent ${amountTokens} tokens to ${to}. TX: ${tx.hash}`);

    const receipt = await tx.wait();
    await saveTransaction(userId, to, -amountTokens, "USDT", tx.hash, "withdraw")
    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);

}

