import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import prisma from "../db/prisma";
import { hashPassword } from "../utils/bcrypt";
import { createWallet } from "../db/wallets";

function generateAlphanumericCode(length: number = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

async function ensureUserFromGoogle(profile: Profile, referralCode?: string) {
  const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : undefined;
  const displayName = profile.displayName || "Google User";

  if (!email) {
    throw new Error("Google profile has no email");
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) return user;

  // Handle referral code if provided
  let referredById;
  if (referralCode) {
    const referrer = await prisma.user.findUnique({ where: { referralCode } });
    if (referrer) {
      referredById = referrer.id;
    }
  }

  const randomPassword = await hashPassword(`${profile.id}:${Date.now()}`);

  user = await prisma.user.create({
    data: {
      email,
      password: randomPassword,
      role: "user",
      status: "active",
      email_verified: true,
      name: displayName,
      referralCode: generateAlphanumericCode(),
      referredById
    }
  });

  try { 
    await createWallet(user.id); 
    
    // Trigger signup referral bonus if user was referred (same as regular registration)
    if (referredById) {
      try {
        const { triggerSignupReferralBonus } = require('../db/bonus');
        await triggerSignupReferralBonus(user.id, "USD");
        console.log(`Signup referral bonus triggered for Google OAuth user ${user.id} referred by ${referredById}`);
      } catch (error) {
        console.error("Error triggering signup referral bonus for Google OAuth:", error);
        // Don't throw error to avoid breaking OAuth flow
      }
    }
  } catch (e) { 
    console.error("Error creating wallet for Google OAuth user:", e);
    // Don't throw error to avoid breaking OAuth flow
  }
  
  return user;
}

// Only initialize Google OAuth strategy if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const strategy = new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "https://156.238.242.137:8443/api/v1/users/auth/google/callback",
      passReqToCallback: true,
    },
    async (req: any, accessToken, refreshToken, profile, done) => {
      try {
        console.log(`[OAuth Strategy] Processing Google profile for: ${profile.emails?.[0]?.value}`);
        
        // Extract referral code from query parameters if present
        const referralCode = req.query?.referralCode || req.query?.ref;
        
        const user = await ensureUserFromGoogle(profile, referralCode);
        console.log(`[OAuth Strategy] User ${user.id} authenticated successfully`);
        
        return done(null, {
          id: user.id,
          provider: "google",
          displayName: profile.displayName,
          emails: profile.emails,
          accessToken,
        });
      } catch (err) {
        console.error(`[OAuth Strategy] Error processing user:`, err);
        return done(err);
      }
    }
  );

  passport.use(strategy);
  console.log('✅ Google OAuth strategy initialized');
} else {
  console.warn('⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google login.');
}

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj: Express.User, done) => {
  done(null, obj);
});

export default passport;
