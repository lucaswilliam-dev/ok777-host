import express from 'express';
import {
  register,
  login,
  getProfile,
  setTelegram,
  setWithdrawPassword,
  setAvatar,
  createEmailVerificationCode,
  verifyEmailCode,
  changePassword,
  setPassword,
  setPhone,
  getUserTeamByReferralCode,
} from '../db/users';
import { getUserReferralBonuses } from '../db/bonus';
import isAuthenticated from '../utils/jwt';
import fs from 'fs';
import path from 'path';
import { sendEmail } from '../utils/email';
import passport from '../auth/passport';
import {
  validateSignup,
  validateSignin,
  validateTelegram,
  validateUsername,
} from '../middlewares/validation';
import 'dotenv/config';
const jwt = require('jsonwebtoken');
import metamaskAuth from '../auth/metamask';
import tonAuth from '../auth/ton';
import { verifyToken } from '../middlewares';

// MetaMask user interface
interface MetaMaskUser {
  address: string;
  type: string;
}

// Extend Express Request interface for MetaMask authentication
declare global {
  namespace Express {
    interface Request {
      metamaskUser?: MetaMaskUser;
    }
  }
}

const router = express.Router();

router.post<{}, {}>('/signup', validateSignup, async (req, res) => {
  const body = req.body;

  try {
    await register(body.email, body.password, body.referralCode);
    res.json({
      code: 200,
      message: 'Ok',
    });
  } catch (err: any) {
    res.status(400).json({ message: err.toString(), code: 400 });
  }
});

router.post<{}, {}>('/signin', validateSignin, async (req, res) => {
  const body = req.body;

  try {
    const token = await login(body.email, body.password);

    res.json({ code: 200, data: { token } });
  } catch (err: any) {
    res.status(400).json({ message: err.toString() });
  }
});

router.get<{}, {}>('/profile', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  try {
    const profile = await getProfile(id);
    // Add hasPassword field to indicate if user has set a login password
    const hasPassword =
      profile.password !== null && profile.password !== undefined;
    res.json({
      code: 200,
      message: 'Ok',
      data: {
        ...profile,
        hasPassword,
      },
    });
  } catch (err: any) {
    res.status(400).json({ code: 400, message: err.toString() });
  }
});

router.get<{}, {}>('/referal-info', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  try {
    const info = await getUserTeamByReferralCode(id);
    res.json({
      code: 200,
      message: 'Ok',
      data: info,
    });
  } catch (err: any) {
    res.status(400).json({ code: 400, message: err.toString() });
  }
});

router.get<{}, {}>('/referral-bonuses', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  try {
    const bonuses = await getUserReferralBonuses(id);
    res.json({
      code: 200,
      message: 'Ok',
      data: bonuses,
    });
  } catch (err: any) {
    res.status(400).json({ code: 400, message: err.toString() });
  }
});

router.post<{}, {}>(
  '/set-telegram',
  isAuthenticated,
  validateTelegram,
  async (req, res) => {
    let id = (req as any)['token'].id;

    const body = req.body;

    try {
      await setTelegram(id, body.telegram);

      res.json({
        message: 'Ok',
        code: 200,
        data: {
          telegram: body.telegram,
        },
      });
    } catch (err: any) {
      res.status(400).json({ message: err.toString() });
    }
  },
);

router.post<{}, {}>(
  '/set-withdrawal-password',
  isAuthenticated,
  async (req, res) => {
    const userId = (req as any)['token'].id;
    const { password, loginPassword } = req.body;

    // Validate required parameters
    if (!password) {
      return res.status(400).json({
        code: 400,
        message: 'Withdrawal password is required',
      });
    }

    // SECURITY: Always require login password for verification
    if (!loginPassword) {
      return res.status(400).json({
        code: 400,
        message: 'Login password is required for security verification',
      });
    }

    // Validate password length (minimum security requirement)
    if (password.length < 6) {
      return res.status(400).json({
        code: 400,
        message: 'Withdrawal password must be at least 6 characters long',
      });
    }

    try {
      // Verify login password and set withdrawal password
      await setWithdrawPassword(userId, password, loginPassword);

      res.json({
        code: 200,
        message: 'Withdrawal password set successfully',
      });
    } catch (err: any) {
      console.log('Set withdrawal password error:', err);

      // Return 401 for authentication failures, 400 for other errors
      const statusCode = err.message?.includes('Invalid login password')
        ? 401
        : 400;

      res.status(statusCode).json({
        code: statusCode,
        message: err.message || 'Failed to set withdrawal password',
      });
    }
  },
);

