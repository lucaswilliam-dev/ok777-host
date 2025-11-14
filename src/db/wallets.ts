import { Wallet as EthWallet } from 'ethers';
import { encryptPrivateKey, decryptPrivateKey } from "../utils/bcrypt";
import axios from 'axios';
import 'dotenv/config';
import prisma from "./prisma";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
// Avoid importing blockchain modules at startup; require when needed
import { convert } from '../utils/exchange';


export const createWallet = async (userId: number) => {

  let tronAddress: string | null = null;
  let tronEncryptedPK: string | null = null;
  if (process.env.TRON_FULLNODE && /^https?:\/\//.test(process.env.TRON_FULLNODE)) {
    const tr = require('tronweb');
    const tronWeb = new tr.TronWeb({ fullHost: process.env.TRON_FULLNODE });
    const tronAccount = await tronWeb.createAccount();
    tronAddress = tronAccount.address.base58;
    tronEncryptedPK = encryptPrivateKey(tronAccount.privateKey);
  }

  const ethWallet = EthWallet.createRandom();
  const bnbWallet = EthWallet.createRandom();

  const keypair = Keypair.generate();

  await prisma.wallet.createMany({
    data: [
      {
        userId: userId,
        blockchain: 'Solana',
        network: 'mainnet',
        publicKey: keypair.publicKey.toBase58(),
        privateKey: encryptPrivateKey(bs58.encode(Buffer.from(keypair.secretKey))),
      },
      ...(tronAddress && tronEncryptedPK ? [{
        userId: userId,
        blockchain: 'Tron',
        network: 'mainnet',
        publicKey: tronAddress,
        privateKey: tronEncryptedPK,
      }] : []),
      {
        userId: userId,
        blockchain: 'Ethereum',
        network: 'mainnet',
        publicKey: ethWallet.address,
        privateKey: encryptPrivateKey(ethWallet.privateKey),
      },
      {
        userId: userId,
        blockchain: 'BNB',
        network: 'mainnet',
        publicKey: bnbWallet.address,
        privateKey: encryptPrivateKey(bnbWallet.privateKey),
      }
    ]
  });

  const supportedAssets = [
    { asset: "USD" },
    { asset: "USDT" },
    { asset: "ETH" },
    { asset: "TRX" },
    { asset: "SOL" },
    { asset: "USDC" },
    { asset: "BNB" }
  ];
  await prisma.balance.createMany({
    data: supportedAssets.map(asset => ({
      userId: userId,
      currency: asset.asset,
      amount: 0
    }) as any),
  });

}

export const getWalletInfo = async (userId: number) => {

  const balances = await prisma.balance.findMany({
    where: { userId: userId }
  });

  const addresses = await prisma.wallet.findMany({
    where: { userId: userId },
    select: {
      blockchain: true,
      publicKey: true
    }
  });

  return { balances, addresses }

}

export const getBalance = async (userId: number, currency: string) => {

  const balance = await prisma.balance.findFirst({
    where: { userId, currency }
  });

  return balance;

}

export const getAllWallets = async (blockchain: string) => {

  const wallets = await prisma.wallet.findMany({ where: { blockchain: blockchain } });
  return wallets;
}

export const getPkTron = async (address: string) => {

  const wallet = await prisma.wallet.findFirst({
    where: { publicKey: address, blockchain: "Tron" }
  });

  return decryptPrivateKey(wallet.privateKey);

}

export const saveTransaction = async (userId: number, address: string, amount: number, currency: string, txId: string, type: string) => {

  await prisma.transaction.create({
    data: {
      userId: userId,
      address: address,
      currency: currency,
      amount: amount,
      txId,
      type
    },
  });

}

export const getTransactions = async (userId: null, currency: string) => {

  const transactions = await prisma.transaction.findMany({
    where: { userId: userId, currency: currency }
  });

  return transactions;

}

