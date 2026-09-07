'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const existing=require('./economic-fixtures.cjs').cases;
const classifications={
  positive:{difficulty:'simple',reason:'Single pure predicate with explicit finite-number truth table.'},
  'lru-cache':{difficulty:'moderate',reason:'Stateful ordering, eviction, updates, misses and arbitrary Map values must interact correctly.'},
  retry:{difficulty:'complex',reason:'Async sequencing, stopping conditions, error identity and a coupled client contract; bounded implementation rather than open-ended design.'},
};
const cases=existing.map(fixture=>({...fixture,routing:{taskType:'implementation',
  difficulty:classifications[fixture.id].difficulty,risk:'low'},routingRationale:classifications[fixture.id].reason}));

const query={
  id:'query-encoding',
  routing:{taskType:'implementation',difficulty:'simple',risk:'low'},
  routingRationale:'Bounded pure conversion and thin wrapper; exhaustive table checks, no state, IO or unfamiliar dependencies.',
  task:'Fix query serialization in src/query.js and its wrapper src/search.js, adding regression tests to '
    +'test/search.test.js. queryPairs(filters) must return [key,String(value)] pairs in Object.entries order; '
    +'scalar string/number/boolean values are included, null and undefined are omitted. Array values expand '
    +'to repeated keys in array order, omitting null/undefined elements. Other value types (objects, functions, '
    +'symbols, BigInts, nested arrays) are ignored. Preserve 0, false and empty strings. Do not mutate filters '
    +'or arrays. buildSearch(filters) must use queryPairs and URLSearchParams to return a leading ? plus the '
    +'encoded query, or an empty string when no pairs remain. Preserve the existing export names. Only these '
    +'three files may change. Work directly without delegation or other coding sessions. Do not commit, '
    +'install dependencies, use the network or perform external writes. Run node --test, inspect your diff, '
    +'and finish with a concise change summary and test result.',
  files:{
    'src/query.js':"'use strict';\nfunction queryPairs(filters){return Object.entries(filters).filter(([,value])=>value).map(([key,value])=>[key,String(value)]);}\nmodule.exports={queryPairs};\n",
    'src/search.js':"'use strict';\nfunction buildSearch(filters){return '?'+Object.entries(filters).map(([key,value])=>key+'='+value).join('&');}\nmodule.exports={buildSearch};\n",
    'test/search.test.js':"'use strict';\nconst test=require('node:test'),assert=require('node:assert/strict');\nconst {buildSearch}=require('../src/search.js');\ntest('basic',()=>assert.equal(buildSearch({q:'term'}),'?q=term'));\n",
  },
  allowedFiles:['src/query.js','src/search.js','test/search.test.js'],
  verify(cwd){
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const run=args=>spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    const tests=run(['--test']);
    const oracle=run(['-e',`const a=require('node:assert/strict'),{queryPairs}=require('./src/query.js'),{buildSearch}=require('./src/search.js');
const list=Object.freeze([0,false,'',null,undefined,'a b','&=']);const filters=Object.freeze({zero:0,no:false,blank:'',skip:null,also:undefined,tag:list,object:{},nested:[[1]],fn:()=>0,big:1n,symbol:Symbol('s')});
a.deepEqual(queryPairs(filters),[['zero','0'],['no','false'],['blank',''],['tag','0'],['tag','false'],['tag',''],['tag','a b'],['tag','&=']]);
a.equal(buildSearch({q:'a b&=+é',tag:['x y','z'],zero:0,no:false,blank:''}),'?q=a+b%26%3D%2B%C3%A9&tag=x+y&tag=z&zero=0&no=false&blank=');
for(const value of [{},{a:null,b:undefined},{a:[],b:{},c:[null,undefined]}])a.equal(buildSearch(value),'');
a.deepEqual(queryPairs({'a b':['x','y'],v:[{},{},[],Symbol('s'),1n],tail:true}),[['a b','x'],['a b','y'],['tail','true']]);`]);
    const testsPassed=!tests.error&&tests.status===0,oraclePassed=!oracle.error&&oracle.status===0;
    let mutantChecksPassed=false;
    if(testsPassed&&oraclePassed){
      const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-query-mutant-'));
      try{
        const target=fs.realpathSync(path.join(cwd,'src/query.js'));
        const file=path.join(temp,'preload.cjs');
        fs.writeFileSync(file,`const M=require('node:module'),load=M._load;M._load=function(name,parent){const value=load.apply(this,arguments);if(M._resolveFilename(name,parent)===${JSON.stringify(target)})return {...value,queryPairs:()=>[]};return value;};`);
        const mutant=run(['--require',file,'--test']);
        mutantChecksPassed=!mutant.error&&mutant.status===1&&/AssertionError|ERR_ASSERTION/.test(mutant.stdout+mutant.stderr);
      }finally{fs.rmSync(temp,{recursive:true,force:true});}
    }
    return {testsPassed,oraclePassed,mutantChecksPassed};
  },
};
cases.splice(1,0,query);
module.exports={cases};
