/**
 * ENHANCED CRYPTO MANAGER - COINSTAT API + SOLANA INTEGRATION
 * Real Portfolio Tracking | Solana Core | Ethereum | Multi-Chain Support
 * CoinStats API Integration for Holdings Management
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// Import dependencies with proper error handling
let Bitcoin, Web3, Spot, bip39, Wallet, bitcoin, ccxt, solanaWeb3;

try {
    Bitcoin = require('bitcoin-core');
} catch (error) {
    console.warn('⚠️  Bitcoin-core not available:', error.message);
}

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

// Import Web3 utils for address validation and checksum
let web3Utils;
try {
    const web3UtilsImport = require('web3-utils');
    web3Utils = web3UtilsImport.default || web3UtilsImport;
} catch (error) {
    console.warn('⚠️  Web3-utils not available:', error.message);
}

// Circuit Breaker Pattern for External Calls
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.failureCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
    }
    
    async execute(operation) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN - service temporarily unavailable');
            }
            this.state = 'HALF_OPEN';
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    onSuccess() {
        this.failureCount = 0;
        this.state = 'CLOSED';
    }
    
    onFailure() {
        this.failureCount++;
        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
        }
    }
}

// Enhanced Logger with CoinStats integration
class Logger {
    constructor(service) {
        this.service = service;
    }
    
    log(level, message, metadata = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            service: this.service,
            level,
            message,
            ...metadata
        };
        
        console.log(`[${level.toUpperCase()}] ${this.service}: ${message}`, 
                   Object.keys(metadata).length > 0 ? metadata : '');
    }
    
    info(message, metadata) { this.log('info', message, metadata); }
    warn(message, metadata) { this.log('warn', message, metadata); }
    error(message, metadata) { this.log('error', message, metadata); }
}

// CoinStats API Integration
class CoinStatsAPI {
    constructor() {
        this.baseURL = 'https://openapiv1.coinstats.app';
        this.apiKey = process.env.COINSTATS_API_KEY || null;
        this.logger = new Logger('CoinStatsAPI');
        this.circuitBreaker = new CircuitBreaker(3, 30000);
    }

    async makeRequest(endpoint, params = {}) {
        return await this.circuitBreaker.execute(async () => {
            const response = await axios.get(`${this.baseURL}${endpoint}`, {
                params,
                headers: this.apiKey ? { 'X-API-KEY': this.apiKey } : {},
                timeout: 10000
            });
            return response.data;
        });
    }

    async getCoins(limit = 100) {
        try {
            return await this.makeRequest('/coins', { limit, currency: 'USD' });
        } catch (error) {
            this.logger.error('Failed to fetch coins', { error: error.message });
            return { coins: [] };
        }
    }

    async getCoinById(coinId) {
        try {
            return await this.makeRequest(`/coins/${coinId}`);
        } catch (error) {
            this.logger.error('Failed to fetch coin details', { coinId, error: error.message });
            return null;
        }
    }

    async getWalletBalance(address, connectionId) {
        try {
            return await this.makeRequest('/wallet/balance', { address, connectionId });
        } catch (error) {
            this.logger.error('Failed to fetch wallet balance', { address, error: error.message });
            return null;
        }
    }

    async getPortfolioData(shareToken) {
        try {
            return await this.makeRequest('/portfolio/coins', { shareToken });
        } catch (error) {
            this.logger.error('Failed to fetch portfolio data', { error: error.message });
            return null;
        }
    }
}

// Address Validation Utility
function validateAddress(address, network = 'ethereum') {
    if (!address || typeof address !== 'string') {
        throw new Error('Address must be a non-empty string');
    }
    
    switch (network) {
        case 'ethereum':
            if (web3Utils && web3Utils.isAddress) {
                if (!web3Utils.isAddress(address)) {
                    throw new Error(`Invalid Ethereum address: ${address}`);
                }
                return web3Utils.toChecksumAddress(address);
            }
            if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
                throw new Error(`Invalid Ethereum address format: ${address}`);
            }
            return address;
            
        case 'solana':
            if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
                throw new Error(`Invalid Solana address format: ${address}`);
            }
            return address;
            
        case 'bitcoin':
            // Basic Bitcoin address validation
            if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) && 
                !/^bc1[a-z0-9]{39,59}$/.test(address)) {
                throw new Error(`Invalid Bitcoin address format: ${address}`);
            }
            return address;
            
        default:
            return address;
    }
}

// Retry Logic with Exponential Backoff
async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            const retryDelay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Attempt ${attempt} failed, retrying in ${retryDelay}ms:`, error.message);
            await delay(retryDelay);
        }
    }
}

class EnhancedCryptoManager extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        
        // Initialize logger and circuit breakers
        this.logger = new Logger('EnhancedCryptoManager');
        this.ethereumCircuitBreaker = new CircuitBreaker(3, 30000);
        this.solanaCircuitBreaker = new CircuitBreaker(3, 30000);
        this.binanceCircuitBreaker = new CircuitBreaker(5, 60000);
        
        // Initialize CoinStats API
        this.coinStats = new CoinStatsAPI();
        
        // Check if required dependencies are available
        this.dependenciesAvailable = {
            bitcoin: !!Bitcoin,
            web3: !!Web3,
            solana: !!solanaWeb3,
            binance: !!Spot,
            bip39: !!bip39,
            wallet: !!Wallet,
            bitcoinjs: !!bitcoin,
            ccxt: !!ccxt
        };
        
        // Real API connections
        this.bitcoinClient = null;
        this.web3 = null;
        this.solanaConnection = null;
        this.binanceClient = null;
        this.exchanges = {};
        
        // Enhanced wallet storage with multi-chain support
        this.realWallets = new Map();
        this.portfolioData = new Map();
        this.holdingsData = new Map();
        this.miningRigs = new Map();
        this.activeTraders = new Map();
        
        // Enhanced configuration with Solana and CoinStats
        this.config = {
            bitcoin: {
                rpcUser: process.env.BITCOIN_RPC_USER || 'bitcoinrpc',
                rpcPassword: process.env.BITCOIN_RPC_PASSWORD || 'rpcpassword',
                rpcHost: process.env.BITCOIN_RPC_HOST || '127.0.0.1',
                rpcPort: process.env.BITCOIN_RPC_PORT || 8332,
                network: process.env.BITCOIN_NETWORK || 'testnet'
            },
            ethereum: {
                rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
                privateKey: process.env.ETHEREUM_PRIVATE_KEY || null,
                gasPrice: process.env.GAS_PRICE || '20000000000'
            },
            solana: {
                rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
                cluster: process.env.SOLANA_CLUSTER || 'mainnet-beta',
                privateKey: process.env.SOLANA_PRIVATE_KEY || null
            },
            coinStats: {
                apiKey: process.env.COINSTATS_API_KEY || null,
                shareToken: process.env.COINSTATS_SHARE_TOKEN || null,
                autoSync: true,
                syncInterval: 300000 // 5 minutes
            },
            binance: {
                apiKey: process.env.BINANCE_API_KEY || null,
                apiSecret: process.env.BINANCE_API_SECRET || null,
                testnet: process.env.BINANCE_TESTNET === 'true'
            },
            mainWallet: {
                ethereum: {
                    address: '0x742D35CC0642c35A8b3ce4f4AFf0e23AE8b30F50',
                    privateKey: process.env.ETHEREUM_MAIN_WALLET_KEY || null
                },
                solana: {
                    address: process.env.SOLANA_MAIN_WALLET_ADDRESS || null,
                    privateKey: process.env.SOLANA_MAIN_WALLET_KEY || null
                },
                bitcoin: {
                    address: process.env.BITCOIN_MAIN_WALLET_ADDRESS || null,
                    privateKey: process.env.BITCOIN_MAIN_WALLET_KEY || null
                },
                autoTransferEnabled: true,
                transferPercentage: 0.0009,
                transferInterval: 300000,
                lastTransferTime: null,
                totalTransferred: 0,
                realBalances: {
                    ethereum: 0,
                    solana: 0,
                    bitcoin: 0
                }
            }
        };
        
        this.autoTransferTimer = null;
        this.walletMonitor = null;
        this.portfolioSyncTimer = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 ENHANCED CRYPTO MANAGER: Initializing multi-chain + CoinStats integration...');
        
        try {
            await this.connectToEthereum();
            await this.connectToSolana();
            await this.connectToBinance();
            await this.initializeCoinStatsSync();
            await this.initializeRealWallets();
            await this.startRealAutoTransferSystem();
            await this.startPortfolioSync();
            
            this.isActive = true;
            this.emit('enhanced-system-ready', { timestamp: new Date(), status: 'LIVE' });
            
            console.log('✅ ENHANCED CRYPTO MANAGER: All systems operational');
            console.log(`💎 MAIN WALLETS: ETH(${this.config.mainWallet.ethereum.address})`);
            console.log(`🔄 COINSTATS: Portfolio sync active`);
        } catch (error) {
            console.error('❌ ENHANCED CRYPTO MANAGER: Initialization failed:', error);
            this.emit('system-error', error);
        }
    }

    // ==================== BLOCKCHAIN CONNECTIONS ====================

    async connectToEthereum() {
        try {
            if (!Web3) {
                throw new Error('Web3 library not available');
            }
            
            const rpcEndpoints = [
                'https://ethereum-rpc.publicnode.com',
                'https://rpc.ankr.com/eth',
                'https://eth.llamarpc.com',
                'https://ethereum.blockpi.network/v1/rpc/public',
                this.config.ethereum.rpcUrl
            ];
            
            return await withRetry(async () => {
                for (const rpcUrl of rpcEndpoints) {
                    try {
                        this.logger.info('Attempting Ethereum connection', { rpcUrl });
                        
                        this.web3 = new Web3(rpcUrl);
                        
                        const connectionTest = Promise.race([
                            Promise.all([
                                this.web3.eth.getBlockNumber(),
                                this.web3.eth.getChainId()
                            ]),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Connection timeout')), 10000)
                            )
                        ]);
                        
                        const [blockNumber, chainId] = await connectionTest;
                        
                        this.logger.info('Ethereum connection successful', { 
                            rpcUrl, 
                            chainId, 
                            blockNumber 
                        });
                        
                        this.emit('ethereum-connected', { chainId, blockNumber, rpcUrl });
                        return true;
                        
                    } catch (endpointError) {
                        this.logger.warn('RPC endpoint failed', { 
                            rpcUrl, 
                            error: endpointError.message 
                        });
                        continue;
                    }
                }
                
                throw new Error('All Ethereum RPC endpoints failed');
            }, 3, 5000);
            
        } catch (error) {
            this.logger.error('Ethereum connection failed after all retries', { 
                error: error.message 
            });
            this.web3 = null;
        }
    }

    async connectToSolana() {
        try {
            if (!solanaWeb3) {
                this.logger.warn('Solana Web3 library not available');
                return;
            }

            return await this.solanaCircuitBreaker.execute(async () => {
                this.solanaConnection = new solanaWeb3.Connection(
                    this.config.solana.rpcUrl,
                    'confirmed'
                );

                // Test connection
                const version = await this.solanaConnection.getVersion();
                const slot = await this.solanaConnection.getSlot();

                this.logger.info('Solana connection successful', {
                    cluster: this.config.solana.cluster,
                    version: version['solana-core'],
                    slot
                });

                this.emit('solana-connected', { version, slot });
                return true;
            });

        } catch (error) {
            this.logger.error('Solana connection failed', { error: error.message });
            this.solanaConnection = null;
        }
    }

    async connectToBinance() {
        try {
            if (!this.config.binance.apiKey || !this.config.binance.apiSecret) {
                console.log('⚠️  BINANCE: API credentials not configured');
                return;
            }

            const BinanceConnector = require('@binance/connector');
            const Spot = BinanceConnector.Spot;

            this.binanceClient = new Spot(
                this.config.binance.apiKey,
                this.config.binance.apiSecret,
                { baseURL: this.config.binance.testnet ? 'https://testnet.binance.vision' : undefined }
            );

            const accountInfo = await this.binanceClient.account();
            console.log(`⚡ BINANCE: Connected - Account Type: ${accountInfo.data.accountType}`);
            
            this.emit('binance-connected', accountInfo.data);
        } catch (error) {
            console.error('❌ BINANCE: Connection failed:', error);
        }
    }

    // ==================== COINSTATS INTEGRATION ====================

    async initializeCoinStatsSync() {
        try {
            this.logger.info('Initializing CoinStats API integration');
            
            // Test CoinStats connection
            const coins = await this.coinStats.getCoins(10);
            if (coins && coins.coins && coins.coins.length > 0) {
                this.logger.info('CoinStats API connected successfully', { 
                    coinCount: coins.coins.length 
                });
                this.emit('coinstats-connected', { status: 'active' });
            }
            
        } catch (error) {
            this.logger.error('CoinStats initialization failed', { error: error.message });
        }
    }

    async syncPortfolioWithCoinStats() {
        try {
            if (!this.config.coinStats.shareToken) {
                this.logger.warn('CoinStats share token not configured');
                return;
            }

            const portfolioData = await this.coinStats.getPortfolioData(
                this.config.coinStats.shareToken
            );

            if (portfolioData) {
                this.portfolioData.set('coinstats', {
                    data: portfolioData,
                    lastSync: new Date(),
                    totalValueUSD: portfolioData.totalValue || 0
                });

                this.logger.info('Portfolio synced with CoinStats', {
                    totalValue: portfolioData.totalValue,
                    coinCount: portfolioData.coins?.length || 0
                });

                this.emit('portfolio-synced', portfolioData);
            }

        } catch (error) {
            this.logger.error('Portfolio sync failed', { error: error.message });
        }
    }

    async getWalletBalanceFromCoinStats(address, network) {
        try {
            const connectionMapping = {
                'ethereum': 'ethereum',
                'solana': 'solana',
                'bitcoin': 'bitcoin'
            };

            const connectionId = connectionMapping[network];
            if (!connectionId) {
                this.logger.warn('Unsupported network for CoinStats', { network });
                return null;
            }

            const balanceData = await this.coinStats.getWalletBalance(address, connectionId);
            
            if (balanceData) {
                this.holdingsData.set(`${network}_${address}`, {
                    balance: balanceData.balance,
                    valueUSD: balanceData.valueUSD,
                    tokens: balanceData.tokens || [],
                    lastUpdated: new Date()
                });

                return balanceData;
            }

        } catch (error) {
            this.logger.error('Failed to get wallet balance from CoinStats', {
                address,
                network,
                error: error.message
            });
        }
        return null;
    }

    // ==================== ENHANCED WALLET MANAGEMENT ====================

    async createMultiChainWallet() {
        try {
            const walletId = `multi_wallet_${Date.now()}`;
            const wallets = {};

            // Create Ethereum wallet
            if (this.dependenciesAvailable.wallet && this.dependenciesAvailable.bip39) {
                wallets.ethereum = await this.createEthereumWallet();
            }

            // Create Solana wallet
            if (solanaWeb3) {
                wallets.solana = await this.createSolanaWallet();
            }

            const multiChainWallet = {
                id: walletId,
                wallets: wallets,
                created: new Date(),
                totalValueUSD: 0,
                lastSync: null
            };

            this.realWallets.set(walletId, multiChainWallet);
            await this.saveRealWalletData(multiChainWallet);

            console.log(`💳 MULTI-CHAIN WALLET: Created wallet with ${Object.keys(wallets).length} chains`);
            this.emit('multi-wallet-created', { walletId, chains: Object.keys(wallets) });

            return walletId;
        } catch (error) {
            console.error('❌ Failed to create multi-chain wallet:', error);
            throw error;
        }
    }

    async createSolanaWallet() {
        try {
            if (!solanaWeb3) {
                throw new Error('Solana Web3 not available');
            }

            const keypair = solanaWeb3.Keypair.generate();
            
            return {
                address: keypair.publicKey.toBase58(),
                privateKey: Buffer.from(keypair.secretKey).toString('hex'),
                publicKey: keypair.publicKey.toBase58()
            };

        } catch (error) {
            this.logger.error('Failed to create Solana wallet', { error: error.message });
            throw error;
        }
    }

    async createEthereumWallet() {
        try {
            if (!this.dependenciesAvailable.bip39 || !this.dependenciesAvailable.wallet) {
                throw new Error('Required Ethereum wallet dependencies not available');
            }

            const bip39 = require('bip39');
            const hdkey = require('ethereumjs-wallet/hdkey');
            
            const mnemonic = bip39.generateMnemonic();
            const seed = await bip39.mnemonicToSeed(mnemonic);
            const hdwallet = hdkey.fromMasterSeed(seed);
            
            const walletHdPath = "m/44'/60'/0'/0/0";
            const wallet = hdwallet.derivePath(walletHdPath).getWallet();
            
            return {
                address: wallet.getAddressString(),
                privateKey: wallet.getPrivateKeyString(),
                publicKey: wallet.getPublicKeyString(),
                mnemonic: mnemonic,
                hdPath: walletHdPath
            };
        } catch (error) {
            this.logger.error('Failed to create Ethereum wallet', { error: error.message });
            throw error;
        }
    }

    // ==================== ENHANCED BALANCE MANAGEMENT ====================

    async getMultiChainBalance(walletId) {
        try {
            const wallet = this.realWallets.get(walletId);
            if (!wallet) {
                throw new Error(`Wallet ${walletId} not found`);
            }

            const balances = {};
            let totalValueUSD = 0;

            // Get Ethereum balance
            if (wallet.wallets.ethereum && this.web3) {
                const ethBalance = await this.getEthereumBalance(wallet.wallets.ethereum.address);
                balances.ethereum = ethBalance;
                
                // Get CoinStats data for better USD valuation
                const coinStatsData = await this.getWalletBalanceFromCoinStats(
                    wallet.wallets.ethereum.address, 
                    'ethereum'
                );
                if (coinStatsData) {
                    totalValueUSD += coinStatsData.valueUSD || 0;
                }
            }

            // Get Solana balance
            if (wallet.wallets.solana && this.solanaConnection) {
                const solBalance = await this.getSolanaBalance(wallet.wallets.solana.address);
                balances.solana = solBalance;
                
                const coinStatsData = await this.getWalletBalanceFromCoinStats(
                    wallet.wallets.solana.address, 
                    'solana'
                );
                if (coinStatsData) {
                    totalValueUSD += coinStatsData.valueUSD || 0;
                }
            }

            wallet.totalValueUSD = totalValueUSD;
            wallet.lastSync = new Date();

            return {
                balances,
                totalValueUSD,
                lastSync: wallet.lastSync
            };

        } catch (error) {
            this.logger.error('Failed to get multi-chain balance', {
                walletId,
                error: error.message
            });
            return { balances: {}, totalValueUSD: 0 };
        }
    }

    async getEthereumBalance(address) {
        try {
            if (!this.web3) return 0;
            
            const validatedAddress = validateAddress(address, 'ethereum');
            const weiBalance = await this.web3.eth.getBalance(validatedAddress);
            return parseFloat(this.web3.utils.fromWei(weiBalance, 'ether'));
            
        } catch (error) {
            this.logger.error('Failed to get Ethereum balance', {
                address,
                error: error.message
            });
            return 0;
        }
    }

    async getSolanaBalance(address) {
        try {
            if (!this.solanaConnection) return 0;
            
            const validatedAddress = validateAddress(address, 'solana');
            const publicKey = new solanaWeb3.PublicKey(validatedAddress);
            const balance = await this.solanaConnection.getBalance(publicKey);
            
            // Convert lamports to SOL
            return balance / solanaWeb3.LAMPORTS_PER_SOL;
            
        } catch (error) {
            this.logger.error('Failed to get Solana balance', {
                address,
                error: error.message
            });
            return 0;
        }
    }

    // ==================== MAIN WALLET MANAGEMENT ====================

    async getRealMainWalletBalance() {
        try {
            const mainWallet = this.config.mainWallet;
            const balances = {};

            // Get Ethereum main wallet balance
            if (mainWallet.ethereum.address && this.web3) {
                const ethBalance = await this.ethereumCircuitBreaker.execute(async () => {
                    return await withRetry(async () => {
                        const address = validateAddress(mainWallet.ethereum.address, 'ethereum');
                        const weiBalance = await this.web3.eth.getBalance(address);
                        return parseFloat(this.web3.utils.fromWei(weiBalance, 'ether'));
                    }, 3, 2000);
                });
                
                balances.ethereum = ethBalance;
                mainWallet.realBalances.ethereum = ethBalance;
            }

            // Get Solana main wallet balance
            if (mainWallet.solana.address && this.solanaConnection) {
                const solBalance = await this.solanaCircuitBreaker.execute(async () => {
                    return await withRetry(async () => {
                        const address = validateAddress(mainWallet.solana.address, 'solana');
                        const publicKey = new solanaWeb3.PublicKey(address);
                        const balance = await this.solanaConnection.getBalance(publicKey);
                        return balance / solanaWeb3.LAMPORTS_PER_SOL;
                    }, 3, 2000);
                });
                
                balances.solana = solBalance;
                mainWallet.realBalances.solana = solBalance;
            }

            // Sync with CoinStats
            await this.syncMainWalletWithCoinStats();

            this.logger.info('Main wallet balances updated', balances);
            return balances;

        } catch (error) {
            this.logger.error('Failed to get main wallet balance', { 
                error: error.message 
            });
            return { ethereum: 0, solana: 0, bitcoin: 0 };
        }
    }

    async syncMainWalletWithCoinStats() {
        try {
            const mainWallet = this.config.mainWallet;

            // Sync Ethereum wallet
            if (mainWallet.ethereum.address) {
                await this.getWalletBalanceFromCoinStats(
                    mainWallet.ethereum.address,
                    'ethereum'
                );
            }

            // Sync Solana wallet
            if (mainWallet.solana.address) {
                await this.getWalletBalanceFromCoinStats(
                    mainWallet.solana.address,
                    'solana'
                );
            }

        } catch (error) {
            this.logger.error('Failed to sync main wallet with CoinStats', { 
                error: error.message 
            });
        }
    }

    // ==================== PORTFOLIO SYNC SYSTEM ====================

    async startPortfolioSync() {
        if (!this.config.coinStats.autoSync) {
            this.logger.info('Portfolio auto-sync disabled');
            return;
        }

        try {
            this.logger.info('Starting portfolio sync system', {
                interval: this.config.coinStats.syncInterval
            });

            // Initial sync
            await this.syncPortfolioWithCoinStats();

            // Start periodic sync
            this.portfolioSyncTimer = setInterval(async () => {
                await this.syncPortfolioWithCoinStats();
                await this.syncMainWalletWithCoinStats();
            }, this.config.coinStats.syncInterval);

            this.emit('portfolio-sync-started');

        } catch (error) {
            this.logger.error('Failed to start portfolio sync', { error: error.message });
        }
    }

    // ==================== AUTO TRANSFER SYSTEM ====================

    async startRealAutoTransferSystem() {
        const mainWallet = this.config.mainWallet;
        
        if (!mainWallet.autoTransferEnabled) {
            console.log('📴 REAL AUTO TRANSFER: System disabled');
            return;
        }

        try {
            console.log(`🔄 REAL AUTO TRANSFER: Starting multi-chain system`);
            
            this.autoTransferTimer = setInterval(async () => {
                await this.executeRealAutoTransfer();
            }, mainWallet.transferInterval);

            this.walletMonitor = setInterval(async () => {
                await this.monitorRealMainWallet();
            }, 60000);

            console.log(`✅ REAL AUTO TRANSFER: Multi-chain system active`);
            this.emit('real-auto-transfer-started', mainWallet);

        } catch (error) {
            console.error('❌ REAL AUTO TRANSFER: Failed to start:', error);
            throw error;
        }
    }

    async executeRealAutoTransfer() {
        try {
            const balances = await this.getRealMainWalletBalance();
            const mainWallet = this.config.mainWallet;
            
            // Execute transfers for each chain
            if (balances.ethereum > 0.001) {
                const transferAmount = balances.ethereum * mainWallet.transferPercentage;
                if (transferAmount > 0.00001) {
                    await this.executeEthereumTransfer(transferAmount);
                }
            }

            if (balances.solana > 0.001) {
                const transferAmount = balances.solana * mainWallet.transferPercentage;
                if (transferAmount > 0.00001) {
                    await this.executeSolanaTransfer(transferAmount);
                }
            }

            mainWallet.lastTransferTime = new Date();
            this.emit('multi-chain-transfer-completed', balances);

        } catch (error) {
            this.logger.error('Multi-chain auto transfer failed', { error: error.message });
        }
    }

    async executeEthereumTransfer(amount) {
        try {
            if (!this.web3 || !this.config.mainWallet.ethereum.privateKey) {
                throw new Error('Ethereum connection or private key not available');
            }

            const account = this.web3.eth.accounts.privateKeyToAccount(
                this.config.mainWallet.ethereum.privateKey
            );
            
            const gasPrice = await this.web3.eth.getGasPrice();
            const nonce = await this.web3.eth.getTransactionCount(
                this.config.mainWallet.ethereum.address
            );

            const tx = {
                from: this.config.mainWallet.ethereum.address,
                to: this.config.mainWallet.ethereum.address,
                value: this.web3.utils.toWei(amount.toString(), 'ether'),
                gas: 21000,
                gasPrice: gasPrice,
                nonce: nonce,
                data: this.web3.utils.toHex('AUTO_TRANSFER_ETHEREUM')
            };

            const signedTx = await this.web3.eth.accounts.signTransaction(
                tx, 
                this.config.mainWallet.ethereum.privateKey
            );
            
            const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            
            this.logger.info('Ethereum auto transfer completed', {
                amount,
                txHash: receipt.transactionHash
            });

            return receipt.transactionHash;

        } catch (error) {
            this.logger.error('Ethereum transfer failed', { error: error.message });
            throw error;
        }
    }

    async executeSolanaTransfer(amount) {
        try {
            if (!this.solanaConnection || !this.config.mainWallet.solana.privateKey) {
                throw new Error('Solana connection or private key not available');
            }

            const fromKeypair = solanaWeb3.Keypair.fromSecretKey(
                Buffer.from(this.config.mainWallet.solana.privateKey, 'hex')
            );

            const transaction = new solanaWeb3.Transaction().add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: fromKeypair.publicKey,
                    toPubkey: fromKeypair.publicKey, // Self-transfer
                    lamports: amount * solanaWeb3.LAMPORTS_PER_SOL,
                })
            );

            const signature = await solanaWeb3.sendAndConfirmTransaction(
                this.solanaConnection,
                transaction,
                [fromKeypair]
            );

            this.logger.info('Solana auto transfer completed', {
                amount,
                signature
            });

            return signature;

        } catch (error) {
            this.logger.error('Solana transfer failed', { error: error.message });
            throw error;
        }
    }

    async monitorRealMainWallet() {
        try {
            const balances = await this.getRealMainWalletBalance();
            
            this.emit('main-wallet-status', {
                balances,
                totalValueUSD: this.getTotalPortfolioValueUSD(),
                lastUpdate: new Date()
            });

        } catch (error) {
            this.logger.error('Main wallet monitoring error', { error: error.message });
        }
    }

    // ==================== PORTFOLIO ANALYTICS ====================

    getTotalPortfolioValueUSD() {
        let totalValue = 0;
        
        for (const [key, holding] of this.holdingsData) {
            totalValue += holding.valueUSD || 0;
        }
        
        const portfolioData = this.portfolioData.get('coinstats');
        if (portfolioData) {
            totalValue += portfolioData.totalValueUSD || 0;
        }
        
        return totalValue;
    }

    getPortfolioSummary() {
        return {
            totalValueUSD: this.getTotalPortfolioValueUSD(),
            walletCount: this.realWallets.size,
            lastSync: this.portfolioData.get('coinstats')?.lastSync || null,
            networks: {
                ethereum: !!this.web3,
                solana: !!this.solanaConnection,
                bitcoin: !!this.bitcoinClient
            },
            mainWalletBalances: this.config.mainWallet.realBalances
        };
    }

    // ==================== DATA MANAGEMENT ====================

    async saveRealWalletData(wallet) {
        const walletDir = path.join(__dirname, 'real_wallets');
        const walletPath = path.join(walletDir, `${wallet.id}.json`);
        
        try {
            await fs.mkdir(walletDir, { recursive: true });
            
            const walletData = {
                ...wallet,
                // Don't encrypt multi-chain wallet structure, just individual keys
                wallets: Object.fromEntries(
                    Object.entries(wallet.wallets || {}).map(([chain, chainWallet]) => [
                        chain,
                        {
                            ...chainWallet,
                            privateKey: this.encryptData(chainWallet.privateKey),
                            mnemonic: chainWallet.mnemonic ? this.encryptData(chainWallet.mnemonic) : undefined
                        }
                    ])
                )
            };
            
            await fs.writeFile(walletPath, JSON.stringify(walletData, null, 2));
        } catch (error) {
            console.error('Failed to save real wallet data:', error);
        }
    }

    encryptData(data) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync('enhanced-crypto-manager-secret', 'salt', 32);
        const iv = crypto.randomBytes(16);
        
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    decryptData(encryptedData) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync('enhanced-crypto-manager-secret', 'salt', 32);
            
            const [ivHex, encrypted] = encryptedData.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Failed to decrypt data:', error);
            return null;
        }
    }

    // ==================== SYSTEM STATUS & CONTROL ====================

    getRealSystemStatus() {
        return {
            isActive: this.isActive,
            connections: {
                ethereum: !!this.web3,
                solana: !!this.solanaConnection,
                binance: !!this.binanceClient,
                coinStats: this.coinStats !== null
            },
            wallets: {
                total: this.realWallets.size,
                multiChain: Array.from(this.realWallets.values()).filter(w => w.wallets).length
            },
            portfolio: {
                totalValueUSD: this.getTotalPortfolioValueUSD(),
                lastSync: this.portfolioData.get('coinstats')?.lastSync || null,
                autoSync: !!this.portfolioSyncTimer
            },
            mainWallet: {
                addresses: {
                    ethereum: this.config.mainWallet.ethereum.address,
                    solana: this.config.mainWallet.solana.address
                },
                balances: this.config.mainWallet.realBalances,
                autoTransferActive: !!this.autoTransferTimer
            }
        };
    }

    async initializeRealWallets() {
        console.log('💳 Initializing enhanced wallet system...');
        
        // Create multi-chain wallet if none exist
        if (this.realWallets.size === 0) {
            try {
                await this.createMultiChainWallet();
            } catch (error) {
                console.warn('Failed to create initial multi-chain wallet:', error.message);
            }
        }
    }

    async stopRealSystems() {
        console.log('🛑 ENHANCED CRYPTO MANAGER: Stopping all systems...');
        
        // Stop timers
        if (this.autoTransferTimer) {
            clearInterval(this.autoTransferTimer);
            this.autoTransferTimer = null;
        }
        
        if (this.walletMonitor) {
            clearInterval(this.walletMonitor);
            this.walletMonitor = null;
        }
        
        if (this.portfolioSyncTimer) {
            clearInterval(this.portfolioSyncTimer);
            this.portfolioSyncTimer = null;
        }
        
        this.isActive = false;
        this.emit('enhanced-systems-stopped');
        console.log('✅ ENHANCED CRYPTO MANAGER: All systems stopped');
    }
}

module.exports = EnhancedCryptoManager;
