'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {cases}=require('./workflow-fixtures.cjs');

const HEADER="'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\n";
// These independent reference solutions are test-only: neither they nor the
// fixture verifiers are copied into a model's task workspace.
const solutions={
  'workflow-catalog-repair':{
    'src/page.js':`'use strict';
function page(items,{offset=0,limit=2}={}) {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<=0) throw new RangeError('page');
  const selected=items.slice(offset,offset+limit);
  return {items:selected,nextOffset:offset+limit<items.length?offset+limit:null};
}
module.exports={page};
`,
    'src/catalog.js':`'use strict';
const {page}=require('./page.js');
function listProducts(products,{category,offset,limit}={}) {
  const selected=products.filter(item=>category===undefined||item.category===category);
  selected.sort((a,b)=>a.price-b.price||(a.id<b.id?-1:a.id>b.id?1:0));
  return page(selected,{offset,limit});
}
function findProduct(products,id) { return products.find(item=>item.id===id); }
module.exports={listProducts,findProduct};
`,
    'test/catalog.test.js':HEADER+`const {page}=require('../src/page.js');
const {listProducts,findProduct}=require('../src/catalog.js');
test('validation and page boundaries',()=>{
  for(const offset of [-1,0.1,NaN,Infinity,'0',null,2n,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>page([],{offset}),RangeError);
  for(const limit of [0,-1,0.1,NaN,Infinity,'2',null,2n,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>page([],{limit}),RangeError);
  assert.deepEqual(page([1,2,3]),{items:[1,2],nextOffset:2});
  assert.deepEqual(page([1,2,3],{offset:2}),{items:[3],nextOffset:null});
  for(const offset of [3,4,Number.MAX_SAFE_INTEGER]) assert.deepEqual(page([1,2,3],{offset}),{items:[],nextOffset:null});
  assert.deepEqual(page([]),{items:[],nextOffset:null});
  assert.deepEqual(page([1,2]),{items:[1,2],nextOffset:null});
});
test('filter, sort and only then paginate, preserving identities',()=>{
  const products=Object.freeze([
    Object.freeze({id:'x',price:0,category:'other'}),Object.freeze({id:'b',price:2,category:'match'}),
    Object.freeze({id:'a',price:2,category:'match'}),Object.freeze({id:'c',price:1,category:'match'}),
    Object.freeze({id:'empty',price:3,category:''})]);
  assert.deepEqual(listProducts(products,{category:'match'}),{items:[products[3],products[2]],nextOffset:2});
  assert.deepEqual(listProducts(products,{category:'match',offset:2}),{items:[products[1]],nextOffset:null});
  assert.equal(listProducts(products,{category:'match'}).items[0],products[3]);
  assert.deepEqual(listProducts(products,{category:'',limit:1}),{items:[products[4]],nextOffset:null});
  assert.deepEqual(listProducts(products,{category:'missing'}),{items:[],nextOffset:null});
  assert.deepEqual(listProducts(products,{limit:1}),{items:[products[0]],nextOffset:1});
  assert.throws(()=>listProducts(products,{limit:0}),RangeError);
  assert.equal(findProduct(products,'a'),products[2]);
  assert.equal(findProduct(products,'missing'),undefined);
});
`,
  },
  'workflow-retry-tests':{
    'test/retry.test.js':HEADER+`const {retry}=require('../src/retry.js');
const {loadRecord}=require('../src/loader.js');
test('invalid total attempt counts never call operation',async()=>{
  for(const attempts of [0,-1,0.5,NaN,Infinity,'3',null,2n,Number.MAX_SAFE_INTEGER+1]) {
    let calls=0;await assert.rejects(()=>retry(()=>calls++,{attempts}),RangeError);assert.equal(calls,0);
  }
});
test('success value identity and one-based attempts with awaited ordering',async()=>{
  const events=[],failure=new Error('again'),marker={};
  const actual=await retry(attempt=>{
    events.push('operation'+attempt);if(attempt<3)throw failure;return marker;
  },{shouldRetry:(error,attempt)=>{assert.equal(error,failure);events.push('predicate'+attempt);return true;},
    wait:async(attempt,error)=>{assert.equal(error,failure);await Promise.resolve();events.push('wait'+attempt);}});
  assert.equal(actual,marker);
  assert.deepEqual(events,['operation1','predicate1','wait1','operation2','predicate2','wait2','operation3']);
});
test('default attempts count failures, final attempt skips hooks',async()=>{
  const failure=new Error('same');let calls=0,predicates=0,waits=0;
  await assert.rejects(()=>retry(async()=>{calls++;throw failure;},{shouldRetry:()=>{predicates++;return true;},wait:()=>waits++}),error=>error===failure);
  assert.equal(calls,3);assert.equal(predicates,2);assert.equal(waits,2);
  predicates=0;waits=0;
  await assert.rejects(()=>retry(()=>{throw failure;},{attempts:1,shouldRetry:()=>{predicates++;return true;},wait:()=>waits++}),error=>error===failure);
  assert.equal(predicates,0);assert.equal(waits,0);
});
test('predicate false stops after one call',async()=>{
  let calls=0;const failure=new Error('stop');
  await assert.rejects(()=>retry(()=>{calls++;throw failure;},{shouldRetry:()=>false}),error=>error===failure);
  assert.equal(calls,1);
});
test('predicate and wait errors propagate unchanged',async()=>{
  for(const field of ['shouldRetry','wait']) {
    let calls=0;const failure=new Error(field);
    await assert.rejects(()=>retry(()=>{calls++;throw new Error('operation');},{[field]:()=>{throw failure;}}),error=>error===failure);
    assert.equal(calls,1);
  }
});
test('loader forwards attempts, predicate and awaited wait',async()=>{
  let calls=0;const failure=new Error('loader'),marker={};
  await assert.rejects(()=>loadRecord(id=>{assert.equal(id,'record');calls++;throw failure;},'record',{attempts:1}),error=>error===failure);
  assert.equal(calls,1);calls=0;
  await assert.rejects(()=>loadRecord(()=>{calls++;throw failure;},'record',{shouldRetry:()=>false}),error=>error===failure);
  assert.equal(calls,1);calls=0;const events=[];
  assert.equal(await loadRecord(id=>{assert.equal(id,'record');events.push('fetch');if(++calls===1)throw failure;return marker;},'record',
    {wait:async(attempt,error)=>{assert.equal(attempt,1);assert.equal(error,failure);await Promise.resolve();events.push('wait');}}),marker);
  assert.deepEqual(events,['fetch','wait','fetch']);
});
`,
  },
  'workflow-entry-review':{
    'findings.json':JSON.stringify({findings:[
      {file:'src/format.js',line:3,defectClass:'whitespace-normalization',severity:'medium',
        explanation:'Replacing only the first pair of spaces leaves internal tabs and later whitespace runs unchanged.'},
      {file:'src/list.js',line:3,defectClass:'filter-order',severity:'medium',
        explanation:'With one disabled entry first and limit 1, an enabled second entry is omitted.'},
      {file:'src/order.js',line:3,defectClass:'input-mutation',severity:'medium',
        explanation:'Array.sort changes the original input order when the titles arrive in descending order.'},
    ]}),
  },
};

