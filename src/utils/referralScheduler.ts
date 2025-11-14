import { expireOldBonuses } from '../db/bonus';
import prisma from '../db/prisma';

// Schedule to run every hour to expire old referral bonuses
export const startReferralBonusScheduler = () => {
  console.log('🕐 Starting referral bonus expiration scheduler...');
  
  // Run immediately on startup with error handling
  expireOldBonuses().catch((error) => {
    console.error('Initial bonus expiration failed:', error);
  });
  
  // Then run every hour
  setInterval(async () => {
    try {
      // Test database connection first
      await prisma.user.findFirst({ select: { id: true } });
      
      const expiredCount = await expireOldBonuses();
      if (expiredCount > 0) {
        console.log(`⏰ Expired ${expiredCount} old referral bonuses`);
      }
    } catch (error) {
      console.error('Error in referral bonus scheduler:', error);
      // Don't throw to prevent scheduler from stopping
    }
  }, 60 * 60 * 1000); // 1 hour
};

// Manual trigger for testing
export const triggerBonusExpiration = async () => {
  try {
    const expiredCount = await expireOldBonuses();
    console.log(`Manual trigger: Expired ${expiredCount} old referral bonuses`);
    return expiredCount;
  } catch (error) {
    console.error('Error in manual bonus expiration:', error);
    return 0;
  }
};



