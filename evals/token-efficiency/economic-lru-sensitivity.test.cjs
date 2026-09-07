'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto');
const {MUTANTS,evaluateTests,verifyCandidate}=require('./check-routing-lru-tests.cjs');

// Written against the public contract; never consumes a candidate implementation.
const STRONG_TESTS=String.raw`
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {LRUCache}=require('../src/lru.js');
test('capacity requires a positive numeric integer',()=>{
  for(const capacity of [0,-1,1.25,NaN,Infinity,-Infinity,'2',null,undefined,true,{},[],2n,Symbol('n')]) {
    assert.throws(()=>new LRUCache(capacity),RangeError);
  }
  for(const capacity of [1,2,7])assert.equal(new LRUCache(capacity).size,0);
});
test('insertion evicts the oldest entry and set returns the cache',()=>{
  const cache=new LRUCache(2);
  assert.equal(cache.set('a',1),cache);
  cache.set('b',2).set('c',3);
  assert.equal(cache.size,2);
  assert.equal(cache.has('a'),false);
  assert.equal(cache.has('b'),true);
  assert.equal(cache.has('c'),true);
});
test('updating a key refreshes it without evicting another entry',()=>{
  const cache=new LRUCache(2);
  cache.set('a',1).set('b',2).set('a',3);
  assert.equal(cache.size,2);assert.equal(cache.has('b'),true);
  cache.set('c',4);
  assert.equal(cache.has('b'),false);assert.equal(cache.get('a'),3);
});
test('a get hit refreshes recency',()=>{
  const cache=new LRUCache(2);
  cache.set('a',1).set('b',2);
  assert.equal(cache.get('a'),1);cache.set('c',3);
  assert.equal(cache.has('a'),true);assert.equal(cache.has('b'),false);
});
test('has and size leave recency unchanged',()=>{
  const cache=new LRUCache(2);
  cache.set('a',1).set('b',2);
  assert.equal(cache.has('a'),true);assert.equal(cache.size,2);
  cache.set('c',3);
  assert.equal(cache.has('a'),false);assert.equal(cache.has('b'),true);
});
test('a get miss does not insert a key or change recency',()=>{
  const cache=new LRUCache(2);
  cache.set('a',1).set('b',2);
  assert.equal(cache.get('missing'),undefined);
  assert.equal(cache.has('missing'),false);assert.equal(cache.size,2);
  cache.set('c',3);
  assert.equal(cache.has('a'),false);assert.equal(cache.has('b'),true);
});
test('all values survive storage, including undefined membership and hit refresh',()=>{
  for(const value of [false,0,'',null,undefined,NaN,{},()=>1,Symbol('value'),2n]) {
    const cache=new LRUCache(1);cache.set('key',value);
    assert.equal(cache.has('key'),true);assert.equal(cache.get('key'),value);
    assert.equal(cache.size,1);
  }
  const cache=new LRUCache(2);
  cache.set('a',undefined).set('b',1);
  assert.equal(cache.get('a'),undefined);cache.set('c',2);
  assert.equal(cache.has('a'),true);assert.equal(cache.has('b'),false);
});
test('keys obey Map identity and SameValueZero semantics',()=>{
  const first={},second={},left=Symbol('key'),right=Symbol('key');
  const keys=[first,second,left,right,NaN,0,undefined,null,'0'];
  const cache=new LRUCache(keys.length);
  keys.forEach((key,index)=>cache.set(key,index));
  keys.forEach((key,index)=>assert.equal(cache.get(key),index));
  assert.equal(cache.has({}),false);assert.equal(cache.has(Symbol('key')),false);
  cache.set(-0,'updated');
  assert.equal(cache.get(0),'updated');assert.equal(cache.size,keys.length);
});
`;
const VACUOUS_TESTS="const test=require('node:test');test('vacuous',()=>{});\n";

function assertCompleteReport(result) {
  assert.equal(result.totalMutants,8);
  assert.equal(new Set(MUTANTS.map(mutant=>mutant.id)).size,8);
  assert.deepEqual(result.mutants.map(mutant=>mutant.id),MUTANTS.map(mutant=>mutant.id));
}

test('independent contract tests pass the control and detect all eight LRU faults',()=>{
  const result=evaluateTests(STRONG_TESTS);assertCompleteReport(result);
  assert.equal(result.control.passed,true);assert.equal(result.validControl,true);
  assert.equal(result.detectedCount,8);
  assert.ok(result.mutants.every(mutant=>mutant.outcome==='detected'));
});

test('vacuous tests pass the control and detect zero faults',()=>{
  const result=evaluateTests(VACUOUS_TESTS);assertCompleteReport(result);
  assert.equal(result.control.passed,true);assert.equal(result.validControl,true);
  assert.equal(result.detectedCount,0);
  assert.ok(result.mutants.every(mutant=>mutant.outcome==='survived'));
});

test('invalid controls cannot receive mutation credit and retain all eight outcomes',()=>{
  for(const source of ['const broken = ;',"require('node:assert/strict').equal(1,2);"]) {
    const result=evaluateTests(source);assertCompleteReport(result);
    assert.equal(result.control.passed,false);assert.equal(result.validControl,false);
    assert.equal(result.detectedCount,null);
    assert.ok(result.mutants.every(mutant=>mutant.outcome==='invalid'));
  }
});

test('candidate verification binds both source and tests to the final recorded hashes',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lru-hash-control-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const contents={'src/lru.js':'synthetic source\n','test/lru.test.js':VACUOUS_TESTS};
  const files={};
  for(const [name,source] of Object.entries(contents)) {
    const file=path.join(root,'run-1','workspace',name);
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);
    files[name]=createHash('sha256').update(source).digest('hex');
  }
  const report={schema:'vulpora.routing-ab/v1'};
  const run={caseId:'lru-cache',order:1,finished:true,attempts:[{afterFiles:{completed:true,files}}]};
  assert.deepEqual(verifyCandidate(report,root,run),{hashes:files,testSource:VACUOUS_TESTS});
  for(const name of Object.keys(contents)) {
    const file=path.join(root,'run-1','workspace',name);
    fs.writeFileSync(file,contents[name]+'// changed\n');
    assert.throws(()=>verifyCandidate(report,root,run),/CANDIDATE_HASH_MISMATCH/);
    fs.writeFileSync(file,contents[name]);
  }
  assert.throws(()=>verifyCandidate(report,root,{...run,finished:false}),/INCOMPLETE_LRU_RUN/);
});
