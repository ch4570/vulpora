'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {cases} = require('./economic-fixtures.cjs');

const TEST_HEADER = "'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\n";
const solutions = {
  positive: {
    'src/numbers.js': `'use strict';
function absolute(value) { return value < 0 ? -value : value; }
function isPositive(value) { return Number.isFinite(value) && value > 0; }
module.exports = {absolute, isPositive};
`,
    'test/numbers.test.js': TEST_HEADER + `const {absolute,isPositive}=require('../src/numbers.js');
test('finite positive numbers only',()=>{
  for(const value of [Number.MIN_VALUE,0.5,42,Number.MAX_VALUE]) assert.equal(isPositive(value),true);
  for(const value of [0,-0,-1,NaN,Infinity,-Infinity,'1',true,null,undefined,{},[],1n,Symbol('x'),new Number(1)]) assert.equal(isPositive(value),false);
});
test('absolute is preserved',()=>assert.deepEqual([-2,0,3].map(absolute),[2,0,3]));
`,
  },
  'lru-cache': {
    'src/lru.js': `'use strict';
class LRUCache {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity');
    this.capacity=capacity;
    this.items=new Map();
  }
  set(key,value) {
    this.items.delete(key);
    this.items.set(key,value);
    if(this.items.size>this.capacity) this.items.delete(this.items.keys().next().value);
    return this;
  }
  get(key) {
    if(!this.items.has(key)) return undefined;
    const value=this.items.get(key);
    this.items.delete(key);
    this.items.set(key,value);
    return value;
  }
  has(key) { return this.items.has(key); }
  get size() { return this.items.size; }
}
module.exports={LRUCache};
`,
    'test/lru.test.js': TEST_HEADER + `const {LRUCache}=require('../src/lru.js');
test('invalid capacities',()=>{
  for(const n of [0,-1,1.5,NaN,Infinity,'2',null,undefined,2n]) assert.throws(()=>new LRUCache(n),RangeError);
});
test('false values remain present',()=>{
  for(const value of [false,0,'',null,undefined]) {
    const cache=new LRUCache(1);
    assert.equal(cache.set('a',value),cache);
    assert.equal(cache.get('a'),value);
    assert.equal(cache.has('a'),true);
    assert.equal(cache.size,1);
  }
});
test('hits and updates refresh recency; has and misses do not',()=>{
  const cache=new LRUCache(2),key={};
  cache.set(key,1).set('b',2);
  assert.equal(cache.get(key),1);
  cache.set('c',3);
  assert.equal(cache.has('b'),false);
  assert.equal(cache.has({}),false);
  cache.set(key,4);
  assert.equal(cache.size,2);
  assert.equal(cache.has('c'),true);
  cache.get('missing');
  cache.set('d',5);
  assert.equal(cache.has('c'),false);
  assert.equal(cache.get(key),4);
});
`,
  },
  retry: {
    'src/retry.js': `'use strict';
async function retry(operation,{attempts=3,shouldRetry=()=>true,wait=async()=>{}}={}) {
  if(!Number.isInteger(attempts)||attempts<=0) throw new RangeError('attempts');
  for(let attempt=1;attempt<=attempts;attempt++) {
    try { return await operation(attempt); }
    catch(error) {
      if(attempt===attempts || !shouldRetry(error,attempt)) throw error;
      await wait(attempt,error);
    }
  }
}
module.exports={retry};
`,
    'src/client.js': `'use strict';
const {retry}=require('./retry.js');
async function fetchOnce(fetcher,url) { return fetcher(url); }
async function fetchWithRetry(fetcher,url,options) { return retry(()=>fetcher(url),options); }
module.exports={fetchOnce,fetchWithRetry};
`,
    'test/retry.test.js': TEST_HEADER + `const {retry}=require('../src/retry.js');
const {fetchOnce,fetchWithRetry}=require('../src/client.js');
test('invalid counts never invoke operation',async()=>{
  for(const attempts of [0,-1,1.5,NaN,Infinity,'2',null,2n]) {
    let calls=0;
    await assert.rejects(()=>retry(()=>calls++,{attempts}),RangeError);
    assert.equal(calls,0);
  }
});
test('retries wait and preserve success identity',async()=>{
  const error=new Error('retry'),marker={},events=[];
  const result=await retry(attempt=>{
    events.push('op'+attempt);
    if(attempt<3) throw error;
    return marker;
  },{shouldRetry:(actual,attempt)=>{
    assert.equal(actual,error);events.push('predicate'+attempt);return true;
  },wait:async(attempt,actual)=>{
    assert.equal(actual,error);await Promise.resolve();events.push('wait'+attempt);
  }});
  assert.equal(result,marker);
  assert.deepEqual(events,['op1','predicate1','wait1','op2','predicate2','wait2','op3']);
});
test('predicate stops after first rejection with exact error',async()=>{
  let calls=0;
  const error=new Error('stop');
  await assert.rejects(()=>retry(async()=>{calls++;throw error;},{shouldRetry:()=>false}),actual=>actual===error);
  assert.equal(calls,1);
});
test('final failure skips predicate and wait',async()=>{
  const error=new Error('last');let predicates=0,waits=0;
  await assert.rejects(()=>retry(()=>{throw error;},{attempts:1,shouldRetry:()=>{predicates++;return true;},wait:()=>waits++}),actual=>actual===error);
  assert.equal(predicates,0);assert.equal(waits,0);
});
test('predicate and wait failures stop execution',async()=>{
  for(const field of ['shouldRetry','wait']) {
    let calls=0;const stop=new Error(field);
    await assert.rejects(()=>retry(()=>{calls++;throw new Error('operation');},{[field]:()=>{throw stop;}}),actual=>actual===stop);
    assert.equal(calls,1);
  }
});
test('client forwards options and preserves fetchOnce',async()=>{
  let calls=0;
  assert.equal(await fetchWithRetry(url=>{assert.equal(url,'local');if(++calls<2)throw new Error('retry');return 7;},'local',{attempts:2}),7);
  assert.equal(calls,2);
  assert.equal(await fetchOnce(url=>url,'once'),'once');
});
`,
  },
};

