import prisma from "./prisma";

// Get referral configuration
export const getReferralConfig = async () => {
  try {
    let config = await prisma.referralConfig.findFirst();
    if (!config) {
      // Create default config if none exists
      config = await prisma.referralConfig.create({
        data: {
          id: 1,
          depositBonusPercent: 5,
          betBonusPercent: 2,
          firstDepositBonus: 10,
          firstBetBonus: 5,
          signupBonus: 5,
          maxBonusPerUser: 1000,
          bonusExpiryDays: 30,
          enabled: true,
        },
      });
    }
    return config;
  } catch (error) {
    console.error("Error getting referral config:", error);
    return null;
  }
};

// Update referral configuration
export const updateReferralConfig = async (configData: {
  depositBonusPercent?: number;
  betBonusPercent?: number;
  firstDepositBonus?: number;
  firstBetBonus?: number;
  signupBonus?: number;
  maxBonusPerUser?: number;
  bonusExpiryDays?: number;
  enabled?: boolean;
}) => {
  try {
    const config = await prisma.referralConfig.upsert({
      where: { id: 1 },
      update: configData,
      create: {
        id: 1,
        depositBonusPercent: 5,
        betBonusPercent: 2,
        firstDepositBonus: 10,
        firstBetBonus: 5,
        signupBonus: 5,
        maxBonusPerUser: 1000,
        bonusExpiryDays: 30,
        enabled: true,
        ...configData,
      },
    });
    return config;
  } catch (error) {
    console.error("Error updating referral config:", error);
    return null;
  }
};

// Check if user has reached max bonus limit
const checkMaxBonusLimit = async (userId: number, currency: string, additionalAmount: number) => {
  try {
    const config = await getReferralConfig();
    if (!config) return true;

    const totalBonuses = await prisma.referralBonus.aggregate({
      where: { userId, currency, status: { not: "expired" } },
      _sum: { amount: true },
    });

    const currentTotal = totalBonuses._sum.amount || 0;
    return (currentTotal + additionalAmount) <= config.maxBonusPerUser;
  } catch (error) {
    console.error("Error checking max bonus limit:", error);
    return false;
  }
};

// Add or update referral bonus with enhanced logic
export const addOrUpdateReferralBonus = async (
  referredUserId: number,
  bonusAmount: number,
  currency: string = "USD",
  triggerType: string = "deposit"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) {
      console.log("Referral system disabled or config not found.");
      return null;
    }

    const referredUser = await prisma.user.findUnique({
      where: { id: referredUserId },
      select: { referredById: true },
    });

    if (!referredUser?.referredById) {
      console.log("No inviter, skipping bonus.");
      return null;
    }

    const inviterId = referredUser.referredById;

    // Check max bonus limit
    const withinLimit = await checkMaxBonusLimit(inviterId, currency, bonusAmount);
    if (!withinLimit) {
      console.log("Max bonus limit reached for user:", inviterId);
      return null;
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.bonusExpiryDays);

    const existingBonus = await prisma.referralBonus.findFirst({
      where: { 
        userId: inviterId, 
        fromUserId: referredUserId, 
        currency,
        triggerType,
        status: "pending"
      },
    });

    if (existingBonus) {
      const updatedBonus = await prisma.referralBonus.update({
        where: { id: existingBonus.id },
        data: { 
          amount: { increment: bonusAmount },
          expiresAt,
        },
      });

      console.log("Referral bonus updated:", updatedBonus);
      return updatedBonus;
    } else {
      const newBonus = await prisma.referralBonus.create({
        data: {
          userId: inviterId,
          fromUserId: referredUserId,
          amount: bonusAmount,
          currency,
          status: "pending",
          triggerType,
          expiresAt,
        },
      });

      console.log("Referral bonus created:", newBonus);
      return newBonus;
    }
  } catch (error) {
    console.error("Error adding/updating referral bonus:", error);
    return null;
  }
};

// Trigger referral bonus for user deposit
export const triggerDepositReferralBonus = async (
  userId: number,
  depositAmount: number,
  currency: string = "USD"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) return null;

    const bonusAmount = Math.floor((depositAmount * config.depositBonusPercent) / 100);
    if (bonusAmount <= 0) return null;

    return await addOrUpdateReferralBonus(userId, bonusAmount, currency, "deposit");
  } catch (error) {
    console.error("Error triggering deposit referral bonus:", error);
    return null;
  }
};

