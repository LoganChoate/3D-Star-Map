// Read-only startup observer, injected into the main world before page modules.
// It adds timing wrappers, not application behavior or alternate data.
const {webFrame}=require('electron');
function installStartupObserver(){
  const trace={installedAt:performance.now(),timeOrigin:performance.timeOrigin,enabled:true,hooks:{},calls:[],console:[],longTasks:[],errors:[]};
  const record=(kind,start,detail={})=>{if(trace.enabled&&trace.calls.length<10000)trace.calls.push({kind,start,duration:performance.now()-start,...detail});};
  function syncMethod(object,key,kind,describe=()=>({})){
    if(!object||typeof object[key]!=='function'){trace.hooks[kind]='unavailable';return;}
    const original=object[key];
    try{object[key]=function(...args){if(!trace.enabled)return original.apply(this,args);const start=performance.now();try{const result=original.apply(this,args);record(kind,start,describe(result,args));return result;}catch(error){record(kind,start,{error:String(error)});throw error;}};trace.hooks[kind]=object[key]!==original?'installed':'not-writable';}
    catch(error){trace.hooks[kind]=String(error);}
  }
  function asyncMethod(object,key,kind,describe=()=>({})){
    if(!object||typeof object[key]!=='function'){trace.hooks[kind]='unavailable';return;}
    const original=object[key];
    try{object[key]=function(...args){if(!trace.enabled)return original.apply(this,args);const start=performance.now(),detail=describe(args);try{return Promise.resolve(original.apply(this,args)).then(value=>{record(kind,start,detail);return value;},error=>{record(kind,start,{...detail,error:String(error)});throw error;});}catch(error){record(kind,start,{...detail,error:String(error)});throw error;}};trace.hooks[kind]=object[key]!==original?'installed':'not-writable';}
    catch(error){trace.hooks[kind]=String(error);}
  }
  // Wrapping the prototype does not instantiate the native synthesis service.
  syncMethod(globalThis.SpeechSynthesis?.prototype,'getVoices','speech.getVoices',result=>({voiceCount:result?.length??null}));
  syncMethod(globalThis.SpeechSynthesis?.prototype,'cancel','speech.cancel');
  try{
    let owner=globalThis,descriptor;while(owner&&!(descriptor=Object.getOwnPropertyDescriptor(owner,'speechSynthesis')))owner=Object.getPrototypeOf(owner);
    if(descriptor?.get&&descriptor.configurable){const get=descriptor.get;Object.defineProperty(owner,'speechSynthesis',{...descriptor,get(){const start=performance.now();try{return get.call(this);}finally{record('speech.getter',start);}}});trace.hooks['speech.getter']='installed';}
    else trace.hooks['speech.getter']='descriptor-unavailable-or-fixed';
  }catch(error){trace.hooks['speech.getter']=String(error);}
  asyncMethod(globalThis,'fetch','fetch',args=>({url:String(args[0])}));
  asyncMethod(globalThis.Response?.prototype,'arrayBuffer','response.arrayBuffer');
  asyncMethod(globalThis.Response?.prototype,'json','response.json');
  asyncMethod(globalThis.crypto?.subtle,'digest','crypto.digest',args=>({algorithm:String(args[0]),bytes:args[1]?.byteLength??null}));
  syncMethod(JSON,'parse','JSON.parse',(_value,args)=>({inputCharacters:typeof args[0]==='string'?args[0].length:null}));
  const log=console.log;console.log=function(...args){if(trace.enabled)trace.console.push({at:performance.now(),message:args.map(v=>typeof v==='string'?v:typeof v==='number'?String(v):'[object]').join(' ').slice(0,1000)});return log.apply(this,args);};
  try{const observer=new PerformanceObserver(list=>{if(trace.enabled)for(const entry of list.getEntries())trace.longTasks.push({start:entry.startTime,duration:entry.duration,name:entry.name});});observer.observe({type:'longtask',buffered:true});trace.hooks.longTasks='installed';}catch(error){trace.hooks.longTasks=String(error);}
  trace.finish=()=>{trace.enabled=false;return {installedAt:trace.installedAt,timeOrigin:trace.timeOrigin,finishedAt:performance.now(),hooks:trace.hooks,calls:trace.calls,console:trace.console,longTasks:trace.longTasks,errors:trace.errors,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,initiatorType:e.initiatorType,startTime:e.startTime,duration:e.duration,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize})),navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON())};};
  Object.defineProperty(globalThis,'__phase6StartupTrace',{value:trace,configurable:true});
}
webFrame.executeJavaScript('('+installStartupObserver.toString()+')()',false).catch(error=>console.error('STARTUP_OBSERVER_FAILED '+String(error)));