function fixtureDirectory(t, fixture, changes={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-economic-fixture-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [relative,source] of Object.entries({...fixture.files,...changes})) {
    const target=path.join(directory,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,source);
  }
  return directory;
}

test('mutation checks match a workspace reached through a symlink',t=>{
  const fixture=cases.find(value=>value.id==='positive');
  const directory=fixtureDirectory(t,fixture,solutions.positive);
  const alias=directory+'-alias';
  fs.symlinkSync(directory,alias,'dir');
  t.after(()=>fs.rmSync(alias,{force:true}));
  assert.deepEqual(fixture.verify(alias),{
    testsPassed:true,oraclePassed:true,mutantChecksPassed:true,
  });
});

test('oracle rejects a cache that treats stored undefined as a miss for recency',t=>{
  const fixture=cases.find(value=>value.id==='lru-cache');
  const changes={...solutions['lru-cache']};
  changes['src/lru.js']=changes['src/lru.js'].replace(
    'if(!this.items.has(key)) return undefined;',
    'if(this.items.get(key) === undefined) return undefined;');
  const directory=fixtureDirectory(t,fixture,changes);
  assert.deepEqual(fixture.verify(directory),{
    testsPassed:true,oraclePassed:false,mutantChecksPassed:false,
  });
});

for(const dropped of ['shouldRetry','wait']) {
  test(`oracle rejects client forwarding that drops ${dropped}`,t=>{
    const fixture=cases.find(value=>value.id==='retry');
    const changes={...solutions.retry};
    changes['src/client.js']=changes['src/client.js'].replace(
      'return retry(()=>fetcher(url),options);',
      `const {${dropped}:omitted,...forwarded}=options||{}; return retry(()=>fetcher(url),forwarded);`);
    const directory=fixtureDirectory(t,fixture,changes);
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:true,oraclePassed:false,mutantChecksPassed:false,
    });
  });
}

for(const fixture of cases) {
  test(`${fixture.id}: initial implementation fails the independent oracle`,t=>{
    const directory=fixtureDirectory(t,fixture);
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:true,oraclePassed:false,mutantChecksPassed:false,
    });
  });

  test(`${fixture.id}: valid implementation and behavioral tests pass all checks`,t=>{
    assert.ok(solutions[fixture.id],'new fixtures require a separately implemented reference solution');
    const directory=fixtureDirectory(t,fixture,solutions[fixture.id]);
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:true,oraclePassed:true,mutantChecksPassed:true,
    });
  });

  test(`${fixture.id}: original smoke tests cannot establish regression coverage`,t=>{
    const sourceOnly=Object.fromEntries(Object.entries(solutions[fixture.id]).filter(([name])=>name.startsWith('src/')));
    const directory=fixtureDirectory(t,fixture,sourceOnly);
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:true,oraclePassed:true,mutantChecksPassed:false,
    });
  });

  test(`${fixture.id}: absent test files cannot establish regression coverage`,t=>{
    const directory=fixtureDirectory(t,fixture,solutions[fixture.id]);
    fs.rmSync(path.join(directory,'test'),{recursive:true});
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:true,oraclePassed:true,mutantChecksPassed:false,
    });
  });

  for(const [label,body] of [
    ['malformed tests', 'function syntax error {'],
    ['failing tests', TEST_HEADER+"test('fails',()=>assert.equal(1,2));\n"],
  ]) {
    test(`${fixture.id}: ${label} cannot pass on a correct implementation`,t=>{
      const changes={...solutions[fixture.id]};
      const testPath=Object.keys(changes).find(name=>name.startsWith('test/'));
      changes[testPath]=body;
      const directory=fixtureDirectory(t,fixture,changes);
      assert.deepEqual(fixture.verify(directory),{
        testsPassed:false,oraclePassed:true,mutantChecksPassed:false,
      });
    });
  }
}
