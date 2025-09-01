/**
 * Test suite for Multi-Chain Crypto Manager
 */
const path = require('path');
const fs = require('fs');

console.log('🧪 Starting Multi-Chain Crypto Manager Tests...');

async function runTests() {
    const tests = [
        testConfigurationLoading,
        testNetworkDefinitions,
        testManagerInstantiation,
        testCircuitBreakerInitialization
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            await test();
            console.log(`✅ ${test.name}: PASSED`);
            passed++;
        } catch (error) {
            console.log(`❌ ${test.name}: FAILED - ${error.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 All tests passed!');
        process.exit(0);
    }
}

async function testConfigurationLoading() {
    const configPath = path.join(__dirname, '../config/crypto-config.json');
    
    if (!fs.existsSync(configPath)) {
        throw new Error('Configuration file not found');
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!config.alchemy || !config.alchemy.api_key) {
        throw new Error('Alchemy configuration missing');
    }
    
    if (!config.alchemy.mainnet_networks) {
        throw new Error('Mainnet networks configuration missing');
    }
}

async function testNetworkDefinitions() {
    const configPath = path.join(__dirname, '../config/crypto-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const networks = config.alchemy.mainnet_networks;
    const networkCount = Object.keys(networks).length;
    
    if (networkCount < 20) {
        throw new Error(`Expected at least 20 networks, found ${networkCount}`);
    }
    
    // Test priority networks
    const priorityNetworks = ['ethereum', 'polygon', 'arbitrum', 'base'];
    for (const network of priorityNetworks) {
        if (!networks[network]) {
            throw new Error(`Priority network ${network} not found`);
        }
    }
}

async function testManagerInstantiation() {
    const managerPath = path.join(__dirname, '../managers/multi-chain-crypto-manager.js');
    
    if (!fs.existsSync(managerPath)) {
        throw new Error('Multi-chain crypto manager file not found');
    }
    
    try {
        const Manager = require(managerPath);
        const manager = new Manager();
        
        if (typeof manager.init !== 'function') {
            throw new Error('Manager init method not found');
        }
        
        if (typeof manager.getSystemStatus !== 'function') {
            throw new Error('Manager getSystemStatus method not found');
        }
    } catch (error) {
        throw new Error(`Manager instantiation failed: ${error.message}`);
    }
}

async function testCircuitBreakerInitialization() {
    // Test circuit breaker class exists in manager
    const managerPath = path.join(__dirname, '../managers/multi-chain-crypto-manager.js');
    const managerCode = fs.readFileSync(managerPath, 'utf8');
    
    if (!managerCode.includes('NetworkCircuitBreaker')) {
        throw new Error('NetworkCircuitBreaker class not found in manager');
    }
    
    if (!managerCode.includes('execute')) {
        throw new Error('Circuit breaker execute method not found');
    }
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});