export const topBalance = async (userId: number, amount: number, currency: string) => {

  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum < 0) {
    throw new Error('Invalid amount for top up');
  }

  const existingBalance = await prisma.balance.findFirst({
    where: { userId, currency },
  });

  if (existingBalance) {
    const currentAmount = Number((existingBalance as any).amount);
    if (!isFinite(currentAmount)) {
      throw new Error('Invalid current balance');
    }
    const newAmount = currentAmount + amountNum;
    await prisma.balance.updateMany({
      where: { userId, currency },
      data: { amount: newAmount },
    });
  } else {
    await prisma.balance.create({
      data: { userId, currency, amount: amountNum },
    });
  }

}

export const minusBalance = async (userId: number, amount: number, currency: string) => {

  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum < 0) {
    throw new Error('Invalid amount for deduction');
  }

  const existingBalance = await prisma.balance.findFirst({
    where: { userId, currency },
  });

  if (existingBalance) {
    const currentAmount = Number((existingBalance as any).amount);
    if (!isFinite(currentAmount)) {
      throw new Error('Invalid current balance');
    }
    const newAmount = currentAmount - amountNum;
    if (newAmount < 0) {
      throw new Error('Insufficient balance for deduction');
    }
    await prisma.balance.updateMany({
      where: { userId, currency },
      data: { amount: newAmount },
    });
  } else {
    throw new Error('Balance record not found');
  }

}

export const getWallet = async (userId: number, blockchain: string) => {

  const wallet = await prisma.wallet.findFirst({
    where: { userId, blockchain }
  });

  return wallet;
}

export const exchangeBalance = async (userId: number, fromCurrency: string, toCurrency: string, amount: number) => {

  if (fromCurrency === toCurrency) {
    throw new Error("Cannot exchange same currency");
  }

  const convertedAmount = await convert(amount, fromCurrency, toCurrency);

  const fromBalance = await prisma.balance.findFirst({
    where: { userId, currency: fromCurrency },
  });

  const currentAmount = fromBalance ? Number((fromBalance as any).amount) : NaN;
  if (!fromBalance || !isFinite(currentAmount) || currentAmount < amount) {
    throw new Error('Insufficient balance');
  }

  // Validate amounts
  const amountNum = Number(amount);
  const convertedAmountNum = Number(convertedAmount);

  if (!isFinite(amountNum) || amountNum < 0) {
    throw new Error('Invalid amount for exchange');
  }

  console.log("convertedAmountNum==>", convertedAmountNum, "amountNum==>", amountNum, fromBalance);

  if (!isFinite(convertedAmountNum) || convertedAmountNum < 0) {
    throw new Error('Invalid converted amount');
  }

  // Get current balance and subtract
  const fromBalanceRecord = await prisma.balance.findFirst({
    where: { userId, currency: fromCurrency },
  });
  if (fromBalanceRecord) {
    const currentAmount = Number((fromBalanceRecord as any).amount);
    if (!isFinite(currentAmount)) {
      throw new Error('Invalid current balance');
    }
    const newFromAmount = currentAmount - amountNum;
    if (newFromAmount < 0) {
      throw new Error('Insufficient balance for exchange');
    }
    await prisma.balance.updateMany({
      where: { userId, currency: fromCurrency },
      data: { amount: newFromAmount },
    });
  }

  // Get current balance and add
  const toBalanceRecord = await prisma.balance.findFirst({
    where: { userId, currency: toCurrency },
  });
  if (toBalanceRecord) {
    const currentAmount = Number((toBalanceRecord as any).amount);
    if (!isFinite(currentAmount)) {
      throw new Error('Invalid current balance');
    }
    const newToAmount = currentAmount + convertedAmountNum;
    await prisma.balance.updateMany({
      where: { userId, currency: toCurrency },
      data: { amount: newToAmount },
    });
  } else {
    // Create new balance record if it doesn't exist
    await prisma.balance.create({
      data: { userId, currency: toCurrency, amount: convertedAmountNum },
    });
  }

  await prisma.transaction.createMany({
    data: [
      {
        userId: userId,
        address: '-',
        currency: fromCurrency,
        amount: -amount,
        txId: "",
        type: "swap"
      },
      {
        userId: userId,
        address: '-',
        currency: toCurrency,
        amount: convertedAmount,
        txId: "",
        type: "swap"
      }
    ]
  });

}

