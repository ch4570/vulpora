'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {cases}=require('./routing-fixtures.cjs');

const fixture=cases.find(item=>item.id==='query-encoding');
const HEADER="'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\n";

// A separate implementation of the task contract, never copied from a model
// output or produced by the fixture's verifier.
const solution={
  'src/query.js':`'use strict';
function queryPairs(filters) {
  return Object.entries(filters).flatMap(([key,value])=>{
    const values=Array.isArray(value)?value:[value];
    return values.filter(item=>['string','number','boolean'].includes(typeof item))
      .map(item=>[key,String(item)]);
  });
}
module.exports={queryPairs};
`,
  'src/search.js':`'use strict';
const {queryPairs}=require('./query.js');
function buildSearch(filters) {
  const params=new URLSearchParams(queryPairs(filters));
  const encoded=params.toString();
  return encoded.length?'?'+encoded:'';
}
module.exports={buildSearch};
`,
  'test/search.test.js':HEADER+`const {queryPairs}=require('../src/query.js');
const {buildSearch}=require('../src/search.js');
test('scalars preserve falsy values and Object.entries ordering',()=>{
  assert.deepEqual(queryPairs({b:false,10:'ten',2:'two',a:0,empty:'',tail:true}),
    [['2','two'],['10','ten'],['b','false'],['a','0'],['empty',''],['tail','true']]);
  assert.deepEqual(queryPairs({number:[NaN,Infinity,-Infinity,-0]}),
    [['number','NaN'],['number','Infinity'],['number','-Infinity'],['number','0']]);
});
test('arrays expand in place and omit unsupported elements',()=>{
  const ignored=[null,undefined,{},()=>0,Symbol('ignored'),1n,[1],new String('boxed')];
  assert.deepEqual(queryPairs({first:'start',item:[...ignored,0,false,''],last:2}),
    [['first','start'],['item','0'],['item','false'],['item',''],['last','2']]);
  for(const value of ignored.filter(item=>!Array.isArray(item)))
    assert.deepEqual(queryPairs({ignored:value}),[]);
});
test('query encoding handles Unicode, punctuation, repeated keys and blank values',()=>{
  assert.equal(buildSearch({'sp ace':['&=+','한글'],'':false,zero:0,blank:''}),
    '?sp+ace=%26%3D%2B&sp+ace=%ED%95%9C%EA%B8%80&=false&zero=0&blank=');
});
test('no accepted pairs produces no question mark',()=>{
  for(const filters of [{},{a:[]},{a:null,b:undefined,c:{},d:[[1],1n]}])
    assert.equal(buildSearch(filters),'');
});
test('frozen inputs and array identities stay intact',()=>{
  const values=Object.freeze([2,null,'one',false]);
  const filters=Object.freeze({key:values});
  assert.deepEqual(queryPairs(filters),[['key','2'],['key','one'],['key','false']]);
  assert.equal(buildSearch(filters),'?key=2&key=one&key=false');
  assert.equal(filters.key,values);
  assert.deepEqual(values,[2,null,'one',false]);
});
`,
};

function directoryFor(t,changes={}) {
  assert.ok(fixture,'query-encoding fixture must remain in the routed benchmark');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-routing-fixture-test-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const [relative,source] of Object.entries({...fixture.files,...changes})) {
    const filename=path.join(directory,relative);
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,source);
  }
  return directory;
}

test('query-encoding: broken initial source fails the independent oracle',t=>{
  assert.deepEqual(fixture.verify(directoryFor(t)),{
    testsPassed:true,oraclePassed:false,mutantChecksPassed:false,
  });
});

test('query-encoding: independent correct solution and regression tests pass all checks',t=>{
  assert.deepEqual(fixture.verify(directoryFor(t,solution)),{
    testsPassed:true,oraclePassed:true,mutantChecksPassed:true,
  });
});

test('query-encoding: unrelated passing tests do not establish behavioral coverage',t=>{
  const directory=directoryFor(t,{...solution,
    'test/search.test.js':HEADER+"test('unrelated arithmetic',()=>assert.equal(2+3,5));\n"});
  assert.deepEqual(fixture.verify(directory),{
    testsPassed:true,oraclePassed:true,mutantChecksPassed:false,
  });
});

test('query-encoding: absent tests cannot satisfy the mutation check',t=>{
  const directory=directoryFor(t,solution);
  fs.rmSync(path.join(directory,'test'),{recursive:true});
  assert.deepEqual(fixture.verify(directory),{
    testsPassed:true,oraclePassed:true,mutantChecksPassed:false,
  });
});

for(const [label,source] of [
  ['malformed', 'function invalid syntax {'],
  ['failing', HEADER+"test('fails',()=>assert.equal('actual','expected'));\n"],
]) {
  test(`query-encoding: ${label} tests reject an otherwise correct implementation`,t=>{
    const directory=directoryFor(t,{...solution,'test/search.test.js':source});
    assert.deepEqual(fixture.verify(directory),{
      testsPassed:false,oraclePassed:true,mutantChecksPassed:false,
    });
  });
}

test('query-encoding: a correct pair converter cannot hide a broken search wrapper',t=>{
  const directory=directoryFor(t,{'src/query.js':solution['src/query.js']});
  assert.deepEqual(fixture.verify(directory),{
    testsPassed:true,oraclePassed:false,mutantChecksPassed:false,
  });
});

test('query-encoding: mutation checks still target a workspace reached through a symlink',t=>{
  const directory=directoryFor(t,solution);
  const alias=directory+'-alias';
  fs.symlinkSync(directory,alias,'dir');
  t.after(()=>fs.rmSync(alias,{force:true}));
  assert.deepEqual(fixture.verify(alias),{
    testsPassed:true,oraclePassed:true,mutantChecksPassed:true,
  });
});
