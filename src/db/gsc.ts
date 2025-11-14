import prisma from "./prisma";

function isNumeric(num: any): boolean {
  return !isNaN(num)
}

export const getUserBalancesBulk = async (batchRequests: any[], currency: string) => {

  try {

    const cleanedCurrency = currency.replace(/2/g, '');
    const ratio = currency.includes('2');

    const accounts: number[] = []

    batchRequests.map(r => {
      if (isNumeric(r.member_account))
        accounts.push(parseInt(r.member_account))
    });

    // Fetch balances using Prisma
    if (accounts.length === 0) {
      return batchRequests.map(reqItem => ({
        member_account: reqItem.member_account,
        product_code: reqItem.product_code,
        balance: 0,
        code: 1000,
        message: "User not found",
      }));
    }

    // Use Prisma instead of Supabase
    const balances = await prisma.balance.findMany({
      where: {
        userId: { in: accounts },
        currency: cleanedCurrency
      },
      select: {
        userId: true,
        amount: true
      }
    });

    const balanceMap = new Map<number, number>();
    balances.forEach((row: any) => {
      // Prisma returns Decimal objects, convert to number
      const amountNum = typeof row.amount === 'object' && row.amount !== null
        ? Number(row.amount)
        : Number(row.amount || 0);
      balanceMap.set(row.userId, amountNum);
    });

    return batchRequests.map(reqItem => {
      const key = isNumeric(reqItem.member_account) ? parseInt(reqItem.member_account) : null;
      const raw = key != null && balanceMap.has(key) ? balanceMap.get(key)! : 0;
      const exists = key != null && balanceMap.has(key);

      if (!exists) {
        return {
          member_account: reqItem.member_account,
          product_code: reqItem.product_code,
          balance: 0,
          code: -2,
          message: "balance not found",
        };
      }

      return {
        member_account: reqItem.member_account,
        product_code: reqItem.product_code,
        balance: ratio ? raw / 1000 : raw,
        code: 0,
        message: "",
      };
    });
  } catch (err) {
    console.error("DB error in getUserBalancesBulk:", err);
    return batchRequests.map(reqItem => ({
      member_account: reqItem.member_account,
      product_code: reqItem.product_code,
      balance: 0,
      code: 1000,
      message: "Database error",
    }));
  }

}

export const saveWager = async (tx: any, userId: number, wagerData: any, currency: string | null = null) => {

  try {
    return tx.wager.upsert({
      where: { wagerCode: wagerData.wager_code },
      update: {
        userId,
        action: wagerData.action,
        wagerCode: wagerData.wager_code,
        wagerStatus: wagerData.wager_status,
        roundId: wagerData.round_id,
        channelCode: wagerData.channel_code || wagerData.Channel_code,
        wagerType: wagerData.wager_type,
        amount: wagerData.amount,
        betAmount: wagerData.bet_amount,
        validBetAmount: wagerData.valid_bet_amount,
        prizeAmount: wagerData.prize_amount,
        tipAmount: wagerData.tip_amount,
        settledAt: BigInt(wagerData.settled_at),
        gameCode: wagerData.game_code,
      },
      create: {
        id: wagerData.id,
        userId,
        action: wagerData.action,
        wagerCode: wagerData.wager_code,
        wagerStatus: wagerData.wager_status,
        roundId: wagerData.round_id,
        channelCode: wagerData.channel_code || wagerData.Channel_code,
        wagerType: wagerData.wager_type,
        amount: wagerData.amount,
        betAmount: wagerData.bet_amount,
        validBetAmount: wagerData.valid_bet_amount,
        prizeAmount: wagerData.prize_amount,
        tipAmount: wagerData.tip_amount,
        settledAt: BigInt(wagerData.settled_at),
        gameCode: wagerData.game_code,
      },
    });
    // return tx.wager.create({
    //   data: {
    //     id: wagerData.id,
    //     userId: userId,
    //     action: wagerData.action,
    //     wagerCode: wagerData.wager_code,
    //     wagerStatus: wagerData.wager_status,
    //     roundId: wagerData.round_id,
    //     channelCode: wagerData.channel_code || wagerData.Channel_code,
    //     wagerType: wagerData.wager_type,
    //     amount: wagerData.amount,
    //     betAmount: wagerData.bet_amount,
    //     validBetAmount: wagerData.valid_bet_amount,
    //     prizeAmount: wagerData.prize_amount,
    //     tipAmount: wagerData.tip_amount,
    //     settledAt: BigInt(wagerData.settled_at),
    //     gameCode: wagerData.game_code,
    //     currency: currency
    //   }
    // });
  } catch (err) {
    console.log(err)
  }

};

export const getBalance = async (userId: number, currency: string) => {
  const balance = await prisma.balance.findUnique({
    where: { userId_currency: { userId, currency } },
  });
  return balance;
};

