import express from 'express';
import prisma from '../db/prisma';
import { verifyToken } from '../middleware/auth';
import { depositMonitoringService } from '../blockchain/depositListeners';

const router = express.Router();

// (admin/history real implementation is defined later in this file)

// Get deposit history with filtering and pagination
router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = (req as any).metamaskUser?.id || (req as any).tonUser?.id;
    if (!userId) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const {
      page = 1,
      limit = 10,
      currency,
      network,
      status,
      type,
      startDate,
      endDate,
      orderId,
      txHash
    } = req.query;

    // Build where clause
    const where: any = { userId };

    if (currency) where.currency = currency;
    if (network) where.network = network;
    if (status) where.status = status;
    if (type) where.type = type;
    if (orderId) where.orderId = { contains: orderId as string };
    if (txHash) where.txHash = { contains: txHash as string };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    // Get deposits with pagination
    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        select: {
          id: true,
          orderId: true,
          txHash: true,
          fromAddress: true,
          toAddress: true,
          currency: true,
          network: true,
          amount: true,
          rate: true,
          realArrival: true,
          status: true,
          type: true,
          blockNumber: true,
          confirmations: true,
          createdAt: true,
          confirmedAt: true
        }
      }),
      prisma.deposit.count({ where })
    ]);

    res.json({
      code: 200,
      data: {
        deposits,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting deposit history:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// (admin/stats real implementation is defined later in this file)

// Debug endpoint to check Tron addresses in database
router.get('/admin/debug/tron-addresses', async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: {
        blockchain: 'Tron'
      },
      select: {
        id: true,
        userId: true,
        publicKey: true,
        network: true,
        createdAt: true
      }
    });

    res.json({
      code: 200,
      data: {
        count: wallets.length,
        addresses: wallets
      }
    });
  } catch (error) {
    console.error('Error fetching Tron addresses:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Manual deposit check for a specific Tron address
router.post('/admin/debug/check-tron-deposits', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ code: 400, message: 'Address is required' });
    }

    // Test TronWeb availability
    let tronWebStatus = 'Not available';
    try {
      const TronWebModule = require('tronweb');
      const TronWeb = TronWebModule.TronWeb;
      const tronWeb = new TronWeb({
        fullHost: 'https://api.trongrid.io'
      });
      tronWebStatus = 'Available';
    } catch (error) {
      tronWebStatus = `Error: ${error.message}`;
    }

    // Import the Tron deposit monitoring function
    const { checkTronDepositsForAddress } = require('../blockchain/depositListeners/tron');
    
    const result = await checkTronDepositsForAddress(address);
    
    res.json({
      code: 200,
      data: {
        address,
        tronWebStatus,
        result
      }
    });
  } catch (error) {
    console.error('Error checking Tron deposits:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Get deposit statistics
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = (req as any).metamaskUser?.id || (req as any).tonUser?.id;
    if (!userId) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const stats = await prisma.deposit.aggregate({
      where: { userId },
      _count: { id: true },
      _sum: { amount: true, realArrival: true }
    });

    const statusCounts = await prisma.deposit.groupBy({
      by: ['status'],
      where: { userId },
      _count: { id: true }
    });

    const currencyStats = await prisma.deposit.groupBy({
      by: ['currency'],
      where: { userId },
      _count: { id: true },
      _sum: { amount: true }
    });

    res.json({
      code: 200,
      data: {
        total: {
          deposits: stats._count.id || 0,
          amount: Number(stats._sum.amount || 0),
          realArrival: Number(stats._sum.realArrival || 0)
        },
        byStatus: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
        byCurrency: currencyStats.reduce((acc, item) => {
          acc[item.currency] = {
            count: item._count.id,
            amount: Number(item._sum.amount || 0)
          };
          return acc;
        }, {} as Record<string, { count: number; amount: number }>)
      }
    });

  } catch (error) {
    console.error('Error getting deposit stats:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Get single deposit details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const userId = (req as any).metamaskUser?.id || (req as any).tonUser?.id;
    if (!userId) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const depositId = parseInt(req.params.id);
    if (isNaN(depositId)) {
      return res.status(400).json({ code: 400, message: 'Invalid deposit ID' });
    }

    const deposit = await prisma.deposit.findFirst({
      where: { id: depositId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!deposit) {
      return res.status(404).json({ code: 404, message: 'Deposit not found' });
    }

    res.json({
      code: 200,
      data: deposit
    });

  } catch (error) {
    console.error('Error getting deposit details:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Admin endpoints
router.get('/admin/history', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      userId,
      currency,
      network,
      status,
      type,
      startDate,
      endDate,
      orderId,
      txHash
    } = req.query;

  // Build where clause
  const where: any = {};

    if (userId) where.userId = parseInt(userId as string);
    if (currency) where.currency = currency;
    if (network) where.network = network;
    if (status) where.status = status;
    if (type) where.type = type;
    if (orderId) where.orderId = { contains: orderId as string };
    if (txHash) where.txHash = { contains: txHash as string };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

  // Get deposits with pagination (no joins in adapter; enrich manually)
  const [depositsRaw, total] = await Promise.all([
    prisma.deposit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    }),
    prisma.deposit.count({ where })
  ]);

  // Fetch users for the deposits and attach
  const userIds = Array.from(new Set((depositsRaw || []).map((d: any) => d.userId).filter(Boolean)));
  let userMap: Record<number, any> = {};
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } as any },
      select: { id: true, email: true, name: true }
    });
    userMap = (users || []).reduce((acc: any, u: any) => { acc[u.id] = u; return acc; }, {});
  }

  const deposits = (depositsRaw || []).map((d: any) => ({
    ...d,
    user: userMap[d.userId] || { id: d.userId, email: '-', name: '-' }
  }));

    res.json({
      code: 200,
      data: {
        deposits,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error getting admin deposit history:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Get admin deposit statistics
router.get('/admin/stats', async (req, res) => {
  try {
    const stats = await depositMonitoringService.getStats();

    res.json({
      code: 200,
      data: stats
    });

  } catch (error) {
    console.error('Error getting admin deposit stats:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Get monitoring service status
router.get('/admin/status', async (req, res) => {
  try {
    const status = depositMonitoringService.getStatus();

    res.json({
      code: 200,
      data: status
    });

  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Start/stop monitoring service
router.post('/admin/monitoring/:action', async (req, res) => {
  try {
    const { action } = req.params;

    if (action === 'start') {
      depositMonitoringService.start();
      res.json({ code: 200, message: 'Monitoring service started' });
    } else if (action === 'stop') {
      depositMonitoringService.stop();
      res.json({ code: 200, message: 'Monitoring service stopped' });
    } else if (action === 'run-once') {
      await depositMonitoringService.runOnce();
      res.json({ code: 200, message: 'One-time monitoring completed' });
    } else {
      res.status(400).json({ code: 400, message: 'Invalid action. Use start, stop, or run-once' });
    }

  } catch (error) {
    console.error('Error controlling monitoring service:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// Update deposit status (admin only)
router.patch('/admin/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'failed'].includes(status)) {
      return res.status(400).json({ code: 400, message: 'Invalid status' });
    }

    const deposit = await prisma.deposit.update({
      where: { id: parseInt(id) },
      data: { 
        status,
        updatedAt: new Date(),
        ...(status === 'confirmed' && { confirmedAt: new Date() })
      }
    });

    res.json({
      code: 200,
      data: deposit,
      message: 'Deposit status updated successfully'
    });

  } catch (error) {
    console.error('Error updating deposit status:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

export default router;