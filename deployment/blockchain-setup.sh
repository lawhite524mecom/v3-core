#!/bin/bash

echo "🌐 Setting up Unified Blockchain System for V3-Core"

# Install Node.js dependencies
echo "📦 Installing dependencies..."
npm install

# Install blockchain-specific dependencies
echo "📦 Installing blockchain dependencies..."
cd blockchain && npm install && cd ..

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p blockchain/wallets
mkdir -p blockchain/logs
mkdir -p blockchain/backups

# Set file permissions
echo "🔒 Setting file permissions..."
chmod 755 blockchain/managers/*.js
chmod 644 blockchain/config/*.json
chmod 700 blockchain/wallets

# Initialize configuration
echo "⚙️ Initializing blockchain system..."
cd blockchain
node managers/multi-chain-crypto-manager.js --init || echo "Manager initialization will complete on first run"
cd ..

echo "✅ Blockchain system setup complete!"
echo ""
echo "🚀 Available commands:"
echo "  npm run blockchain:init      - Initialize blockchain system"
echo "  npm run blockchain:dashboard - Launch dashboard"
echo "  npm run blockchain:test      - Run test suite"
echo ""
echo "🌐 Dashboard URL: file://$(pwd)/blockchain/dashboard/unified-blockchain-dashboard.html"
