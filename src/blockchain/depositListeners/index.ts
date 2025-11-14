import { monitorSolanaDeposits, startSolanaDepositMonitoring, getSolanaDepositStats } from './solana';
import { monitorEthereumDeposits, startEthereumDepositMonitoring, getEthereumDepositStats } from './ethereum';
import { monitorTronDeposits, startTronDepositMonitoring, getTronDepositStats } from './tron';

// Main deposit monitoring service
export class DepositMonitoringService {
  private isRunning = false;
  private intervals: NodeJS.Timeout[] = [];

  // Start monitoring all networks
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️ Deposit monitoring is already running');
      return;
    }

    console.log('🚀 Starting multi-chain deposit monitoring service...');
    
    try {
      // Start all network monitors
      startSolanaDepositMonitoring();
      startEthereumDepositMonitoring();
      startTronDepositMonitoring();
      
      this.isRunning = true;
      console.log('✅ Multi-chain deposit monitoring service started successfully');
      
    } catch (error) {
      console.error('❌ Failed to start deposit monitoring service:', error);
      this.stop();
    }
  }

  // Stop monitoring all networks
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️ Deposit monitoring is not running');
      return;
    }

    console.log('🛑 Stopping multi-chain deposit monitoring service...');
    
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    this.isRunning = false;
    console.log('✅ Multi-chain deposit monitoring service stopped');
  }

  // Run monitoring once for all networks
  public async runOnce(): Promise<void> {
    console.log('🔄 Running deposit monitoring once for all networks...');
    
    try {
      await Promise.all([
        monitorSolanaDeposits(),
        monitorEthereumDeposits(),
        monitorTronDeposits()
      ]);
      
      console.log('✅ One-time deposit monitoring completed');
    } catch (error) {
      console.error('❌ Error in one-time deposit monitoring:', error);
    }
  }

  // Get statistics for all networks
  public async getStats(): Promise<{
    solana: any;
    ethereum: any;
    tron: any;
    total: {
      deposits: number;
      amount: number;
      pending: number;
      confirmed: number;
    };
  }> {
    try {
      const [solanaStats, ethereumStats, tronStats] = await Promise.all([
        getSolanaDepositStats(),
        getEthereumDepositStats(),
        getTronDepositStats()
      ]);

      const total = {
        deposits: solanaStats.totalDeposits + ethereumStats.totalDeposits + tronStats.totalDeposits,
        amount: solanaStats.totalAmount + ethereumStats.totalAmount + tronStats.totalAmount,
        pending: solanaStats.pendingDeposits + ethereumStats.pendingDeposits + tronStats.pendingDeposits,
        confirmed: solanaStats.confirmedDeposits + ethereumStats.confirmedDeposits + tronStats.confirmedDeposits
      };

      return {
        solana: solanaStats,
        ethereum: ethereumStats,
        tron: tronStats,
        total
      };
    } catch (error) {
      console.error('Error getting deposit statistics:', error);
      return {
        solana: { totalDeposits: 0, totalAmount: 0, pendingDeposits: 0, confirmedDeposits: 0 },
        ethereum: { totalDeposits: 0, totalAmount: 0, pendingDeposits: 0, confirmedDeposits: 0 },
        tron: { totalDeposits: 0, totalAmount: 0, pendingDeposits: 0, confirmedDeposits: 0 },
        total: { deposits: 0, amount: 0, pending: 0, confirmed: 0 }
      };
    }
  }

  // Get status of the monitoring service
  public getStatus(): { isRunning: boolean; networks: string[] } {
    return {
      isRunning: this.isRunning,
      networks: ['Solana', 'Ethereum', 'Tron']
    };
  }
}

// Create singleton instance
export const depositMonitoringService = new DepositMonitoringService();

// Export individual functions for direct use
export {
  monitorSolanaDeposits,
  startSolanaDepositMonitoring,
  getSolanaDepositStats,
  monitorEthereumDeposits,
  startEthereumDepositMonitoring,
  getEthereumDepositStats,
  monitorTronDeposits,
  startTronDepositMonitoring,
  getTronDepositStats
};
