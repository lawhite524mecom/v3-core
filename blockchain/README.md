# 🌐 Unified Blockchain System

**59 Alchemy Networks | Multi-Chain Portfolio | Real-Time Monitoring**

## Quick Start
```bash
npm install
npm run blockchain:init
npm run blockchain:dashboard
```

## Features
- 59 blockchain networks supported
- Multi-chain wallet management
- Real-time portfolio tracking
- Circuit breaker protection
- Web dashboard interface

## API Configuration
Alchemy API Key: `44dSO41R6RzBr6Fe0GsUs`

## Documentation
See `docs/UNIFIED_BLOCKCHAIN_SYSTEM_DOCUMENTATION.md` for complete documentation.

## File Structure
```
blockchain/
├── config/
│   └── crypto-config.json          # Network configurations
├── managers/
│   ├── multi-chain-crypto-manager.js   # Primary system orchestrator
│   └── enhanced-crypto-manager.js      # Legacy enhanced manager
├── dashboard/
│   └── unified-blockchain-dashboard.html   # Web interface
├── docs/
│   └── UNIFIED_BLOCKCHAIN_SYSTEM_DOCUMENTATION.md
├── wallets/                         # Encrypted wallet storage (created at runtime)
├── logs/                           # System logs (created at runtime)
└── test/                           # Test files
```

## Environment Variables
```bash
ALCHEMY_API_KEY=44dSO41R6RzBr6Fe0GsUs
NODE_ENV=production
ENCRYPTION_SECRET=your_encryption_secret
```

## System Status
- ✅ 59 Alchemy networks configured
- ✅ Multi-chain wallet support
- ✅ Real-time monitoring active
- ✅ Circuit breaker protection enabled
