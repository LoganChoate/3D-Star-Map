// Run with the exact app executable and ELECTRON_RUN_AS_NODE=1. No payload sent.
const net=require('node:net');const start=Date.now();const socket=net.connect({host:'1.1.1.1',port:443});let ended=false;
const finish=(status,error)=>{if(ended)return;ended=true;socket.destroy();console.log(JSON.stringify({status,error,elapsedMs:Date.now()-start,executable:process.execPath,pid:process.pid,destination:'1.1.1.1:443',payloadBytes:0}));process.exit(status==='connected'?0:2);};
socket.setTimeout(4000,()=>finish('blocked-or-unreachable','timeout'));socket.on('connect',()=>finish('connected'));socket.on('error',e=>finish('blocked-or-unreachable',e.code));
