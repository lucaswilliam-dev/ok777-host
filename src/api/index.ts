import express from 'express';
import MessageResponse from '../interfaces/MessageResponse';
import users from './users';
import wallets from './wallets';
import admin from './admin';
import seamless from './seamless';
import operators from './operators';
import games from './games';
import deposits from './deposits';
import prisma from '../db/prisma';

const router = express.Router();

router.get<{}, MessageResponse>('/', (req, res) => {
  res.json({
    message: 'API - 👋🌎🌍🌏',
  });
});

// Diagnostic endpoint to check database connection
router.get('/test-db', async (req, res) => {
  try {
    // Test Prisma connection
    const userCount = await prisma.user.count();
    const gameCount = await prisma.game.count();
    const productCount = await prisma.product.count();
    
    // Test with filters (like the actual queries)
    const activatedGames = await prisma.game.count({
      where: {
        status: 'ACTIVATED',
        enabled: true,
        inManager: true,
      },
    });
    
    // Get database URL (hide password for security)
    const dbUrl = process.env.DATABASE_URL || 'Not set';
    const maskedUrl = dbUrl !== 'Not set' 
      ? dbUrl.replace(/:[^:@]+@/, ':****@') 
      : 'Not set';
    
    return res.json({
      success: true,
      database: 'Connected',
      databaseUrl: maskedUrl,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      counts: {
        users: userCount,
        games: {
          total: gameCount,
          activated: activatedGames,
          withFilters: activatedGames, // Games matching the filters used in queries
        },
        products: productCount,
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      database: process.env.DATABASE_URL ? 'Connection failed' : 'No DATABASE_URL set',
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Test endpoint to check raw queries without filters
router.get('/test-query', async (req, res) => {
  try {
    // Simple query without filters
    const allGames = await prisma.game.findMany({
      take: 10,
      select: {
        id: true,
        gameName: true,
        status: true,
        enabled: true,
        inManager: true,
      },
    });
    
    return res.json({
      success: true,
      count: allGames.length,
      games: allGames,
      message: 'This shows first 10 games without any filters',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

router.use('/users', users);
router.use('/wallets', wallets);
router.use('/admin', admin);
// router.use('/seamless', seamless);
router.use('/operators', operators);
router.use('/games', games);
router.use('/deposits', deposits);

export default router;
