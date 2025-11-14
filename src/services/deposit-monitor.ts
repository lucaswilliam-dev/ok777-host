import { 
  startSolanaDepositMonitoring, 
  stopSolanaDepositMonitoring,
  getSolanaNetworkStatus 
} from '../blockchain/solana-deposits';
import { 
  startEthereumDepositMonitoring, 
  stopEthereumDepositMonitoring,
  getEthereumNetworkStatus 
} from '../blockchain/ethereum-deposits';
import { 
  startTronDepositMonitoring,
  getTronDepositStats
} from '../blockchain/depositListeners/tron';

// Placeholder for stop function (doesn't exist in depositListeners)
const stopTronDepositMonitoring = () => {
  console.log('⚠️ Tron deposit monitoring stop not implemented');
};

// Wrapper to match the expected interface
const getTronNetworkStatus = async () => {
  const stats = await getTronDepositStats();
  return {
    ...stats,
    isConnected: true
  };
};

class DepositMonitorService {
  private isRunning = false;
  private networks = {
    solana: false,
    ethereum: false,
    tron: false
  };

  // Start monitoring all networks
  public start() {
    if (this.isRunning) {
      console.log('⚠️ Deposit monitoring service is already running');
      return;
    }

    console.log('🚀 Starting multi-chain deposit monitoring service...');
    
    try {
      // Start Solana monitoring
      startSolanaDepositMonitoring();
      this.networks.solana = true;
      console.log('✅ Solana deposit monitoring started');

      // Start Ethereum monitoring
      startEthereumDepositMonitoring();
      this.networks.ethereum = true;
      console.log('✅ Ethereum deposit monitoring started');

      // Start Tron monitoring
      startTronDepositMonitoring();
      this.networks.tron = true;
      console.log('✅ Tron deposit monitoring started');

      this.isRunning = true;
      console.log('🎉 Multi-chain deposit monitoring service started successfully');
    } catch (error) {
      console.error('❌ Failed to start deposit monitoring service:', error);
      this.stop();
      throw error;
    }
  }

  // Stop monitoring all networks
  public stop() {
    if (!this.isRunning) {
      console.log('⚠️ Deposit monitoring service is not running');
      return;
    }

    console.log('🛑 Stopping multi-chain deposit monitoring service...');
    
    try {
      if (this.networks.solana) {
        stopSolanaDepositMonitoring();
        this.networks.solana = false;
        console.log('✅ Solana deposit monitoring stopped');
      }

      if (this.networks.ethereum) {
        stopEthereumDepositMonitoring();
        this.networks.ethereum = false;
        console.log('✅ Ethereum deposit monitoring stopped');
      }

      if (this.networks.tron) {
        stopTronDepositMonitoring();
        this.networks.tron = false;
        console.log('✅ Tron deposit monitoring stopped');
      }

      this.isRunning = false;
      console.log('✅ Multi-chain deposit monitoring service stopped');
    } catch (error) {
      console.error('❌ Error stopping deposit monitoring service:', error);
    }
  }

  // Get service status
  public getStatus() {
    return {
      isRunning: this.isRunning,
      networks: this.networks
    };
  }

  // Get network status for all chains
  public async getNetworkStatus() {
    try {
      const [solanaStatus, ethereumStatus, tronStatus] = await Promise.all([
        getSolanaNetworkStatus(),
        getEthereumNetworkStatus(),
        getTronNetworkStatus()
      ]);

      return {
        solana: solanaStatus,
        ethereum: ethereumStatus,
        tron: tronStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting network status:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Restart a specific network
  public restartNetwork(network: 'solana' | 'ethereum' | 'tron') {
    if (!this.isRunning) {
      console.log('⚠️ Deposit monitoring service is not running');
      return;
    }

    console.log(`🔄 Restarting ${network} deposit monitoring...`);
    
    try {
      switch (network) {
        case 'solana':
          stopSolanaDepositMonitoring();
          setTimeout(() => {
            startSolanaDepositMonitoring();
            console.log(`✅ ${network} deposit monitoring restarted`);
          }, 1000);
          break;
        case 'ethereum':
          stopEthereumDepositMonitoring();
          setTimeout(() => {
            startEthereumDepositMonitoring();
            console.log(`✅ ${network} deposit monitoring restarted`);
          }, 1000);
          break;
        case 'tron':
          stopTronDepositMonitoring();
          setTimeout(() => {
            startTronDepositMonitoring();
            console.log(`✅ ${network} deposit monitoring restarted`);
          }, 1000);
          break;
        default:
          throw new Error(`Unknown network: ${network}`);
      }
    } catch (error) {
      console.error(`❌ Failed to restart ${network} monitoring:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const depositMonitorService = new DepositMonitorService();

export default depositMonitorService;

// Export individual functions for convenience
export {
  startSolanaDepositMonitoring,
  stopSolanaDepositMonitoring,
  startEthereumDepositMonitoring,
  stopEthereumDepositMonitoring,
  startTronDepositMonitoring,
  stopTronDepositMonitoring
};
