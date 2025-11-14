import 'dotenv/config';
import { hashPassword } from '../utils/bcrypt';
import { randomInt } from 'crypto';
import prisma from "./prisma";
import { createWallet } from "./wallets";
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


const generateAlphanumericCode = (length: number = 6) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}


export const register = async (email: string, password: string, referralCode: string | null = null) => {
    try {

        const existingUser = await prisma.user.findUnique({ where: { email } });

        if (existingUser) {
            throw new Error("User exists");
        }
        
        let referredById;
        if(referralCode){
            const referrer = await prisma.user.findUnique({ where: { referralCode } });
            if(referrer){
                referredById = referrer.id;
            }
        }

        const hash = await hashPassword(password);

        const user = await prisma.user.create({
            data: {
                email,
                password: hash,
                role: "user",
                status: "active",
                referralCode: generateAlphanumericCode(),
                referredById
            },
            select: { id: true }
        });
        
        await createWallet(user.id);

        // Trigger signup referral bonus if user was referred
        if (referredById) {
            try {
                const { triggerSignupReferralBonus } = require('./bonus');
                await triggerSignupReferralBonus(user.id, "USD");
                console.log(`Signup referral bonus triggered for user ${user.id} referred by ${referredById}`);
            } catch (error) {
                console.error("Error triggering signup referral bonus:", error);
                // Don't throw error to avoid breaking registration flow
            }
        }

    } catch (err) {
        console.log(err);
        throw err;
    }
};


export const login = async (email: string, password: string) => {
    try {

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error("User not found");
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            throw new Error("Not correct password");
        }

        const token = jwt.sign(user, process.env.JWTPRIVATEKEY);
        return token;

    } catch (err) {
        console.log(err);
        throw err;
    }
};


export const getProfile = async (userId: number) => {
    try {

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error("User not found");
        }
        return user;

    } catch (err) {
        console.log(err);
        throw err;
    }
};



export const setTelegram = async (userId: number, telegram: string) => {
    try {

        await prisma.user.update({
            where: { id: userId },
            data: { telegram }
        });

    } catch (err) {
        console.log(err);
        throw err;
    }
};

export const setAvatar = async (userId: number, url: string) => {
    try {

        await prisma.user.update({
            where: { id: userId },
            data: { avatar: url }
        });

    } catch (err) {
        console.log(err);
        throw err;
    }
};

export const setWithdrawPassword = async (userId: number, password: string, loginPassword: string) => {
    try {
        // Fetch user from database
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new Error('User not found');
        }

        // SECURITY: Always validate login password for security verification
        if (!loginPassword) {
            throw new Error('Login password is required for security verification');
        }

        // Verify the login password using bcrypt (same method as login authentication)
        console.log('Verifying login password for user:', userId);
        console.log('Login password provided:', !!loginPassword);
        console.log('User has stored password hash:', !!user.password);
        
        const isLoginPasswordValid = await bcrypt.compare(loginPassword, user.password);
        console.log('Login password validation result:', isLoginPasswordValid);
        
        if (!isLoginPasswordValid) {
            console.log('Login password validation failed - throwing error');
            throw new Error('Invalid login password');
        }
        
        console.log('Login password validation passed - proceeding with withdrawal password setting');

        // Hash the new withdrawal password
        const hash = await hashPassword(password);

        // Update user's withdrawal password in database (can be set or changed)
        await prisma.user.update({
            where: { id: userId },
            data: { withdrawal_password: hash }
        });

    } catch (err) {
        console.log('Error setting withdrawal password:', err);
        throw err;
    }
};

export const createEmailVerificationCode = async (userId: number) => {

    const code = (randomInt(100000, 999999)).toString();

    try {

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new Error("User not found");
        }

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await prisma.emailVerificationCode.create({
            data: { userId, code, expiresAt },
        });

        return { email: user.email, code };

    } catch (err) {
        console.log(err);
        throw err;
    }

}

export const requestEmailVerificationByEmail = async (email: string) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("User not found");
    return await createEmailVerificationCode(user.id);
}

export const verifyEmailCodeByEmail = async (email: string, code: string) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("User not found");
    await verifyEmailCode(user.id, code);
    return true;
}

export const verifyEmailCode = async (userId: number, code: string) => {

    try {
        const record = await prisma.emailVerificationCode.findFirst({
            where: { userId, code, used: false, expiresAt: { gte: new Date() } },
        });

        if (!record) throw new Error("Invalid or expired code");

        await prisma.user.update({
            where: { id: userId },
            data: { email_verified: true },
        });

        await prisma.emailVerificationCode.delete({
            where: { id: record.id }
        });

    } catch (err) {
        console.log(err);
        throw err;
    }

    return true;
}

export const changePassword = async (userId: number, password: string, newPassword: string) => {
    try {

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });

        if (!existingUser) {
            throw new Error('User not found');
        } else {
            const match = await bcrypt.compare(password, existingUser.password);
            if (match) {

                const hash = await hashPassword(newPassword);
                await prisma.user.update({
                    where: { id: userId },
                    data: { password: hash }
                });

            } else {
                throw new Error('Not correct password');
            }

        }

    } catch (err) {
        console.log(err);
        throw err;
    }
};

// New function for setting password without old password verification (for Google OAuth users)
export const setPassword = async (userId: number, newPassword: string) => {
    try {
        const existingUser = await prisma.user.findUnique({ where: { id: userId } });

        if (!existingUser) {
            throw new Error('User not found');
        }

        const hash = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hash }
        });

    } catch (err) {
        console.log(err);
        throw err;
    }
};


export const setName = async (userId: number, name: string) => {
    try {
        console.log('setName called with:', { userId, name, nameLength: name.length, nameBytes: Buffer.from(name, 'utf8').length });
        console.log('Name characters:', Array.from(name).map(c => ({ char: c, code: c.charCodeAt(0).toString(16) })));

        const result = await prisma.user.update({
            where: { id: userId },
            data: { name: name }
        });

        console.log('setName result:', result);
        return result;

    } catch (err) {
        console.log('setName error:', err);
        throw err;
    }
};

export const setPhone = async (userId: number, phone: string) => {
    try {

        await prisma.user.update({
            where: { id: userId },
            data: { phone: phone }
        });

    } catch (err) {
        console.log(err);
        throw err;
    }
};

const countTotalTeam = async (userId: number): Promise<number> => {
    try {
        const referrals = await prisma.user.findMany({
            where: { referredById: userId },
            select: { id: true },
        });

        let count = referrals.length;

        for (const ref of referrals) {
            count += await countTotalTeam(ref.id);
        }

        return count;
    } catch (error) {
        console.error("Error counting total team:", error);
        return 0; 
    }
};

export const getUserTeamByReferralCode = async (id: number) => {
    try {

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                referralCode: true,
                referralBonuses: true
            },
        });

        if (!user) {
            console.error("User not found for referral code:", user.referralCode);
            return null;
        }

        const directSubordinates = await prisma.user.findMany({
            where: { referredById: user.id },
            select: { id: true, name: true, email: true, referralCode: true },
        });

        const totalTeamCount = await countTotalTeam(user.id);

        return {
            user,
            directSubordinates,
            directSubordinatesCount: directSubordinates.length,
            totalTeamCount,
        };
    } catch (error) {
        console.error("Error fetching team data:", error);
        return null;
    }
};