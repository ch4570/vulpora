'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const COMMON = ' Work directly without delegation or other coding sessions. Do not commit, install dependencies, '
  + 'use the network or perform external writes. Preserve unrelated behavior. Run node --test, inspect your diff, '
  + 'and finish with a concise change summary and test result.';
const HEADER = "'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\n";

function run(cwd, args) {
  const env = {...process.env};
  // Nested verifiers must discover their own tests rather than inherit the
  // outer node:test worker's recursion marker and silently skip execution.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, {cwd, env, encoding:'utf8', timeout:15000, maxBuffer:1024*1024});
}
function verify(cwd, oracle, modulePath, mutations) {
  const tests = run(cwd, ['--test']);
  const correct = run(cwd, ['-e', oracle]);
  const testsPassed = !tests.error && tests.status === 0;
  const oraclePassed = !correct.error && correct.status === 0;
  let mutantChecksPassed = false;
  if (testsPassed && oraclePassed) {
    const targetModule = fs.realpathSync(path.join(cwd,modulePath));
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vulpora-economic-mutants-'));
    try {
      mutantChecksPassed = mutations.every((mutation,index) => {
        const preload = path.join(temp, `mutant-${index}.cjs`);
        fs.writeFileSync(preload, `const M=require('node:module'),load=M._load;
M._load=function(name,parent,main){const value=load.apply(this,arguments);
if(M._resolveFilename(name,parent)===${JSON.stringify(targetModule)}){${mutation}}
return value;};\n`);
        const result = run(cwd, ['--require',preload,'--test']);
        return !result.error && result.status === 1 && /ERR_ASSERTION|AssertionError/.test(result.stdout+result.stderr);
      });
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
  }
  return {testsPassed,oraclePassed,mutantChecksPassed};
}

const cases = [
  {
    id:'positive',
    task:'Add isPositive(value) to src/numbers.js and regression tests to test/numbers.test.js. '
      + 'Return true exactly for finite numeric values strictly greater than zero; reject zero, negatives, NaN, '
      + 'infinities and every non-number. Preserve absolute(value). Only these two files may change.' + COMMON,
    files:{
      'src/numbers.js':"'use strict';\nfunction absolute(value){return value<0?-value:value;}\nmodule.exports={absolute};\n",
      'test/numbers.test.js':HEADER+"const {absolute}=require('../src/numbers.js');\ntest('absolute',()=>assert.equal(absolute(-2),2));\n",
    },
    allowedFiles:['src/numbers.js','test/numbers.test.js'],
    verify(cwd) { return verify(cwd, `const a=require('node:assert/strict'),m=require('./src/numbers.js');
for(const x of [Number.MIN_VALUE,0.1,1,42,Number.MAX_VALUE])a.equal(m.isPositive(x),true);
for(const x of [0,-0,-1,NaN,Infinity,-Infinity,'1',true,false,null,undefined,{},[],1n,Symbol('x'),new Number(1)])a.equal(m.isPositive(x),false);
for(let n=-100;n<=100;n++)a.equal(m.isPositive(n/7),n>0);
a.equal(m.absolute(-2),2);a.equal(m.absolute(0),0);a.equal(m.absolute(3),3);`, 'src/numbers.js',
      ['return {...value,isPositive:()=>true};','return {...value,isPositive:()=>false};']); },
  },
  {
    id:'lru-cache',
    task:'Repair src/lru.js and add regression tests to test/lru.test.js. LRUCache(capacity) must reject '
      + 'non-positive, fractional and non-number capacities with RangeError. set(key,value) stores any JS value '
      + '(including false, 0, empty string, null and undefined), returns this, refreshes recency on insert/update '
      + 'and evicts only the least-recently-used key when capacity is exceeded. get(key) returns the stored value '
      + 'or undefined for a miss, refreshing recency only for a hit. has(key) and size must reflect membership '
      + 'without refreshing recency. Support arbitrary Map keys, including object identity. Updating an existing '
      + 'key must not evict another entry. Only these two files may change.' + COMMON,
    files:{
      'src/lru.js':"'use strict';\nclass LRUCache {\nconstructor(capacity){this.capacity=capacity;this.items=new Map();}\n"
        + "set(key,value){if(this.items.size>=this.capacity)this.items.delete(this.items.keys().next().value);this.items.set(key,value);return this;}\n"
        + "get(key){return this.items.get(key)||undefined;}\nhas(key){return this.items.has(key);}\nget size(){return this.items.size;}\n}\nmodule.exports={LRUCache};\n",
      'test/lru.test.js':HEADER+"const {LRUCache}=require('../src/lru.js');\ntest('stores a value',()=>{const c=new LRUCache(2);c.set('a',1);assert.equal(c.get('a'),1);});\n",
    },
    allowedFiles:['src/lru.js','test/lru.test.js'],
    verify(cwd) { return verify(cwd, `const a=require('node:assert/strict'),{LRUCache}=require('./src/lru.js');
for(const n of [0,-1,1.5,NaN,Infinity,'2',null,undefined,2n])a.throws(()=>new LRUCache(n),RangeError);
for(const v of [false,0,'',null,undefined]){const c=new LRUCache(1);a.equal(c.set('a',v),c);a.equal(c.get('a'),v);a.equal(c.has('a'),true);a.equal(c.size,1);}
const u=new LRUCache(2);u.set('undefined',undefined).set('older',1);a.equal(u.get('undefined'),undefined);u.set('new',2);a.equal(u.has('undefined'),true);a.equal(u.has('older'),false);
const c=new LRUCache(2),obj={};c.set(obj,1).set('b',2);a.equal(c.get(obj),1);c.set('d',3);a.equal(c.has('b'),false);a.equal(c.has(obj),true);a.equal(c.has({}),false);
c.set(obj,4);a.equal(c.size,2);a.equal(c.has('d'),true);c.has('d');c.get('missing');c.set('e',5);a.equal(c.has('d'),false);a.equal(c.get(obj),4);
const r=new Map(),s=new LRUCache(3);for(let i=0;i<80;i++){const k=i%7;if(i%3){const v=i%2?0:i;r.delete(k);r.set(k,v);if(r.size>3)r.delete(r.keys().next().value);s.set(k,v);}else{const v=r.get(k);if(r.has(k)){r.delete(k);r.set(k,v);}a.equal(s.get(k),v);}a.equal(s.size,r.size);for(let j=0;j<7;j++)a.equal(s.has(j),r.has(j));}`, 'src/lru.js',
      ["const Original=value.LRUCache;return {...value,LRUCache:class extends Original{get(key){return super.get(key)||undefined;}}};"]); },
  },
  {
    id:'retry',
    task:'Implement retry behavior across src/retry.js and src/client.js, adding regression tests in test/retry.test.js. '
      + 'Export async retry(operation, options={}) with attempts default 3 (total calls, not retries), shouldRetry '
      + 'default ()=>true, and async wait default no-op. Reject invalid attempts (non-number, non-integer, <=0, '
      + 'non-finite) with RangeError before operation runs. Call operation with a one-based attempt number; return '
      + 'its first successful value unchanged. On failure, if this was the last attempt rethrow the exact error '
      + 'without calling shouldRetry or wait. Otherwise call shouldRetry(error, attempt); if false rethrow the '
      + 'exact error, else await wait(attempt,error) before the next call. Propagate predicate/wait errors and stop. '
      + 'Support synchronous throws and async rejections. In src/client.js, export fetchWithRetry(fetcher, url, options) '
      + 'that uses retry to call fetcher(url), forwarding options; preserve fetchOnce. No real network or timers '
      + 'are needed. Only these three files may change.' + COMMON,
    files:{
      'src/retry.js':"'use strict';\nasync function retry(operation){return operation(1);}\nmodule.exports={retry};\n",
      'src/client.js':"'use strict';\nasync function fetchOnce(fetcher,url){return fetcher(url);}\nmodule.exports={fetchOnce};\n",
      'test/retry.test.js':HEADER+"const {retry}=require('../src/retry.js');\nconst {fetchOnce}=require('../src/client.js');\ntest('immediate success',async()=>assert.equal(await retry(()=>7),7));\ntest('fetchOnce',async()=>assert.equal(await fetchOnce(x=>x,'local'), 'local'));\n",
    },
    allowedFiles:['src/retry.js','src/client.js','test/retry.test.js'],
    verify(cwd) { return verify(cwd, `const a=require('node:assert/strict'),{retry}=require('./src/retry.js'),{fetchOnce,fetchWithRetry}=require('./src/client.js');
(async()=>{for(const n of [0,-1,1.1,NaN,Infinity,'3',null]){let calls=0;await a.rejects(()=>retry(()=>calls++,{attempts:n}),RangeError);a.equal(calls,0);}
const e=new Error('same'),events=[],marker={};const result=await retry(i=>{events.push('op'+i);if(i<3)throw e;return marker;},{shouldRetry:(error,i)=>{a.equal(error,e);events.push('pred'+i);return true;},wait:async(i,error)=>{a.equal(error,e);await Promise.resolve();events.push('wait'+i);}});a.equal(result,marker);a.deepEqual(events,['op1','pred1','wait1','op2','pred2','wait2','op3']);
let p=0,w=0;await a.rejects(()=>retry(async()=>{throw e;},{attempts:1,shouldRetry:()=>{p++;return true;},wait:()=>w++}),x=>x===e);a.equal(p,0);a.equal(w,0);
let calls=0;await a.rejects(()=>retry(()=>{calls++;throw e;},{shouldRetry:()=>false}),x=>x===e);a.equal(calls,1);
for(const field of ['wait','shouldRetry']){const stop=new Error(field);calls=0;await a.rejects(()=>retry(()=>{calls++;throw e;},{[field]:()=>{throw stop;}}),x=>x===stop);a.equal(calls,1);}
calls=0;await a.rejects(()=>retry(()=>{calls++;throw e;}),x=>x===e);a.equal(calls,3);
const seen=[];a.equal(await fetchWithRetry(async url=>{seen.push(url);if(seen.length<2)throw e;return 'ok';},'local',{attempts:2}),'ok');a.deepEqual(seen,['local','local']);a.equal(await fetchOnce(x=>x,'once'),'once');
calls=0;p=0;w=0;await a.rejects(()=>fetchWithRetry(()=>{calls++;throw e;},'local',{attempts:3,shouldRetry:(error,i)=>{a.equal(error,e);a.equal(i,1);p++;return false;},wait:()=>w++}),x=>x===e);a.equal(calls,1);a.equal(p,1);a.equal(w,0);
const clientEvents=[];calls=0;a.equal(await fetchWithRetry(()=>{clientEvents.push('fetch');if(++calls===1)throw e;return marker;},'local',{attempts:2,wait:async(i,error)=>{a.equal(i,1);a.equal(error,e);await Promise.resolve();clientEvents.push('wait');}}),marker);a.deepEqual(clientEvents,['fetch','wait','fetch']);})().catch(e=>{console.error(e);process.exitCode=1;});`, 'src/retry.js',
      ['return {...value,retry:(op,options)=>value.retry(op,{...options,attempts:1})};',
        'return {...value,retry:(op,options)=>value.retry(op,{...options,shouldRetry:()=>true})};']); },
  },
];

module.exports = {cases};
