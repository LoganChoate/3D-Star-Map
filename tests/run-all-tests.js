// Exit status is authoritative; pass text cannot hide failed/missing processes.
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function runSuite(suite, {timeoutMs = 90000} = {}) {
    return new Promise(resolve => {
        if (!suite.script || !fs.existsSync(suite.script)) return resolve({name:suite.name,status:'failed',error:'Required suite is missing',exitCode:null});
        let output = '', errors = '', finished = false, timer;
        const finish = result => { if (finished) return; finished = true; clearTimeout(timer); resolve({name:suite.name,...result,output,stderr:errors}); };
        const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(suite.command || process.execPath, [suite.script, ...(suite.args || [])], {cwd:root, env, windowsHide:true, stdio:['ignore','pipe','pipe']});
        timer = setTimeout(() => { child.kill(); finish({status:'failed',exitCode:null,error:'Suite timed out'}); }, timeoutMs);
        child.stdout.on('data', value => { output += value; });
        child.stderr.on('data', value => { errors += value; });
        child.once('error', error => finish({status:'failed',exitCode:null,error:error.message}));
        child.once('close', (code, signal) => finish({status:code === 0 && !signal ? 'passed':'failed',exitCode:code,signal}));
    });
}
async function runSuites(suites, options = {}) {
    const results = [];
    for (const suite of suites) results.push(await runSuite(suite,options));
    return {status:results.length && results.every(r=>r.status==='passed') ? 'passed':'failed',suites:results};
}
async function main() {
    const electron = require('electron');
    const suites = [
        {name:'Assertion and process failure controls',script:path.join(__dirname,'runner-regression.cjs')},
        {name:'Production modules and real worker',command:electron,script:path.join(__dirname,'production-modules.cjs')},
        {name:'Exploration catalog and distance mathematics',script:path.join(__dirname,'exploration-math.cjs')},
        {name:'Measured nearby collection and stable identities',script:path.join(__dirname,'nearby-catalog.cjs')},
        {name:'Scientific catalog pipeline and quality policy',script:path.join(__dirname,'scientific-pipeline.cjs')},
        {name:'Bundled assets',script:path.join(__dirname,'offline-assets.cjs')},
        {name:'Production shader GPU pixels',command:electron,script:path.join(__dirname,'marker-rendering.cjs')}
    ];
    const result = await runSuites(suites);
    const output = path.join(root,'.runtime','test-suite-results.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(result,null,2));
    for (const suite of result.suites) console.log(`${suite.status.toUpperCase()}: ${suite.name}${suite.error ? ': '+suite.error : ''}`);
    console.log(JSON.stringify({status:result.status,suites:result.suites.length,evidence:output}));
    if (result.status !== 'passed') {
        for (const suite of result.suites.filter(s=>s.status==='failed')) console.error(suite.output, suite.stderr);
        process.exitCode = 1;
    }
}
module.exports = {runSuite,runSuites};
if (require.main === module) main().catch(error => {console.error(error);process.exitCode=1;});
