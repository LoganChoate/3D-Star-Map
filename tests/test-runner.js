// Simple test runner for 3D Star Map Explorer
// Uses Node.js built-in capabilities for lightweight testing

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.startTime = null;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    describe(suiteName, fn) {
        console.log(`\n📝 ${suiteName}`);
        console.log('='.repeat(50));
        fn();
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    }

    assertEqual(actual, expected, message) {
        if (actual !== expected) {
            throw new Error(message || `Expected ${expected}, got ${actual}`);
        }
    }

    assertDeepEqual(actual, expected, message) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
    }

    assertThrows(fn, message) {
        try {
            fn();
            throw new Error(message || 'Expected function to throw an error');
        } catch (error) {
            // Expected behavior
        }
    }

    async run() {
        this.startTime = Date.now();
        console.log(`🚀 Running ${this.tests.length} tests...\n`);

        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.name}`);
                console.log(`   Error: ${error.message}`);
                if (error.stack) {
                    console.log(`   Stack: ${error.stack.split('\n')[1]?.trim()}`);
                }
                this.failed++;
            }
        }

        this.printSummary();
    }

    printSummary() {
        const duration = Date.now() - this.startTime;
        const total = this.passed + this.failed;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 Test Summary');
        console.log('='.repeat(50));
        console.log(`Total: ${total}`);
        console.log(`✅ Passed: ${this.passed}`);
        console.log(`❌ Failed: ${this.failed}`);
        console.log(`⏱️  Duration: ${duration}ms`);
        
        if (this.failed === 0) {
            console.log('\n🎉 All tests passed!');
        } else {
            console.log(`\n💥 ${this.failed} test(s) failed.`);
            process.exit(1);
        }
    }
}

// Global test instance
const runner = new TestRunner();

// Export test functions
global.test = (name, fn) => runner.test(name, fn);
global.describe = (name, fn) => runner.describe(name, fn);
global.assert = (condition, message) => runner.assert(condition, message);
global.assertEqual = (actual, expected, message) => runner.assertEqual(actual, expected, message);
global.assertDeepEqual = (actual, expected, message) => runner.assertDeepEqual(actual, expected, message);
global.assertThrows = (fn, message) => runner.assertThrows(fn, message);

// Mock DOM globals for Node.js environment
global.window = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    location: { hostname: 'localhost' }
};

global.document = {
    getElementById: () => null,
    createElement: () => ({}),
    addEventListener: () => {},
    querySelectorAll: () => []
};

global.speechSynthesis = {
    cancel: () => {},
    speak: () => {},
    paused: false
};

global.console.warn = global.console.warn || global.console.log;
global.console.error = global.console.error || global.console.log;

module.exports = runner;