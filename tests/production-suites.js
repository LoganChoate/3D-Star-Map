import {BinaryHeap,PathfindingPriorityQueue} from '../utils/BinaryHeap.js';
import {Box3D,Octree} from '../utils/SpatialIndex.js';
import {filterStars} from '../utils/StarFilters.js';
import {buildStarIndex} from '../utils/StarIdentity.js';
import {StarLookup,normalizeStarName} from '../utils/StarLookup.js';
import {RouteManager} from '../modules/RouteManager.js';
import {Scene} from '../vendor/three/build/three.module.js';

// Synthetic inputs exercise the actual shipped modules. Expected results are
// small explicit fixtures; no pathfinder, filter or spatial index is reimplemented.
const cases=[];
const chosen=new URL(location.href).searchParams.get('suite')||'all';
const ok=(value,message='Expected truthy value')=>{if(!value)throw Error(message);};
const equal=(actual,expected,message='Values differ')=>{if(actual!==expected)throw Error(`${message}: ${actual} !== ${expected}`);};
const deep=(actual,expected)=>equal(JSON.stringify(actual),JSON.stringify(expected));
const throws=fn=>{let error;try{fn();}catch(caught){error=caught;}ok(error,'Expected operation to throw');};
const ids=stars=>stars.map(s=>s.id);
async function test(suite,name,fn){
    if(chosen!=='all'&&chosen!==suite)return;
    try{await fn();cases.push({suite,name,status:'passed'});}
    catch(error){cases.push({suite,name,status:'failed',error:error.stack||String(error)});}
}
const point=(id,x,y=0,z=0,name=id)=>({id,name,x,y,z,dist:Math.hypot(x,y,z),mag:1,ci:0.6,spect:'G2V',proper:null,relativeRadiusScale:1});
const makeTree=stars=>{const tree=new Octree(new Box3D(0,0,0,20,20,20),2);stars.forEach(star=>ok(tree.insert(star)));return tree;};
const routeErrors=[];
let routeManager;
try {
    await test('pathfinding','Actual binary heap extracts priorities in order',()=>{
        const heap=new BinaryHeap();[7,1,4,1,9,0].forEach(priority=>heap.insert({priority}));
        const values=[];while(!heap.isEmpty())values.push(heap.extractMin().priority);
        deep(values,[0,1,1,4,7,9]);equal(heap.extractMin(),null);
    });
    await test('pathfinding','Actual priority queue distinguishes duplicate names and decreases key',()=>{
        const queue=new PathfindingPriorityQueue();const a=point('fixture:a',0,0,0,'Twin'),b=point('fixture:b',1,0,0,'Twin');
        queue.enqueue(a,5);queue.enqueue(b,3);ok(queue.hasNode(a));ok(queue.hasNode(b));
        ok(queue.updateNodePriority(a,1));equal(queue.getNodePriority(a),1);equal(queue.dequeue(),a);ok(queue.hasNode(b));equal(queue.dequeue(),b);ok(queue.isEmpty());
    });
    await test('octree','Actual octree includes exact sphere boundaries and excludes outside points',()=>{
        const stars=[point('a',0),point('b',1),point('c',1.01),point('d',0,1),point('e',0,0,-1)];
        const tree=makeTree(stars);deep(ids(tree.query({x:0,y:0,z:0},1)).sort(),['a','b','d','e']);
        equal(tree.insert(point('outside',21)),false);equal(tree.insert(point('invalid',NaN)),false);
    });
    await test('octree','Actual octree keeps twenty coincident source identities',()=>{
        const stars=Array.from({length:20},(_,i)=>point(`same:${i}`,1,1,1));
        const tree=makeTree(stars);deep(ids(tree.query({x:1,y:1,z:1},0)).sort(),ids(stars).sort());
    });
    await test('octree','Actual octree rejects invalid capacity',()=>{throws(()=>new Octree(new Box3D(0,0,0,1,1,1),0));});
    await test('octree','Actual subdivision retains boundary points exactly once',()=>{
        const stars=[];for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)for(let z=-2;z<=2;z++)stars.push(point(`${x}:${y}:${z}`,x,y,z));
        const tree=makeTree(stars);const matches=tree.query({x:0,y:0,z:0},20);equal(matches.length,125);equal(new Set(ids(matches)).size,125);
    });
    const filterData=[
        {...point('sol',0),name:'Sol',proper:'Sol',spect:'G2V',relativeRadiusScale:1},
        {...point('hyg:1',1),name:'Named',proper:'Named',spect:'B8V',relativeRadiusScale:3},
        {...point('hyg:2',2),name:'61 Cyg',spect:'K5V',relativeRadiusScale:2},
        {...point('hyg:3',3),name:'HIP 3',spect:null,relativeRadiusScale:0.5},
        {...point('hyg:4',4),name:'Sentinel',proper:'Sentinel',isGarbageSphere:true,dist:100000}
    ];
    await test('filtering','Production filter preserves current geometry order and object identity',()=>{
        const result=filterStars(filterData,{maxDistance:2,maxSize:2});deep(ids(result),['sol','hyg:2']);equal(result[0],filterData[0]);equal(result[1],filterData[2]);equal(filterData.length,5);
    });
    await test('filtering','Size is an upper limit, with inclusive distance and size edges',()=>{deep(ids(filterStars(filterData,{maxDistance:1,maxSize:3})),['sol','hyg:1']);});
    await test('filtering','Named-only uses proper-name metadata, not a catalog label heuristic',()=>{deep(ids(filterStars(filterData,{properNamesOnly:true})),['sol','hyg:1']);});
    await test('filtering','Sentinel inclusion is explicit',()=>{equal(filterStars(filterData).length,4);equal(filterStars(filterData,{includeGarbageSphere:true}).length,5);});
    await test('filtering','Spectral filters normalize case without classifying missing spectra as G',()=>{deep(ids(filterStars(filterData,{spectralClasses:['g']})),['sol']);ok(filterStars(filterData).includes(filterData[3]),'Missing spectrum stays available without a class filter');});
    await test('filtering','Combining filters can legitimately yield an empty geometry',()=>{deep(filterStars(filterData,{maxDistance:0,spectralClasses:['B']}),[]);});

    const twins=[point('hyg:10',0,0,0,'61 Cyg'),point('hyg:11',1,0,0,'61 Cyg'),point('hyg:12',2,0,0,'Sirius')];
    const lookup=new StarLookup(twins,{'sirius':{description:'Sirius text'},'61 cyg':{description:'ambiguous text'}});
    await test('integration','Lookup normalizes case and whitespace without changing identity',()=>{deep(ids(lookup.find('  SIRIUS  ')),['hyg:12']);equal(normalizeStarName('  61\tCYG  '),'61 cyg');deep(ids(lookup.find('HYG:11')),['hyg:11']);});
    await test('integration','Duplicate display-name lookup retains both distinct records',()=>{deep(ids(lookup.find('61 cyg')),['hyg:10','hyg:11']);ok(lookup.label(twins[0]).includes('hyg:10'));ok(lookup.label(twins[1]).includes('hyg:11'));});
    await test('integration','Description case matching works without guessing ambiguous components',()=>{equal(lookup.describe(twins[2]).description,'Sirius text');equal(lookup.describe(twins[0]),null);equal(lookup.describe(twins[1]),null);});
    await test('integration','ID-specific description identifies one member of a duplicate-name pair',()=>{
        const specific=new StarLookup(twins,{'hyg:11':{description:'Component-specific'},'61 cyg':{description:'ambiguous'}});
        equal(specific.describe(twins[1]).description,'Component-specific');equal(specific.describe(twins[0]),null);
    });
    await test('integration','Conflicting normalized descriptions fail closed',()=>{
        const conflict=new StarLookup(twins,{sirius:{description:'one'},SIRIUS:{description:'two'}});equal(conflict.describe(twins[2]),null);
    });
    await test('integration','Identity index rejects duplicate and absent IDs',()=>{throws(()=>buildStarIndex([twins[0],{...twins[1],id:'hyg:10'}]));throws(()=>buildStarIndex([{name:'No id'}]));});
    await test('integration','Catalog has unique source IDs independent of order and display names',async()=>{
        const data=await(await fetch('stars.json')).json();equal(data.length,117735);
        const index=buildStarIndex(data);equal(index.size,117735);equal(index.get('sol').name,'Sol');
        ok(data.every(star=>star.id==='sol'||/^hyg:\d+$/.test(star.id)));
        const duplicate=data.filter(star=>star.name==='61 Cyg');equal(duplicate.length,2);ok(duplicate[0].id!==duplicate[1].id);
        const reversed=buildStarIndex([...duplicate].reverse());equal(reversed.get(duplicate[0].id),duplicate[0]);
    });

    if(chosen==='all'||chosen==='pathfinding') {
        // A real Three scene and viewport exercise the manager's visual cleanup;
        // no route method, worker or pathfinding implementation is replaced.
        routeManager=new RouteManager({scene:new Scene(),renderer:{domElement:{width:800,height:600}}},{showError(message){routeErrors.push(message);},showWarning(message){routeErrors.push(message);}});
        const stars=[point('fixture:a',0,0,0,'Twin'),point('fixture:b',1,0,0,'Twin'),point('fixture:c',2,0,0,'Destination'),point('fixture:isolated',9,0,0,'Destination')];
        routeManager.setData(stars,makeTree(stars));
        await test('pathfinding','Fallback path crosses distinct same-name nodes',()=>{const result=routeManager.findPathAStar(stars[0],stars[2],1.01);ok(result&&!result.stranded);deep(ids(result.path),['fixture:a','fixture:b','fixture:c']);});
        await test('pathfinding','Actual worker agrees with fallback and returns canonical objects',async()=>{
            ok(routeManager.pathfindingWorker,'Production worker is required by this test');
            const result=await routeManager.calculateRouteWithWorker(stars[0],stars[2],1.01);ok(result&&!result.stranded);deep(ids(result.path),['fixture:a','fixture:b','fixture:c']);result.path.forEach(star=>equal(star,stars.find(source=>source.id===star.id)));
        });
        await test('pathfinding','Duplicate-name destination is not mistaken for a reachable different object',async()=>{
            const fallback=routeManager.findPathAStar(stars[0],stars[3],1.01);ok(fallback.stranded);equal(fallback.path.at(-1).id,'fixture:c');
            const worker=await routeManager.calculateRouteWithWorker(stars[0],stars[3],1.01);ok(worker.stranded);deep(ids(worker.path),ids(fallback.path));
        });
        await test('pathfinding','Same ID produces a one-node route in both execution paths',async()=>{
            deep(ids(routeManager.findPathAStar(stars[1],stars[1],1).path),['fixture:b']);deep(ids((await routeManager.calculateRouteWithWorker(stars[1],stars[1],1)).path),['fixture:b']);
        });
        await test('pathfinding','Invalid and unknown route identities are rejected',()=>{
            equal(routeManager.findPathAStar({...stars[0],id:'missing'},stars[2],1),null);equal(routeManager.findPathAStar(stars[0],stars[2],0),null);ok(routeErrors.length>=2);
            throws(()=>routeManager.setData([stars[0],{...stars[1],id:stars[0].id}],makeTree(stars)));
        });
        await test('pathfinding','Coincident records retain distinct route endpoints',async()=>{
            const coincident=[point('fixture:one',0,0,0,'Same'),point('fixture:two',0,0,0,'Same')];
            routeManager.setData(coincident,makeTree(coincident));
            const fallback=routeManager.findPathAStar(coincident[0],coincident[1],1);deep(ids(fallback.path),['fixture:one','fixture:two']);
            const worker=await routeManager.calculateRouteWithWorker(coincident[0],coincident[1],1);deep(ids(worker.path),ids(fallback.path));
        });
        const prepareRoute=()=>{
            routeManager.setData(stars,makeTree(stars));
            routeManager.setActiveRoute(0);
            routeManager.setRouteStart(stars[0]);
            routeManager.setRouteEnd(stars[2]);
            return routeManager.getActiveRoute();
        };
        await test('pathfinding','Manager applies a real worker route and removes obsolete geometry when edited',async()=>{
            const active=prepareRoute();
            const result=await routeManager.calculateRoute(1.01);
            ok(result&&!result.stranded);deep(ids(active.calculatedRoute),['fixture:a','fixture:b','fixture:c']);
            ok(active.routeLine?.isLine2);equal(active.routeArrows.length,2);equal(routeManager.searchBubble,null);
            routeManager.setRouteEnd(stars[1]);
            equal(active.calculatedRoute,null);equal(active.routeLine,null);equal(active.routeArrows.length,0);
            equal(routeManager.starRenderer.scene.children.length,0);
        });
        await test('pathfinding','Pending real worker result cannot overwrite newly selected endpoint',async()=>{
            const active=prepareRoute();
            const pending=routeManager.calculateRoute(1.01);
            equal(routeManager.pendingRequests.size,1,'A real worker request must be pending');
            routeManager.setRouteEnd(stars[1]);
            equal(await pending,null);equal(active.endStar,stars[1]);equal(active.calculatedRoute,null);equal(active.routeLine,null);
            equal(routeManager.pendingRequests.size,0);equal(routeManager.searchBubble,null);equal(routeManager.starRenderer.scene.children.length,0);
        });
        await test('pathfinding','Replacing catalog during a real worker request discards result and search geometry',async()=>{
            const active=prepareRoute();
            const pending=routeManager.calculateRoute(1.01);
            equal(routeManager.pendingRequests.size,1,'A real worker request must be pending');
            const replacement=stars.map(star=>({...star}));
            routeManager.setData(replacement,makeTree(replacement));
            equal(await pending,null);equal(active.startStar,null);equal(active.endStar,null);equal(active.calculatedRoute,null);
            equal(routeManager.starIndex.get(stars[0].id),replacement[0]);equal(routeManager.pendingRequests.size,0);
            equal(routeManager.searchBubble,null);equal(routeManager.starRenderer.scene.children.length,0);
        });
        await test('pathfinding','Unchanged route receives a valid minimum jump range from production calculation',async()=>{
            prepareRoute();
            const range=await routeManager.findMinimumJumpRange(stars[0],stars[2]);
            ok(Number.isFinite(range)&&range>=1&&range<1.2,'Minimum range must retain the known one-unit hops');
            ok(!routeManager.findPathAStar(stars[0],stars[2],range).stranded);equal(routeManager.searchBubble,null);
        });
        await test('pathfinding','Endpoint edit discards a pending minimum-range calculation',async()=>{
            const active=prepareRoute();
            const pending=routeManager.findMinimumJumpRange(stars[0],stars[2]);
            routeManager.setRouteEnd(stars[1]);
            equal(await pending,null);equal(active.endStar,stars[1]);equal(routeManager.searchBubble,null);
        });
        await test('pathfinding','Switching active route discards a pending minimum-range calculation',async()=>{
            prepareRoute();
            const pending=routeManager.findMinimumJumpRange(stars[0],stars[2]);
            routeManager.setActiveRoute(1);
            equal(await pending,null);equal(routeManager.routePlanner.activeRouteIndex,1);equal(routeManager.searchBubble,null);
        });
        await test('pathfinding','Catalog replacement discards a pending minimum-range calculation',async()=>{
            prepareRoute();
            const pending=routeManager.findMinimumJumpRange(stars[0],stars[2]);
            routeManager.setData(stars.map(star=>({...star})),makeTree(stars));
            equal(await pending,null);equal(routeManager.getActiveRoute().calculatedRoute,null);equal(routeManager.searchBubble,null);
        });
        await test('pathfinding','Real worker catalog rejection preserves its cause and rejects pending routes',async()=>{
            const warnings=[];
            const invalidManager=new RouteManager(null,{showWarning(message){warnings.push(message);}});
            try {
                ok(invalidManager.pathfindingWorker,'Production worker is required by this test');
                // Valid IDs with intentionally insufficient bounds exercise the
                // real worker's insert check and manager's initialization reply.
                invalidManager.setData(stars,new Octree(new Box3D(0,0,0,0.5,0.5,0.5),2));
                const outcome=await invalidManager.calculateRouteWithWorker(stars[0],stars[2],1.01)
                    .then(result=>({result}),error=>({error}));
                equal(outcome.error?.message,'Pathfinding catalog rejected: Star fixture:b has invalid or out-of-bounds coordinates');
                equal(invalidManager.pathfindingWorker,null);equal(invalidManager.workerInitialized,false);
                equal(invalidManager.pendingRequests.size,0);equal(invalidManager.workerDataMessageId,null);
                ok(warnings.some(message=>message.includes('using fallback mode')));
            } finally { invalidManager.pathfindingWorker?.terminate(); }
        });
    }
} catch(error) {cases.push({suite:'setup',name:'Production fixture setup',status:'failed',error:error.stack||String(error)});}
finally {
    routeManager?.dispose();
    routeManager?.pathfindingWorker?.terminate();
    const failed=cases.filter(test=>test.status==='failed').length;
    window.testResult={status:!failed&&cases.length?'passed':'failed',scope:'Imports production SpatialIndex, StarFilters, StarIdentity, StarLookup, BinaryHeap, RouteManager and executes the actual pathfinding worker',total:cases.length,passed:cases.length-failed,failed,cases};
}