router.post<{}, {}>('/set-avatar', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res
      .status(400)
      .json({ code: 400, message: 'No image data provided' });
  }

  // Accept both full data URLs and raw base64 strings; default to png
  const dataUrlMatch =
    typeof imageBase64 === 'string'
      ? imageBase64.match(/^data:(.+);base64,(.+)$/)
      : null;
  const mimeType = dataUrlMatch ? dataUrlMatch[1] : 'image/png';
  const base64Payload = dataUrlMatch ? dataUrlMatch[2] : imageBase64;

  try {
    const ext = (mimeType.split('/')[1] || 'png').toLowerCase();
    const buffer = Buffer.from(base64Payload, 'base64');

    const fileName = `img_${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const absolutePath = path.join(uploadDir, fileName);
    fs.writeFileSync(absolutePath, buffer);

    // Build web paths
    const webPath = path.posix.join('/uploads', fileName);
    const absoluteUrl = `${req.protocol}://${req.get('host')}${webPath}`;

    // Save relative web path in DB; return absolute URL for client rendering
    await setAvatar(id, webPath);

    res.json({
      message: 'Ok',
      code: 200,
      data: { path: webPath, url: absoluteUrl },
    });
  } catch (err: any) {
    res.status(400).json({ message: err.toString() });
  }
});

router.post<{}, {}>('/verify-email', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  try {
    const data = await createEmailVerificationCode(id);
    await sendEmail(data.email, 'OK777 Email Verification Code', data.code);
    console.log(`[OK777] Verification code sent to ${data.email}`);
    res.json({ success: true, message: 'Verification code sent' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.toString() });
  }
});

router.post<{}, {}>(
  '/confirm-email-code',
  isAuthenticated,
  async (req, res) => {
    let id = (req as any)['token'].id;

    const body = req.body;

    if (!body.code || !/^\d{6}$/.test(body.code)) {
      res.status(400).json({ success: false, message: 'Invalid code' });
      return;
    }

    try {
      await verifyEmailCode(id, body.code);
      console.log(`[OK777] Email verified for user ${id}`);
      res.json({ success: true, message: 'Verification successful' });
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.toString() });
    }
  },
);

// Public style API (consistent with other routes style) to support external email verification flow
// Public endpoints removed to align with documented API: use JWT-protected

router.post<{}, {}>('/change-password', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  const body = req.body;

  if (!body.password) {
    res.status(400).send({
      code: 400,
      message: 'password parametr required',
    });
    return;
  }

  if (!body.newPassword) {
    res.status(400).send({
      code: 400,
      message: 'newPassword parametr required',
    });
    return;
  }

  try {
    await changePassword(id, body.password, body.newPassword);

    res.json({ message: 'Ok', code: 200 });
  } catch (err: any) {
    res.status(400).json({ message: err.toString(), code: 400 });
  }
});

// New endpoint for setting password without old password verification (for Google OAuth users)
router.post<{}, {}>('/set-password', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  const body = req.body;

  if (!body.newPassword) {
    res.status(400).send({
      code: 400,
      message: 'newPassword parametr required',
    });
    return;
  }

  try {
    await setPassword(id, body.newPassword);

    res.json({ message: 'Ok', code: 200 });
  } catch (err: any) {
    res.status(400).json({ message: err.toString(), code: 400 });
  }
});

