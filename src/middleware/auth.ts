import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

// Extend Request interface to include MetaMask and TON users
declare global {
  namespace Express {
    interface Request {
      metamaskUser?: {
        address: string;
        type: string;
      };
      tonUser?: {
        address: string;
        type: string;
        publicKey: string;
      };
    }
  }
}

/**
 * JWT verification middleware
 * Checks for Authorization header with Bearer token
 */
export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 401,
        message: 'Access denied. No token provided or invalid format.'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        code: 401,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      // Verify token type and attach appropriate user info
      if (decoded.type === 'metamask') {
        req.metamaskUser = {
          address: decoded.address,
          type: decoded.type
        };
      } else if (decoded.type === 'ton') {
        req.tonUser = {
          address: decoded.address,
          type: decoded.type,
          publicKey: decoded.publicKey
        };
      } else {
        return res.status(401).json({
          code: 401,
          message: 'Invalid token type.'
        });
      }

      next();
    } catch (jwtError) {
      if (jwtError instanceof jwt.TokenExpiredError) {
        return res.status(401).json({
          code: 401,
          message: 'Token has expired. Please login again.'
        });
      } else if (jwtError instanceof jwt.JsonWebTokenError) {
        return res.status(401).json({
          code: 401,
          message: 'Invalid token.'
        });
      } else {
        throw jwtError;
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
};

/**
 * Optional JWT verification middleware
 * Doesn't fail if no token is provided, but attaches user if valid token exists
 */
export const optionalVerifyToken = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next(); // Continue without authentication
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      if (decoded.type === 'metamask') {
        req.metamaskUser = {
          address: decoded.address,
          type: decoded.type
        };
      } else if (decoded.type === 'ton') {
        req.tonUser = {
          address: decoded.address,
          type: decoded.type,
          publicKey: decoded.publicKey
        };
      }
      
      next();
    } catch (jwtError) {
      // Token is invalid, but we continue without authentication
      next();
    }
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue without authentication on error
  }
};