export async function getUserBets(userId: number, limit = 10, offset = 0) {
  return prisma.bet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });
}

export async function withdrawRequest(userId: number, to: string, currency: string, blockchain: string, amount: number, withdrawalPassword?: string) {

  // SECURITY FIX: Validate withdrawal password
  if (!withdrawalPassword) {
    throw new Error('Withdrawal password is required for security');
  }

  // Get user to verify withdrawal password
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.withdrawal_password) {
    throw new Error('Withdrawal password not set. Please set a withdrawal password first.');
  }

  // Verify withdrawal password
  const bcrypt = require('bcrypt');
  const isWithdrawalPasswordValid = await bcrypt.compare(withdrawalPassword, user.withdrawal_password);
  if (!isWithdrawalPasswordValid) {
    throw new Error('Incorrect withdrawal password');
  }

  // Validate amount
  const amountNum = Number(amount);
  console.log(`Amount validation: amount=${amount}, amountNum=${amountNum}, isFinite=${isFinite(amountNum)}, >0=${amountNum > 0}`);
  if (!isFinite(amountNum) || amountNum <= 0) {
    console.error(`Amount validation failed: amount=${amount}, amountNum=${amountNum}`);
    throw new Error('Invalid withdraw amount');
  }

  // Convert crypto amount to USD equivalent for balance check
  const { convert } = require('../utils/exchange');
  let amountUsd;

  try {
    amountUsd = await convert(amountNum, currency, "USD");
    console.log(`Currency conversion: ${amountNum} ${currency} = ${amountUsd} USD`);
  } catch (error) {
    console.error('Currency conversion error:', error);
    throw new Error('Invalid currency conversion');
  }

  if (!isFinite(amountUsd) || amountUsd <= 0) {
    console.error(`Invalid conversion result: amountNum=${amountNum}, currency=${currency}, amountUsd=${amountUsd}`);
    throw new Error('Invalid currency conversion');
  }

  const fromBalance = await prisma.balance.findFirst({
    where: { userId, currency: "USD" },
  });

  const currentAmount = fromBalance ? Number((fromBalance as any).amount) : NaN;
  if (!fromBalance || !isFinite(currentAmount) || currentAmount < amountUsd) {
    throw new Error('Insufficient balance');
  }

  // For large amounts (>$200 USD), create pending request
  if (amountUsd > 200) {

    await prisma.withdrawRequest.create({
      data: {
        userId,
        currency,
        blockchain,
        to,
        amount: amountUsd,
        status: "pending"
      }
    });

    await minusBalance(userId, amountUsd, "USD");

  } else {
    // For small amounts, process immediately
    if (blockchain == "Tron") {
      const { withdrawTrx, withdrawTokenTron } = require("../blockchain/tron");
      if (currency == "TRX") {
        await withdrawTrx(userId, to, amountNum);
      } else if (currency == "USDT") {
        await withdrawTokenTron(userId, to, amountNum);
      }
    } else if (blockchain == "Ethereum") {
      const { withdrawERC20, withdrawEth } = require("../blockchain/ether");
      if (currency == "ETH") {
        await withdrawEth(userId, to, amountNum);
      } else if (currency == "USDT") {
        await withdrawERC20(userId, to, amountNum);
      }
    } else if (blockchain == "Solana") {
      const { withdrawSol, withdrawUsdc, canWithdrawSol, canWithdrawUsdc } = require("../blockchain/solana");

      // Check if withdrawal is possible before processing
      if (currency == "SOL") {
        const canWithdraw = await canWithdrawSol(amountNum);
        if (!canWithdraw.canWithdraw) {
          throw new Error(canWithdraw.reason || 'Cannot withdraw SOL at this time');
        }
        await withdrawSol(userId, to, amountNum);
      } else if (currency == "USDC") {
        const canWithdraw = await canWithdrawUsdc(amountNum);
        if (!canWithdraw.canWithdraw) {
          throw new Error(canWithdraw.reason || 'Cannot withdraw USDC at this time');
        }
        await withdrawUsdc(userId, to, amountNum);
      }
    }

    await minusBalance(userId, amountUsd, "USD");
  }

}
