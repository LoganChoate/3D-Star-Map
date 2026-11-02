const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname,'../.runtime');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'production-module-profile'));
let done=false;
const finish=(result)=>{
    if(done)return;done=true;clearTimeout(timeout);
    const suite=process.argv.find(arg=>arg.startsWith('--suite='))?.slice(8)||'all';
    const evidence=path.join(output,`production-${suite}-results.json`);
    fs.writeFileSync(evidence,JSON.stringify(result,null,2));
    console.log(JSON.stringify({evidence,...result}));app.exit(result.status==='passed'?0:1);
};
const timeout=setTimeout(()=>finish({status:'failed',error:'Production module tests timed out'}),60000);
process.on('uncaughtException',error=>finish({status:'failed',error:error.stack}));
process.on('unhandledRejection',error=>finish({status:'failed',error:String(error)}));
app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true}});
    win.webContents.on('render-process-gone',(_event,details)=>finish({status:'failed',error:JSON.stringify(details)}));
    const suite=process.argv.find(arg=>arg.startsWith('--suite='))?.slice(8)||'all';
    await win.loadFile(path.join(__dirname,'production-modules.html'),{query:{suite}});
    const result=await win.webContents.executeJavaScript(`new Promise(resolve=>{const poll=setInterval(()=>{if(window.testResult){clearInterval(poll);resolve(window.testResult);}},25);})`);
    finish(result);
}).catch(error=>finish({status:'failed',error:error.stack}));