function directoryFor(t,fixture,changes={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-fixture-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [relative,source] of Object.entries({...fixture.files,...changes})) {
    const filename=path.join(directory,relative);
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,source);
  }
  return directory;
}
const fixtureFor=id=>cases.find(item=>item.id===id);
const accepted={testsPassed:true,oraclePassed:true,mutantChecksPassed:true};

test('three workflow tasks are bounded and never expose their hidden verification source',()=>{
  assert.equal(cases.length,3);
  assert.equal(new Set(cases.map(fixture=>fixture.id)).size,3);
  for(const fixture of cases) {
    assert.match(fixture.task,/do not delegate/);
    assert.match(fixture.task,/Do not commit, install dependencies, use the network/);
    assert.ok(Object.keys(fixture.files).every(name=>name.startsWith('src/')||name.startsWith('test/')));
    assert.ok(!fixture.task.includes('expectedFindings')&&!fixture.task.includes('killedMutants'));
  }
  assert.equal(cases[0].allowedFiles.length,3);
  assert.deepEqual(cases[1].allowedFiles,['test/retry.test.js']);
  assert.deepEqual(cases[2].allowedFiles,['findings.json']);
});

for(const fixture of cases) {
  test(`${fixture.id}: initial task does not meet the complete quality gate`,t=>{
    const result=fixture.verify(directoryFor(t,fixture));
    assert.equal(result.testsPassed,true);
    assert.equal(result.oraclePassed,fixture.rubric.kind==='test-authoring');
    assert.equal(result.mutantChecksPassed,false);
  });
  test(`${fixture.id}: independent correct reference passes the applicable rubric`,t=>{
    assert.deepEqual(fixture.verify(directoryFor(t,fixture,solutions[fixture.id])),accepted);
  });
}

