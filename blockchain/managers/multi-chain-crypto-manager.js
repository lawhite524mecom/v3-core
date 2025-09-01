/**
 * MULTI-CHAIN CRYPTO MANAGER - UNIFIED BLOCKCHAIN ORCHESTRATION
 * 59 Alchemy Networks | Cross-Chain Portfolio | Real-Time Balance Tracking
 * Ethereum | Polygon | Arbitrum | Base | BNB | Avalanche | Solana | Bitcoin + More
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// Import Web3 and blockchain libraries with error handling
let Web3, solanaWeb3, bitcoin;

try {
    const Web3Import = require('web3');
    Web3 = Web3Import.Web3 || Web3Import;
} catch (error) {
    console.warn('⚠️  Web3 not available:', error.message);
}

try {
    solanaWeb3 = require('@solana/web3.js');
} catch (error) {
    console.warn('⚠️  Solana Web3 not available:', error.message);
}

try {
    bitcoin = require('bitcoinjs-lib');
} catch (error) {
    console.warn('⚠️  Bitcoin library not available:', error.message);
}

// Circuit Breaker for network resilience
class NetworkCircuitBreaker {
    constructor(network, threshold = 3, timeout = 30000) {
        this.network = network;
        this.failureCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
        this.lastError = null;
    }
    
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error(`Circuit breaker OPEN for ${this.network} - service temporarily unavailable. Last error: ${this.lastError}`);
            }
            this.state = 'HALF_OPEN';
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    
    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
        this.lastError = null;
    }
    
    onFailure(error) {
        this.failureCount++;
        this.lastError = error.message;
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            console.warn(`🚨 Circuit breaker OPEN for ${this.network} after ${this.failureCount} failures`);
        }
    }

    getStatus() {
        return {
            network: this.network,
            state: this.state,
            failures: this.failureCount,
            nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : null,
            lastError: this.lastError
        };
    }
}

// Enhanced Logger with multi-chain context
class MultiChainLogger {
    constructor(service) {
        this.service = service;
        this.logs = [];
    }
    
    log(level, message, metadata = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            service: this.service,
            level,
            message,
            network: metadata.network || 'global',
            ...metadata
        };
        
        this.logs.push(logEntry);
        console.log(`[${level.toUpperCase()}] ${this.service}${metadata.network ? `[${metadata.network}]` : ''}: ${message}`, 
                   Object.keys(metadata).length > 0 ? metadata : '');
    }
    
    info(message, metadata) { this.log('info', message, metadata); }
    warn(message, metadata) { this.log('warn', message, metadata); }
    error(message, metadata) { this.log('error', message, metadata); }
    success(message, metadata) { this.log('success', message, metadata); }
    
    getLogs(network = null) {
        return network ? this.logs.filter(log => log.network === network) : this.logs;
    }
}

// Retry logic with exponential backoff
async function withRetry(operation, maxRetries = 3, baseDelay = 1000, networkName = 'unknown') {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries) {
                console.error(`❌ ${networkName}: All ${maxRetries} attempts failed:`, error.message);
                throw error;
            }
            
            const retryDelay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`⚠️  ${networkName}: Attempt ${attempt} failed, retrying in ${retryDelay}ms:`, error.message);
            await delay(retryDelay);
        }
    }
}

class MultiChainCryptoManager extends EventEmitter {
    constructor() {
        super();
        
        // Core system state
        this.isActive = false;
        this.logger = new MultiChainLogger('MultiChainCryptoManager');
        
        // Load configuration
        this.config = null;
        this.networkConnections = new Map();
        this.circuitBreakers = new Map();
        this.balanceCache = new Map();
        this.portfolioData = new Map();
        
        // Multi-chain wallet storage
        this.multiChainWallets = new Map();
        this.crossChainTransactions = new Map();
        
        // Network health monitoring
        this.networkHealth = new Map();
        this.healthCheckInterval = null;
        this.balanceUpdateInterval = null;
        
        // Performance metrics
        this.metrics = {
            connectionAttempts: {},
            successfulConnections: {},
            failedConnections: {},
            totalRequests: {},
            averageResponseTime: {},
            lastHealthCheck: null
        };

        this.init();
    }

    async init() {
        console.log('🚀 MULTI-CHAIN CRYPTO MANAGER: Initializing comprehensive blockchain integration...');
        
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Initialize circuit breakers for all networks
            this.initializeCircuitBreakers();
            
            // Connect to priority networks first
            await this.connectToPriorityNetworks();
            
            // Connect to all other networks
            await this.connectToAllNetworks();
            
            // Initialize multi-chain wallets
            await this.initializeMultiChainWallets();
            
            // Start monitoring systems
            this.startNetworkHealthMonitoring();
            this.startBalanceTracking();
            
            this.isActive = true;
            this.emit('multi-chain-system-ready', { 
                timestamp: new Date(), 
                status: 'LIVE',
                networks: this.getConnectedNetworks().length,
                totalNetworks: Object.keys(this.config.alchemy.mainnet_networks).length
            });
            
            this.logger.success('Multi-chain system operational', {
                connectedNetworks: this.getConnectedNetworks().length,
                totalNetworks: Object.keys(this.config.alchemy.mainnet_networks).length
            });
            
        } catch (error) {
            this.logger.error('Multi-chain system initialization failed', { error: error.message });
            this.emit('system-error', error);
        }
    }

    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, 'config', 'crypto-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            this.config = JSON.parse(configData);
            
            this.logger.info('Configuration loaded successfully', {
                totalNetworks: this.config.alchemy.total_networks,
                mainnetNetworks: Object.keys(this.config.alchemy.mainnet_networks).length,
                testnetNetworks: Object.keys(this.config.alchemy.testnet_networks || {}).length
            });
            
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error.message}`);
        }
    }

    initializeCircuitBreakers() {
        // Create circuit breakers for all networks
        const allNetworks = {
            ...this.config.alchemy.mainnet_networks,
            ...this.config.alchemy.testnet_networks
        };

        Object.keys(allNetworks).forEach(networkKey => {
            this.circuitBreakers.set(networkKey, new NetworkCircuitBreaker(networkKey, 3, 60000));
            this.metrics.connectionAttempts[networkKey] = 0;
            this.metrics.successfulConnections[networkKey] = 0;
            this.metrics.failedConnections[networkKey] = 0;
            this.metrics.totalRequests[networkKey] = 0;
            this.metrics.averageResponseTime[networkKey] = 0;
        });

        this.logger.info('Circuit breakers initialized', { 
            networks: Object.keys(allNetworks).length 
        });
    }

    async connectToPriorityNetworks() {
        const priorityNetworks = this.config.alchemy.network_priorities || ['ethereum', 'polygon', 'arbitrum', 'base'];
        
        this.logger.info('Connecting to priority networks', { networks: priorityNetworks });
        
        for (const networkKey of priorityNetworks) {
            if (this.config.alchemy.mainnet_networks[networkKey]) {
                await this.connectToNetwork(networkKey, this.config.alchemy.mainnet_networks[networkKey]);
            }
        }
    }

    async connectToAllNetworks() {
        const allNetworks = this.config.alchemy.mainnet_networks;
        const priorityNetworks = new Set(this.config.alchemy.network_priorities || []);
        
        // Connect to non-priority networks
        const remainingNetworks = Object.keys(allNetworks).filter(key => !priorityNetworks.has(key));
        
        this.logger.info('Connecting to remaining networks', { 
            networks: remainingNetworks.length 
        });
        
        // Connect in batches to avoid overwhelming the system
        const batchSize = 5;
        for (let i = 0; i < remainingNetworks.length; i += batchSize) {
            const batch = remainingNetworks.slice(i, i + batchSize);
            
            await Promise.allSettled(batch.map(async (networkKey) => {
                return this.connectToNetwork(networkKey, allNetworks[networkKey]);
            }));
        }
    }

    async connectToNetwork(networkKey, networkConfig) {
        const circuitBreaker = this.circuitBreakers.get(networkKey);
        this.metrics.connectionAttempts[networkKey]++;
        
        try {
            await circuitBreaker.execute(async () => {
                const startTime = Date.now();
                
                if (networkConfig.type === 'solana') {
                    await this.connectToSolana(networkKey, networkConfig);
                } else if (networkConfig.type === 'bitcoin') {
                    await this.connectToBitcoin(networkKey, networkConfig);
                } else {
                    await this.connectToEVMNetwork(networkKey, networkConfig);
                }
                
                const responseTime = Date.now() - startTime;
                this.updateMetrics(networkKey, responseTime, true);
                
                this.logger.success(`Connected to ${networkConfig.name}`, {
                    network: networkKey,
                    chainId: networkConfig.chain_id,
                    responseTime: `${responseTime}ms`
                });
            });
            
        } catch (error) {
            this.metrics.failedConnections[networkKey]++;
            this.logger.error(`Failed to connect to ${networkConfig.name}`, {
                network: networkKey,
                error: error.message
            });
        }
    }

    async connectToEVMNetwork(networkKey, networkConfig) {
        if (!Web3) {
            throw new Error('Web3 library not available');
        }

        return await withRetry(async () => {
            const web3 = new Web3(networkConfig.endpoint);
            
            // Test connection with timeout
            const connectionTest = Promise.race([
                Promise.all([
                    web3.eth.getBlockNumber(),
                    web3.eth.getChainId()
                ]),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), 15000)
                )
            ]);
            
            const [blockNumber, chainId] = await connectionTest;
            
            // Verify chain ID matches if specified
            if (networkConfig.chain_id && chainId !== networkConfig.chain_id) {
                throw new Error(`Chain ID mismatch: expected ${networkConfig.chain_id}, got ${chainId}`);
            }
            
            this.networkConnections.set(networkKey, {
                type: 'evm',
                web3: web3,
                config: networkConfig,
                blockNumber: blockNumber,
                chainId: chainId,
                lastUpdate: new Date(),
                status: 'connected'
            });
            
            this.networkHealth.set(networkKey, {
                status: 'healthy',
                lastCheck: new Date(),
                blockNumber: blockNumber,
                latency: 0
            });
            
            return true;
        }, 3, 2000, networkConfig.name);
    }

    async connectToSolana(networkKey, networkConfig) {
        if (!solanaWeb3) {
            throw new Error('Solana Web3 library not available');
        }

        return await withRetry(async () => {
            const connection = new solanaWeb3.Connection(networkConfig.endpoint, 'confirmed');
            
            // Test connection
            const version = await connection.getVersion();
            const slot = await connection.getSlot();
            
            this.networkConnections.set(networkKey, {
                type: 'solana',
                connection: connection,
                config: networkConfig,
                version: version,
                slot: slot,
                lastUpdate: new Date(),
                status: 'connected'
            });
            
            this.networkHealth.set(networkKey, {
                status: 'healthy',
                lastCheck: new Date(),
                slot: slot,
                latency: 0
            });
            
            return true;
        }, 3, 2000, networkConfig.name);
    }

    async connectToBitcoin(networkKey, networkConfig) {
        // Bitcoin connection implementation (simplified for now)
        this.networkConnections.set(networkKey, {
            type: 'bitcoin',
            config: networkConfig,
            lastUpdate: new Date(),
            status: 'connected'
        });
        
        this.networkHealth.set(networkKey, {
            status: 'healthy',
            lastCheck: new Date(),
            latency: 0
        });
        
        return true;
    }

    updateMetrics(networkKey, responseTime, success) {
        if (success) {
            this.metrics.successfulConnections[networkKey]++;
        }
        
        this.metrics.totalRequests[networkKey]++;
        
        // Update average response time
        const currentAvg = this.metrics.averageResponseTime[networkKey] || 0;
        const totalRequests = this.metrics.totalRequests[networkKey];
        this.metrics.averageResponseTime[networkKey] = 
            (currentAvg * (totalRequests - 1) + responseTime) / totalRequests;
    }

    // ==================== MULTI-CHAIN WALLET MANAGEMENT ====================

    async initializeMultiChainWallets() {
        this.logger.info('Initializing multi-chain wallet system');
        
        // Load existing wallets
        await this.loadExistingWallets();
        
        // Create default multi-chain wallet if none exist
        if (this.multiChainWallets.size === 0) {
            await this.createMultiChainWallet('default_wallet');
        }
        
        this.logger.success('Multi-chain wallet system initialized', {
            wallets: this.multiChainWallets.size
        });
    }

    async createMultiChainWallet(walletId = null) {
        walletId = walletId || `wallet_${Date.now()}`;
        
        const wallet = {
            id: walletId,
            created: new Date(),
            networks: {},
            totalValueUSD: 0,
            lastSync: null,
            addresses: {}
        };

        // Generate addresses for each connected network
        const connectedNetworks = this.getConnectedNetworks();
        
        for (const networkKey of connectedNetworks) {
            const connection = this.networkConnections.get(networkKey);
            
            try {
                if (connection.type === 'evm') {
                    const account = connection.web3.eth.accounts.create();
                    wallet.networks[networkKey] = {
                        address: account.address,
                        privateKey: account.privateKey,
                        type: 'evm',
                        balance: 0,
                        tokens: {}
                    };
                    wallet.addresses[networkKey] = account.address;
                    
                } else if (connection.type === 'solana') {
                    const keypair = solanaWeb3.Keypair.generate();
                    wallet.networks[networkKey] = {
                        address: keypair.publicKey.toBase58(),
                        privateKey: Buffer.from(keypair.secretKey).toString('hex'),
                        type: 'solana',
                        balance: 0,
                        tokens: {}
                    };
                    wallet.addresses[networkKey] = keypair.publicKey.toBase58();
                }
                
            } catch (error) {
                this.logger.warn(`Failed to create wallet for ${networkKey}`, {
                    error: error.message,
                    network: networkKey
                });
            }
        }

        this.multiChainWallets.set(walletId, wallet);
        await this.saveWallet(wallet);

        this.logger.success('Multi-chain wallet created', {
            walletId: walletId,
            networks: Object.keys(wallet.networks).length
        });

        this.emit('wallet-created', { walletId, networks: Object.keys(wallet.networks) });
        
        return walletId;
    }

    async loadExistingWallets() {
        try {
            const walletsDir = path.join(__dirname, 'multi_chain_wallets');
            await fs.mkdir(walletsDir, { recursive: true });
            
            const walletFiles = await fs.readdir(walletsDir);
            
            for (const file of walletFiles) {
                if (file.endsWith('.json')) {
                    try {
                        const walletPath = path.join(walletsDir, file);
                        const walletData = JSON.parse(await fs.readFile(walletPath, 'utf8'));
                        this.multiChainWallets.set(walletData.id, walletData);
                    } catch (error) {
                        this.logger.warn(`Failed to load wallet ${file}`, { error: error.message });
                    }
                }
            }
            
            this.logger.info('Existing wallets loaded', { count: this.multiChainWallets.size });
            
        } catch (error) {
            this.logger.warn('Failed to load existing wallets', { error: error.message });
        }
    }

    async saveWallet(wallet) {
        try {
            const walletsDir = path.join(__dirname, 'multi_chain_wallets');
            await fs.mkdir(walletsDir, { recursive: true });
            
            const walletPath = path.join(walletsDir, `${wallet.id}.json`);
            
            // Encrypt sensitive data before saving
            const encryptedWallet = {
                ...wallet,
                networks: Object.fromEntries(
                    Object.entries(wallet.networks).map(([network, data]) => [
                        network,
                        {
                            ...data,
                            privateKey: this.encryptData(data.privateKey)
                        }
                    ])
                )
            };
            
            await fs.writeFile(walletPath, JSON.stringify(encryptedWallet, null, 2));
            
        } catch (error) {
            this.logger.error('Failed to save wallet', { 
                walletId: wallet.id, 
                error: error.message 
            });
        }
    }

    // ==================== BALANCE TRACKING SYSTEM ====================

    startBalanceTracking() {
        this.logger.info('Starting balance tracking system');
        
        // Initial balance fetch
        this.updateAllBalances();
        
        // Set up periodic balance updates
        this.balanceUpdateInterval = setInterval(() => {
            this.updateAllBalances();
        }, 60000); // Update every minute
    }

    async updateAllBalances() {
        const wallets = Array.from(this.multiChainWallets.values());
        
        for (const wallet of wallets) {
            await this.updateWalletBalances(wallet.id);
        }
    }

    async updateWalletBalances(walletId) {
        const wallet = this.multiChainWallets.get(walletId);
        if (!wallet) return;

        let totalValueUSD = 0;

        for (const [networkKey, networkWallet] of Object.entries(wallet.networks)) {
            const connection = this.networkConnections.get(networkKey);
            if (!connection) continue;

            try {
                let balance = 0;

                if (connection.type === 'evm') {
                    const weiBalance = await connection.web3.eth.getBalance(networkWallet.address);
                    balance = parseFloat(connection.web3.utils.fromWei(weiBalance, 'ether'));
                    
                } else if (connection.type === 'solana') {
                    const publicKey = new solanaWeb3.PublicKey(networkWallet.address);
                    const lamportBalance = await connection.connection.getBalance(publicKey);
                    balance = lamportBalance / solanaWeb3.LAMPORTS_PER_SOL;
                }

                networkWallet.balance = balance;
                
                // Cache balance for quick access
                this.balanceCache.set(`${walletId}_${networkKey}`, {
                    balance: balance,
                    lastUpdate: new Date()
                });

            } catch (error) {
                this.logger.warn(`Failed to update balance for ${networkKey}`, {
                    walletId: walletId,
                    network: networkKey,
                    error: error.message
                });
            }
        }

        wallet.lastSync = new Date();
        wallet.totalValueUSD = totalValueUSD; // TODO: Add price conversion
        
        this.emit('balances-updated', { walletId, balances: wallet.networks });
    }

    // ==================== NETWORK HEALTH MONITORING ====================

    startNetworkHealthMonitoring() {
        this.logger.info('Starting network health monitoring');
        
        // Initial health check
        this.performHealthCheck();
        
        // Set up periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.multi_chain_config?.health_check_interval || 60000);
    }

    async performHealthCheck() {
        this.metrics.lastHealthCheck = new Date();
        
        const healthPromises = this.getConnectedNetworks().map(async (networkKey) => {
            const connection = this.networkConnections.get(networkKey);
            const startTime = Date.now();
            
            try {
                let healthData = {};
                
                if (connection.type === 'evm') {
                    const blockNumber = await connection.web3.eth.getBlockNumber();
                    healthData = { blockNumber };
                    
                } else if (connection.type === 'solana') {
                    const slot = await connection.connection.getSlot();
                    healthData = { slot };
                }
                
                const latency = Date.now() - startTime;
                
                this.networkHealth.set(networkKey, {
                    status: 'healthy',
                    lastCheck: new Date(),
                    latency: latency,
                    ...healthData
                });
                
            } catch (error) {
                this.networkHealth.set(networkKey, {
                    status: 'unhealthy',
                    lastCheck: new Date(),
                    error: error.message,
                    latency: Date.now() - startTime
                });
                
                this.logger.warn(`Network health check failed for ${networkKey}`, {
                    network: networkKey,
                    error: error.message
                });
            }
        });
        
        await Promise.allSettled(healthPromises);
        
        this.emit('health-check-completed', {
            timestamp: new Date(),
            networks: Object.fromEntries(this.networkHealth)
        });
    }

    // ==================== UTILITY METHODS ====================

    getConnectedNetworks() {
        return Array.from(this.networkConnections.keys());
    }

    getNetworkConnection(networkKey) {
        return this.networkConnections.get(networkKey);
    }

    getCircuitBreakerStatus(networkKey = null) {
        if (networkKey) {
            const breaker = this.circuitBreakers.get(networkKey);
            return breaker ? breaker.getStatus() : null;
        }
        
        return Object.fromEntries(
            Array.from(this.circuitBreakers.entries()).map(([key, breaker]) => [
                key, breaker.getStatus()
            ])
        );
    }

    getSystemStatus() {
        const connectedNetworks = this.getConnectedNetworks();
        const totalNetworks = Object.keys(this.config.alchemy.mainnet_networks).length;
        
        return {
            isActive: this.isActive,
            networks: {
                connected: connectedNetworks.length,
                total: totalNetworks,
                health: Object.fromEntries(this.networkHealth),
                connections: connectedNetworks
            },
            wallets: {
                total: this.multiChainWallets.size,
                addresses: Array.from(this.multiChainWallets.values()).reduce((acc, wallet) => {
                    return acc + Object.keys(wallet.networks).length;
                }, 0)
            },
            metrics: this.metrics,
            circuitBreakers: this.getCircuitBreakerStatus(),
            lastHealthCheck: this.metrics.lastHealthCheck
        };
    }

    // ==================== ENCRYPTION UTILITIES ====================

    encryptData(data) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync('multi-chain-crypto-manager-secret', 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    decryptData(encryptedData) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync('multi-chain-crypto-manager-secret', 'salt', 32);
            
            const [ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            this.logger.error('Failed to decrypt data', { error: error.message });
            return null;
        }
    }

    // ==================== CLEANUP METHODS ====================

    async shutdown() {
        this.logger.info('Shutting down multi-chain crypto manager');
        
        // Clear intervals
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        if (this.balanceUpdateInterval) {
            clearInterval(this.balanceUpdateInterval);
        }
        
        // Save all wallets
        const savePromises = Array.from(this.multiChainWallets.values()).map(wallet => 
            this.saveWallet(wallet)
        );
        await Promise.allSettled(savePromises);
        
        // Clear connections
        this.networkConnections.clear();
        this.networkHealth.clear();
        this.balanceCache.clear();
        
        this.isActive = false;
        this.emit('system-shutdown');
        
        this.logger.success('Multi-chain crypto manager shutdown complete');
    }
}

module.exports = MultiChainCryptoManager;
