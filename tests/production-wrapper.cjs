const {spawnSync} = require('node:child_process');
const path = require('node:path');
module.exports = suite => {
    const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const result=spawnSync(require('electron'),[path.join(__dirname,'production-modules.cjs'),`--suite=${suite}`],{cwd:path.resolve(__dirname,'..'),env,stdio:'inherit',windowsHide:true,timeout:70000});
    if(result.error)console.error(result.error);
    process.exitCode=result.status===0&&!result.error&&!result.signal?0:1;
};