router.post<{}, {}>(
  '/set-name',
  isAuthenticated,
  validateUsername,
  async (req, res) => {
    let id = (req as any)['token'].id;

    const body = req.body;
    console.log('set-name API route received:', {
      id,
      username: body.username,
      usernameLength: body.username?.length,
      usernameBytes: body.username
        ? Buffer.from(body.username, 'utf8').length
        : 0,
      bodyKeys: Object.keys(body),
    });

    try {
      res.json({ message: 'Ok', code: 200, data: { name: body.username } });
    } catch (err: any) {
      console.log('set-name API error:', err);
      res.status(400).json({ message: err.toString() });
    }
  },
);

router.post<{}, {}>('/set-phone', isAuthenticated, async (req, res) => {
  let id = (req as any)['token'].id;

  const body = req.body;

  if (!body.phone) {
    res.status(400).send({
      code: 400,
      message: 'phone parametr required',
    });
    return;
  }
  try {
    await setPhone(id, body.phone);

    res.json({ message: 'Ok', code: 200 });
  } catch (err: any) {
    res.status(400).json({ code: 400, message: err.toString() });
  }
});

router.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/' }),
  async (req, res) => {
    try {
      const user = req.user as any;

      if (!user || !user.id) {
        console.error('OAuth callback: No user data received');
        return res.status(400).json({
          code: 400,
          message: 'OAuth authentication failed - no user data',
        });
      }

      // Create JWT token with same structure as regular login
      const token = jwt.sign(
        {
          id: user.id,
          email: user.emails?.[0]?.value,
          role: 'user',
        },
        process.env.JWTPRIVATEKEY as string,
        { expiresIn: '1h' },
      );

      console.log(`OAuth success: User ${user.id} authenticated via Google`);

      // If FRONTEND redirect url is configured, redirect with token for SPA consumption
      const frontendBase =
        process.env.GOOGLE_OAUTH_REDIRECT_FRONTEND || process.env.FRONTEND_URL;
      if (frontendBase) {
        const redirectUrl = `${frontendBase.replace(/\/$/, '')}/auth/google/callback?token=${encodeURIComponent(token)}`;
        console.log(`OAuth redirecting to: ${redirectUrl}`);
        return res.redirect(302, redirectUrl);
      }

      // Return same response format as regular login
      res.json({
        code: 200,
        data: { token },
        message: 'Google authentication successful',
      });
    } catch (err: any) {
      console.error('OAuth callback error:', err);
      res.status(400).json({
        code: 400,
        message: err.toString(),
      });
    }
  },
);

// Google OAuth entry point (redirects to Google)
router.get('/auth/google', (req, res, next) => {
  console.log(
    `OAuth initiation: ${req.protocol}://${req.get('host')}${req.originalUrl}`,
  );
  console.log(
    `Expected callback: ${req.protocol}://${req.get('host')}/api/v1/users/auth/google/callback`,
  );

  // Pass referral code through to the OAuth flow
  const referralCode = req.query.referralCode || req.query.ref;
  if (referralCode) {
    console.log(`OAuth with referral code: ${referralCode}`);
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })(req, res, next);
});

// MetaMask Authentication Routes
router.use('/auth', metamaskAuth);

// TON Authentication Routes
router.use('/auth', tonAuth);

// Protected profile route using JWT middleware
router.get('/profile-metamask', verifyToken, async (req, res) => {
  try {
    const user = req.metamaskUser;

    if (!user || !user.address) {
      return res.status(401).json({
        code: 401,
        message: 'User not authenticated',
      });
    }

    res.json({
      code: 200,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          address: user.address,
          type: user.type,
          authenticatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error retrieving profile:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
    });
  }
});

// Protected TON profile route using JWT middleware
router.get('/profile-ton', verifyToken, async (req, res) => {
  try {
    const user = req.tonUser;

    if (!user || !user.address) {
      return res.status(401).json({
        code: 401,
        message: 'User not authenticated',
      });
    }

    res.json({
      code: 200,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          address: user.address,
          type: user.type,
          publicKey: user.publicKey,
          authenticatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error retrieving TON profile:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error',
    });
  }
});

export default router;
