// Real assertion library; no copied application logic or global DOM substitutes.
const assert = require('node:assert/strict');
class TestRunner {
    constructor() { this.tests = []; }
    test(name, fn) { this.tests.push({name, fn}); }
    describe(_name, fn) { fn(); }
    assert(value, message) { assert.ok(value, message); }
    assertEqual(actual, expected, message) { assert.equal(actual, expected, message); }
    assertDeepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); }
    assertThrows(fn, message) { assert.throws(fn, undefined, message); }
    async run({setExitCode = true, quiet = false} = {}) {
        const cases = [];
        for (const {name, fn} of this.tests) {
            try { await fn(); cases.push({name, status:'passed'}); }
            catch (error) { cases.push({name, status:'failed', error:error.stack || String(error)}); }
        }
        const failed = cases.filter(test => test.status === 'failed').length;
        const result = {status:failed || !cases.length ? 'failed' : 'passed', total:cases.length, passed:cases.length-failed, failed, cases};
        if (!cases.length) result.error = 'No tests registered';
        if (setExitCode && result.status === 'failed') process.exitCode = 1;
        if (!quiet) console.log(JSON.stringify(result));
        return result;
    }
}
const runner = new TestRunner();
for (const method of ['test','describe','assert','assertEqual','assertDeepEqual','assertThrows']) global[method] = runner[method].bind(runner);
module.exports = runner;
module.exports.TestRunner = TestRunner;