export const decrementBalance = async (tx: any, userId: number, currency: string, amount: number) => {
  return tx.balance.update({
    where: { userId_currency: { userId, currency } },
    data: { amount: { decrement: amount } },
  });
};

export const findUserByAccount = async (memberAccount: number) => {
  return prisma.user.findUnique({
    where: { id: memberAccount },
  });
};

export const processWithdraw = async (memberAccount: string, currency: string, wagerData: any) => {

  const userId = parseInt(memberAccount);

  if (isNaN(userId)) throw new Error("Invalid userId");

  return prisma.$transaction(async (tx: any) => {
    const balance = await getBalance(userId, currency);
    if (!balance) throw new Error("Balance not found");

    if (wagerData.bet_amount > balance.amount) {
      return {
        memberAccount,
        beforeBalance: balance.amount.toNumber(),
        balance: balance.amount.toNumber(),
        code: 1001,
        message: "Insufficient Balance"
      }
    }

    const exists = await prisma.wager.findUnique({ where: { wagerCode: wagerData.wager_code } });

    if (exists) {
      return {
        memberAccount,
        beforeBalance: balance.amount.toNumber(),
        balance: balance.amount.toNumber(),
        code: 1003,
        message: "Duplicate Transaction"
      };
    }

    const updatedBalance = await decrementBalance(tx, userId, currency, wagerData.bet_amount);

    const wager = await saveWager(tx, userId, wagerData, currency);

    return {
      memberAccount,
      beforeBalance: balance.amount.toNumber(),
      balance: updatedBalance.amount.toNumber(),
      wager,
      code: 0
    };
  });
};

export const incrementBalance = async (tx: any, userId: number, currency: string, amount: number) => {
  return tx.balance.update({
    where: { userId_currency: { userId, currency } },
    data: { amount: { increment: amount } },
  });
};

export const processDeposit = async (memberAccount: string, currency: string, wagerData: any) => {


  const userId = parseInt(memberAccount);
  if (isNaN(userId)) throw new Error("Invalid userId");

  return prisma.$transaction(async (tx: any) => {
    const balance = await getBalance(userId, currency);
    if (!balance) throw new Error("Balance not found");

    const currentWager = await prisma.wager.findFirst({ where: { wagerCode: wagerData.wager_code, } });

    if (wagerData.action == "CANCEL" && !currentWager) {
      return {
        memberAccount,
        beforeBalance: balance.amount.toNumber(),
        balance: balance.amount.toNumber(),
        code: 1006,
        message: "Bet Not Exists"
      };
    } else if (currentWager && currentWager.action == wagerData.action) {
      return {
        memberAccount,
        beforeBalance: balance.amount.toNumber(),
        balance: balance.amount.toNumber(),
        code: 1003,
        message: "Duplicate Transaction"
      };
    }


    const beforeBalance = balance.amount;
    const updatedBalance = await incrementBalance(tx, userId, currency, wagerData.amount);
    const wager = await saveWager(tx, userId, wagerData, currency);

    return {
      memberAccount,
      beforeBalance: beforeBalance.toNumber(),
      balance: updatedBalance.amount.toNumber(),
      wager,
      code: 0,
      message: ""
    };
  });
};

export const updateWager = async (tx: any, userId: number, wager: any) => {
  try {
    return await prisma.wager.update({
      where: { wagerCode: wager.wager_code },
      data: {
        userId,
        action: wager.action ?? null,
        wagerStatus: wager.wager_status,
        roundId: wager.round_id,
        channelCode: wager.channel_code,
        wagerType: wager.wager_type,
        amount: wager.amount ?? wager.bet_amount,
        betAmount: wager.bet_amount,
        validBetAmount: wager.valid_bet_amount,
        prizeAmount: wager.prize_amount,
        tipAmount: wager.tip_amount,
        settledAt: BigInt(wager.settled_at),
        gameCode: wager.game_code,
        createdAt: new Date(Number(wager.created_at)),
      },
    });
  } catch (err: any) {
    if (err.code === "P2025") {
      console.log(`Wager not found: ${wager.wagerCode}`);
      return null;
    }
    throw err;
  }
};


export const processPushBet = async (wager: any) => {

  const userId = parseInt(wager.member_account);

  return prisma.$transaction(async (tx: any) => {
    const balance = await getBalance(userId, wager.currency);
    if (!balance) throw new Error("Balance not found");

    let updatedBalance = balance;

    if (wager.wager_status === "BET") {
      updatedBalance = await decrementBalance(
        tx,
        userId,
        wager.currency,
        Number(wager.bet_amount)
      );
    }

    if (wager.wager_status === "SETTLED" && Number(wager.prize_amount) > 0) {
      updatedBalance = await incrementBalance(
        tx,
        userId,
        wager.currency,
        Number(wager.prize_amount)
      );
    }
    await saveWager(tx, userId, wager);

    return {
      member_account: wager.member_account,
      product_code: wager.product_code,
      balance: updatedBalance.amount.toNumber(),
      code: 0,
      message: "",
    }

  });
};