// Trigger referral bonus for user bet
export const triggerBetReferralBonus = async (
  userId: number,
  betAmount: number,
  currency: string = "USD"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) return null;

    const bonusAmount = Math.floor((betAmount * config.betBonusPercent) / 100);
    if (bonusAmount <= 0) return null;

    return await addOrUpdateReferralBonus(userId, bonusAmount, currency, "bet");
  } catch (error) {
    console.error("Error triggering bet referral bonus:", error);
    return null;
  }
};

// Trigger first deposit bonus
export const triggerFirstDepositReferralBonus = async (
  userId: number,
  currency: string = "USD"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) return null;

    // Check if this is actually the user's first deposit
    const existingDeposits = await prisma.transaction.count({
      where: { userId, type: "deposit" },
    });

    if (existingDeposits > 1) return null; // Not first deposit

    return await addOrUpdateReferralBonus(userId, config.firstDepositBonus, currency, "first_deposit");
  } catch (error) {
    console.error("Error triggering first deposit referral bonus:", error);
    return null;
  }
};

// Trigger first bet bonus
export const triggerFirstBetReferralBonus = async (
  userId: number,
  currency: string = "USD"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) return null;

    // Check if this is actually the user's first bet
    const existingBets = await prisma.wager.count({
      where: { userId },
    });

    if (existingBets > 1) return null; // Not first bet

    return await addOrUpdateReferralBonus(userId, config.firstBetBonus, currency, "first_bet");
  } catch (error) {
    console.error("Error triggering first bet referral bonus:", error);
    return null;
  }
};

// Trigger signup referral bonus
export const triggerSignupReferralBonus = async (
  userId: number,
  currency: string = "USD"
) => {
  try {
    const config = await getReferralConfig();
    if (!config || !config.enabled) return null;

    return await addOrUpdateReferralBonus(userId, config.signupBonus || 5, currency, "signup");
  } catch (error) {
    console.error("Error triggering signup referral bonus:", error);
    return null;
  }
};

// Get user's referral bonus summary
export const getUserReferralBonuses = async (userId: number) => {
  try {
    const bonuses = await prisma.referralBonus.findMany({
      where: { userId },
      include: {
        fromUser: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = await prisma.referralBonus.aggregate({
      where: { userId },
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      bonuses,
      totalAmount: summary._sum.amount || 0,
      totalCount: summary._count.id || 0,
    };
  } catch (error) {
    console.error("Error getting user referral bonuses:", error);
    return null;
  }
};

// Expire old bonuses
export const expireOldBonuses = async () => {
  try {
    console.log("Starting bonus expiration check...");
    
    const result = await prisma.referralBonus.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });

    console.log(`Expired ${result.count} old referral bonuses`);
    return result.count;
  } catch (error) {
    console.error("Error expiring old bonuses:", {
      message: error instanceof Error ? error.message : "Unknown error",
      details: error instanceof Error ? error.stack : String(error),
      hint: "Check database connection and referral bonus table",
      code: "BONUS_EXPIRATION_ERROR",
    });
    return 0;
  }
};

export const convertReferralBonusToPayout = async (
  userId: number,
  amount: number,
  currency: string = "USD"
) => {
  try {
    const pendingBonuses = await prisma.referralBonus.findMany({
      where: { 
        userId, 
        currency, 
        status: "pending",
        expiresAt: { gt: new Date() } // Only non-expired bonuses
      },
      orderBy: { createdAt: "asc" },
    });

    if (pendingBonuses.length === 0) return null;

    let remainingAmount = amount;

    for (const bonus of pendingBonuses) {
      if (remainingAmount <= 0) break;

      if (bonus.amount <= remainingAmount) {
        remainingAmount -= bonus.amount;
        await prisma.referralBonus.update({
          where: { id: bonus.id },
          data: { status: "paid" },
        });
      } else {
        await prisma.referralBonus.update({
          where: { id: bonus.id },
          data: { amount: bonus.amount - remainingAmount },
        });
        remainingAmount = 0;
      }
    }

    if (remainingAmount > 0) return null;

    const payout = await prisma.payout.create({
      data: {
        userId,
        to: String(userId),
        amount,
        currency,
        status: "pending",
      },
    });

    return payout;
  } catch (error) {
    return null;
  }
};