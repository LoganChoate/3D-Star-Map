#!/usr/bin/env node

// Test runner that executes all test suites
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
    'pathfinding.test.js',
    'octree.test.js', 
    'filtering.test.js',
    'integration.test.js'
];

class TestSuiteRunner {
    constructor() {
        this.totalTests = 0;
        this.totalPassed = 0;
        this.totalFailed = 0;
        this.totalDuration = 0;
        this.results = [];
        this.startTime = Date.now();
    }

    async runAllTests() {
        console.log('🚀 3D Star Map Explorer - Test Suite');
        console.log('=' .repeat(50));
        console.log(`Running ${testFiles.length} test suites...\n`);

        for (const testFile of testFiles) {
            const testPath = path.join(__dirname, testFile);
            
            if (!fs.existsSync(testPath)) {
                console.log(`❌ Test file not found: ${testFile}`);
                continue;
            }

            console.log(`📋 Running ${testFile}...`);
            const result = await this.runSingleTest(testPath);
            this.results.push({ file: testFile, ...result });
            
            this.totalTests += result.total || 0;
            this.totalPassed += result.passed || 0;
            this.totalFailed += result.failed || 0;
            this.totalDuration += result.duration || 0;
            
            console.log('');
        }

        this.printSummary();
    }

    runSingleTest(testPath) {
        return new Promise((resolve) => {
            const child = spawn('node', [testPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(testPath)
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                // Parse test results from output
                const result = this.parseTestOutput(stdout, stderr, code);
                
                // Print condensed results
                if (result.failed === 0) {
                    console.log(`✅ ${result.passed}/${result.total} tests passed (${result.duration}ms)`);
                } else {
                    console.log(`❌ ${result.passed}/${result.total} tests passed, ${result.failed} failed (${result.duration}ms)`);
                    if (result.failures.length > 0) {
                        console.log('   Failures:');
                        result.failures.forEach(failure => {
                            console.log(`   - ${failure}`);
                        });
                    }
                }

                resolve(result);
            });

            child.on('error', (error) => {
                console.log(`❌ Error running ${path.basename(testPath)}: ${error.message}`);
                resolve({ total: 0, passed: 0, failed: 1, duration: 0, failures: [error.message] });
            });
        });
    }

    parseTestOutput(stdout, stderr, exitCode) {
        const result = {
            total: 0,
            passed: 0,
            failed: 0,
            duration: 0,
            failures: [],
            success: exitCode === 0
        };

        try {
            // Extract test summary from output
            const totalMatch = stdout.match(/Total: (\d+)/);
            const passedMatch = stdout.match(/Passed: (\d+)/);
            const failedMatch = stdout.match(/Failed: (\d+)/);
            const durationMatch = stdout.match(/Duration: (\d+)ms/);

            if (totalMatch) result.total = parseInt(totalMatch[1]);
            if (passedMatch) result.passed = parseInt(passedMatch[1]);
            if (failedMatch) result.failed = parseInt(failedMatch[1]);
            if (durationMatch) result.duration = parseInt(durationMatch[1]);

            // Extract failure messages
            const lines = stdout.split('\n');
            let inFailureSection = false;
            
            for (const line of lines) {
                if (line.includes('❌')) {
                    const failureMatch = line.match(/❌\s+(.+)/);
                    if (failureMatch) {
                        result.failures.push(failureMatch[1]);
                    }
                }
            }

            // If we couldn't parse the output, but exit code indicates failure
            if (result.total === 0 && !result.success) {
                result.failed = 1;
                result.failures.push('Test suite failed to run properly');
            }

        } catch (error) {
            console.warn('Failed to parse test output:', error.message);
            result.failed = 1;
            result.failures.push('Failed to parse test results');
        }

        return result;
    }

    printSummary() {
        const overallDuration = Date.now() - this.startTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 Overall Test Summary');
        console.log('='.repeat(60));
        
        console.log(`Test Suites: ${this.results.length}`);
        console.log(`Total Tests: ${this.totalTests}`);
        console.log(`✅ Passed: ${this.totalPassed}`);
        console.log(`❌ Failed: ${this.totalFailed}`);
        console.log(`⏱️  Total Duration: ${overallDuration}ms`);
        
        console.log('\nSuite Breakdown:');
        this.results.forEach(result => {
            const status = result.failed === 0 ? '✅' : '❌';
            console.log(`  ${status} ${result.file}: ${result.passed}/${result.total} (${result.duration}ms)`);
        });

        if (this.totalFailed === 0) {
            console.log('\n🎉 All tests passed!');
            console.log('✨ Code quality checks complete - ready for production!');
        } else {
            console.log(`\n💥 ${this.totalFailed} test(s) failed across all suites.`);
            console.log('🔧 Please fix failing tests before proceeding.');
        }

        // Set exit code based on test results
        process.exit(this.totalFailed > 0 ? 1 : 0);
    }
}

// Run the test suite
if (require.main === module) {
    const runner = new TestSuiteRunner();
    runner.runAllTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = TestSuiteRunner;