for(const fixture of cases.filter(item=>item.rubric.kind!=='review')) {
  test(`${fixture.id}: smoke tests cannot establish fault detection`,t=>{
    const changes=Object.fromEntries(Object.entries(solutions[fixture.id]).filter(([name])=>name.startsWith('src/')));
    assert.deepEqual(fixture.verify(directoryFor(t,fixture,changes)),{
      testsPassed:true,oraclePassed:true,mutantChecksPassed:false,
    });
  });
  test(`${fixture.id}: absent tests cannot establish fault detection`,t=>{
    const directory=directoryFor(t,fixture,solutions[fixture.id]);
    fs.rmSync(path.join(directory,'test'),{recursive:true});
    assert.deepEqual(fixture.verify(directory),{testsPassed:true,oraclePassed:true,mutantChecksPassed:false});
  });
  test(`${fixture.id}: syntax errors are not regression evidence`,t=>{
    const testPath=fixture.allowedFiles.find(name=>name.startsWith('test/'));
    const directory=directoryFor(t,fixture,{...solutions[fixture.id],[testPath]:'function broken syntax {'});
    assert.deepEqual(fixture.verify(directory),{testsPassed:false,oraclePassed:true,mutantChecksPassed:false});
  });
}

test('catalog: fixing only the lower-level pager leaves integration defects',t=>{
  const fixture=fixtureFor('workflow-catalog-repair');
  const directory=directoryFor(t,fixture,{'src/page.js':solutions[fixture.id]['src/page.js']});
  assert.deepEqual(fixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
});

for(const [label,before,after] of [
  ['empty category treated as absent','category===undefined','!category'],
  ['missing tie ordering','a.price-b.price||(a.id<b.id?-1:a.id>b.id?1:0)','a.price-b.price'],
]) {
  test(`catalog: hidden oracle rejects ${label} even with passing smoke tests`,t=>{
    const fixture=fixtureFor('workflow-catalog-repair');
    const source=solutions[fixture.id];
    const directory=directoryFor(t,fixture,{
      'src/page.js':source['src/page.js'],
      'src/catalog.js':source['src/catalog.js'].replace(before,after),
    });
    assert.deepEqual(fixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
  });
}

test('test authoring: even behavior-preserving production edits violate the immutable boundary',t=>{
  const fixture=fixtureFor('workflow-retry-tests');
  const directory=directoryFor(t,fixture,{...solutions[fixture.id],
    'src/retry.js':fixture.files['src/retry.js']+'\n'});
  assert.deepEqual(fixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
});

test('test authoring: mutants that trigger process errors are not assertion kills',t=>{
  const fixture=fixtureFor('workflow-retry-tests');
  const directory=directoryFor(t,fixture,{'test/retry.test.js':HEADER+`const {retry}=require('../src/retry.js');
test('untrustworthy crash-only check',async()=>{
  let calls=0;
  try { await retry(()=>{if(++calls<3)throw new Error('retry');return 1;}); }
  catch { throw new TypeError('non-assertion failure'); }
});
`});
  assert.deepEqual(fixture.verify(directory),{testsPassed:true,oraclePassed:true,mutantChecksPassed:false});
});

test('test authoring: preload mutation matching works through a workspace symlink',t=>{
  const fixture=fixtureFor('workflow-retry-tests');
  const directory=directoryFor(t,fixture,solutions[fixture.id]);
  const alias=directory+'-alias';
  fs.symlinkSync(directory,alias,'dir');
  t.after(()=>fs.rmSync(alias,{force:true}));
  assert.deepEqual(fixture.verify(alias),accepted);
});

const reviewFixture=fixtureFor('workflow-entry-review');
test('review: each seeded finding has a demonstrated failure at the registered source anchor',t=>{
  const directory=directoryFor(t,reviewFixture);
  const {formatLabel}=require(path.join(directory,'src/format.js'));
  const {listEnabled}=require(path.join(directory,'src/list.js'));
  const {orderByTitle}=require(path.join(directory,'src/order.js'));
  assert.equal(formatLabel(' one\ttwo  three  four '),'one\ttwo three  four',
    'internal tabs and later double spaces are incorrectly preserved');
  const disabled={title:'B',enabled:false};
  const enabled={title:'A',enabled:true};
  assert.deepEqual(listEnabled([disabled,enabled],1),[],
    'a disabled entry incorrectly consumes the only page slot');
  const input=[disabled,enabled];
  assert.equal(orderByTitle(input),input,'sort incorrectly returns the original array');
  assert.deepEqual(input,[enabled,disabled],'sort incorrectly changes caller-owned order');
  assert.equal(reviewFixture.files['src/format.js'].split('\n')[2].trim(),"return label.trim().replace('  ',' ');");
  assert.equal(reviewFixture.files['src/list.js'].split('\n')[2].trim(),
    'return entries.slice(0,limit).filter(entry=>entry.enabled);');
  assert.equal(reviewFixture.files['src/order.js'].split('\n')[2].trim(),
    'return entries.sort((a,b)=>a.title.localeCompare(b.title));');
});

for(const [label,change] of [
  ['missing finding',report=>{report.findings.pop();}],
  ['false positive',report=>{report.findings.push({file:'src/list.js',line:3,defectClass:'missing-validation',severity:'low',explanation:'Speculative validation outside the stated input contract.'});}],
  ['duplicate finding',report=>{report.findings[2]=report.findings[0];}],
  ['wrong line anchor',report=>{report.findings[0].line=4;}],
  ['wrong defect class',report=>{report.findings[0].defectClass='unhandled-error';}],
  ['wrong severity',report=>{report.findings[0].severity='low';}],
  ['unsupported root field',report=>{report.summary='all good';}],
  ['unsupported finding field',report=>{report.findings[0].suggestion='change it';}],
  ['empty explanation',report=>{report.findings[0].explanation='';}],
]) {
  test(`review: rejects ${label}`,t=>{
    const report=JSON.parse(solutions[reviewFixture.id]['findings.json']);
    change(report);
    const directory=directoryFor(t,reviewFixture,{'findings.json':JSON.stringify(report)});
    assert.deepEqual(reviewFixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
  });
}

test('review: correct findings cannot excuse production fixes',t=>{
  const directory=directoryFor(t,reviewFixture,{...solutions[reviewFixture.id],
    'src/order.js':reviewFixture.files['src/order.js'].replace('entries.sort','[...entries].sort')});
  assert.deepEqual(reviewFixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
});

test('review: malformed JSON is a failed finding rubric, not a verifier crash',t=>{
  const directory=directoryFor(t,reviewFixture,{'findings.json':'{incomplete'});
  assert.deepEqual(reviewFixture.verify(directory),{testsPassed:true,oraclePassed:false,mutantChecksPassed:false});
});

test('review: report order does not affect a precise complete finding set',t=>{
  const report=JSON.parse(solutions[reviewFixture.id]['findings.json']);
  report.findings.reverse();
  const directory=directoryFor(t,reviewFixture,{'findings.json':JSON.stringify(report)});
  assert.deepEqual(reviewFixture.verify(directory),accepted);
});
