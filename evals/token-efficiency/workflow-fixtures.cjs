'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const COMMON=' Work directly in this one session: do not delegate or start another coding session. '
  +'Do not commit, install dependencies, use the network or perform external writes. '
  +'Run node --test, inspect your diff and finish with a concise summary and test result.';
const HEADER="'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\n";

function run(cwd,args) {
  const env={...process.env};
  // A nested node:test process must not inherit the outer worker marker.
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
}
function passed(result) { return !result.error && result.status===0; }
function unchanged(cwd,files) {
  return Object.entries(files).every(([relative,source])=>{
    try { return fs.lstatSync(path.join(cwd,relative)).isFile()
      && fs.readFileSync(path.join(cwd,relative),'utf8')===source; }
    catch { return false; }
  });
}
function killedMutants(cwd,mutations) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'vulpora-workflow-mutants-'));
  try {
    return mutations.every(({file,body},index)=>{
      const target=fs.realpathSync(path.join(cwd,file));
      const preload=path.join(temporary,`mutant-${index}.cjs`);
      fs.writeFileSync(preload,`const M=require('node:module'),load=M._load;
M._load=function(name,parent,main){const value=load.apply(this,arguments);
if(M._resolveFilename(name,parent)===${JSON.stringify(target)}){${body}}
return value;};\n`);
      const result=run(cwd,['--require',preload,'--test']);
      // A crash, syntax error, timeout or explicit exit is not fault detection.
      return !result.error && result.status===1
        && /ERR_ASSERTION|AssertionError/.test(result.stdout+result.stderr);
    });
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
}
function verifyCode(cwd,{oracle,mutations,immutable={}}) {
  const testsPassed=passed(run(cwd,['--test']));
  const oraclePassed=unchanged(cwd,immutable) && passed(run(cwd,['-e',oracle]));
  const mutantChecksPassed=testsPassed && oraclePassed && killedMutants(cwd,mutations);
  return {testsPassed,oraclePassed,mutantChecksPassed};
}

const catalog={
  id:'workflow-catalog-repair',
  task:'Repair pagination and its catalog integration in src/page.js and src/catalog.js; add regression '
    +'tests in test/catalog.test.js. page(items, {offset=0, limit=2}={}) must reject non-safe-integer, '
    +'negative offsets and non-safe-integer, non-positive limits with RangeError. It returns '
    +'{items: selectedItems, nextOffset}: nextOffset is offset + limit only when another item remains, '
    +'otherwise null (including empty or out-of-range pages). Do not mutate the input array or clone its '
    +'elements. listProducts(products, {category, offset, limit}={}) must filter by exact category when '
    +'category is not undefined (the empty string is a category), then sort by ascending price and '
    +'ascending ASCII id on ties, then paginate with the supplied options. Product inputs have unique '
    +'ASCII ids, finite numeric prices and string categories. Preserve input order and object identities. '
    +'Preserve findProduct(products,id), including undefined for missing ids. Only the two source files '
    +'and test/catalog.test.js may change.'+COMMON,
  files:{
    'src/page.js':"'use strict';\nfunction page(items,{offset=0,limit=2}={}) {\n"
      +'  return {items:items.slice(offset,offset+limit),nextOffset:offset+limit};\n'
      +'}\nmodule.exports={page};\n',
    'src/catalog.js':"'use strict';\nconst {page}=require('./page.js');\n"
      +'function listProducts(products,{category,offset,limit}={}) {\n'
      +'  const result=page(products,{offset,limit});\n'
      +'  result.items=result.items.filter(item=>!category || item.category===category).sort((a,b)=>a.price-b.price);\n'
      +'  return result;\n}\n'
      +'function findProduct(products,id) { return products.find(item=>item.id===id); }\n'
      +'module.exports={listProducts,findProduct};\n',
    'test/catalog.test.js':HEADER+"const {page}=require('../src/page.js');\n"
      +"const {findProduct}=require('../src/catalog.js');\n"
      +"test('first page',()=>assert.deepEqual(page([1,2,3]).items,[1,2]));\n"
      +"test('finds product',()=>assert.equal(findProduct([{id:'a'}],'a').id,'a'));\n",
  },
  allowedFiles:['src/page.js','src/catalog.js','test/catalog.test.js'],
  rubric:{kind:'bug-repair',mutationChecks:3,sourceModules:2},
  verify(cwd) {
    return verifyCode(cwd,{
      oracle:`const a=require('node:assert/strict'),{page}=require('./src/page.js'),{listProducts,findProduct}=require('./src/catalog.js');
for(const offset of [-1,0.5,NaN,Infinity,'0',null,2n,Number.MAX_SAFE_INTEGER+1])a.throws(()=>page([],{offset}),RangeError);
for(const limit of [0,-1,1.5,NaN,Infinity,'2',null,2n,Number.MAX_SAFE_INTEGER+1])a.throws(()=>page([],{limit}),RangeError);
const objects=Object.freeze([{id:'a'},{id:'b'},{id:'c'}]);a.deepEqual(page(objects),{items:[objects[0],objects[1]],nextOffset:2});
a.equal(page(objects).items[0],objects[0]);a.deepEqual(page(objects,{offset:2}),{items:[objects[2]],nextOffset:null});
for(const offset of [3,4,Number.MAX_SAFE_INTEGER])a.deepEqual(page(objects,{offset}),{items:[],nextOffset:null});
a.deepEqual(page([]),{items:[],nextOffset:null});a.deepEqual(page([1,2]),{items:[1,2],nextOffset:null});
const products=Object.freeze([
Object.freeze({id:'z',price:0,category:'other'}),Object.freeze({id:'b',price:2,category:'x'}),
Object.freeze({id:'a',price:2,category:'x'}),Object.freeze({id:'c',price:1,category:'x'}),Object.freeze({id:'empty',price:9,category:''})]);
const first=listProducts(products,{category:'x',limit:2});a.deepEqual(first,{items:[products[3],products[2]],nextOffset:2});a.equal(first.items[0],products[3]);
a.deepEqual(listProducts(products,{category:'x',offset:2,limit:2}),{items:[products[1]],nextOffset:null});
a.deepEqual(listProducts(products,{category:'',limit:1}),{items:[products[4]],nextOffset:null});
a.deepEqual(listProducts(products,{category:'absent'}),{items:[],nextOffset:null});
a.deepEqual(listProducts(products,{limit:1}),{items:[products[0]],nextOffset:1});
a.throws(()=>listProducts(products,{offset:-1}),RangeError);a.throws(()=>listProducts(products,{limit:0}),RangeError);
a.equal(findProduct(products,'a'),products[2]);a.equal(findProduct(products,'missing'),undefined);`,
      mutations:[
        {file:'src/page.js',body:'return {...value,page:(items,options={})=>({...value.page(items,options),nextOffset:(options.offset??0)+(options.limit??2)})};'},
        {file:'src/page.js',body:'return {...value,page:(items,options={})=>value.page(items,{...options,offset:Math.max(0,options.offset??0)})};'},
        {file:'src/catalog.js',body:'return {...value,listProducts:(items,options={})=>value.listProducts(items.slice(0,options.limit??2),options)};'},
      ],
    });
  },
};

const retryFiles={
  'src/retry.js':`'use strict';
async function retry(operation,{attempts=3,shouldRetry=()=>true,wait=async()=>{}}={}) {
  if(!Number.isSafeInteger(attempts)||attempts<=0) throw new RangeError('attempts');
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
  'src/loader.js':`'use strict';
const {retry}=require('./retry.js');
async function loadRecord(fetcher,id,options) { return retry(()=>fetcher(id),options); }
module.exports={loadRecord};
`,
};
const retryTests={
  id:'workflow-retry-tests',
  task:'Add trustworthy regression tests in test/retry.test.js for the existing src/retry.js and '
    +'src/loader.js. Production code is correct and immutable: only test/retry.test.js may change. '
    +'The contract: retry(operation, options={}) defaults to 3 total attempts, shouldRetry=()=>true, '
    +'wait=async()=>{}. attempts must be a positive safe integer, validated before operation runs. '
    +'operation receives a one-based attempt number and may throw synchronously or reject asynchronously. '
    +'Return the first success unchanged. On a final failure, rethrow the exact error without calling '
    +'shouldRetry or wait. On an earlier failure, call shouldRetry(error,attempt); false stops with the '
    +'exact error, otherwise await wait(attempt,error) before retrying. Predicate or wait errors stop '
    +'execution and propagate unchanged. loadRecord(fetcher,id,options) calls fetcher(id) through retry '
    +'and forwards every option. Cover validation, attempt limits, predicate decisions, awaited ordering, '
    +'error/success identity and loader option forwarding. Use deterministic stubs, no real timers.'+COMMON,
  files:{...retryFiles,'test/retry.test.js':HEADER+"const {retry}=require('../src/retry.js');\n"
    +"test('immediate success',async()=>assert.equal(await retry(()=>7),7));\n"},
  allowedFiles:['test/retry.test.js'],
  rubric:{kind:'test-authoring',mutationChecks:5,immutableProduction:true},
  verify(cwd) {
    return verifyCode(cwd,{
      immutable:retryFiles,
      oracle:`const a=require('node:assert/strict'),{retry}=require('./src/retry.js'),{loadRecord}=require('./src/loader.js');
(async()=>{const error=new Error('retry'),marker={};let calls=0;
a.equal(await retry(()=>{if(++calls<3)throw error;return marker;}),marker);a.equal(calls,3);
calls=0;await a.rejects(()=>loadRecord(()=>{calls++;throw error;},'id',{attempts:1}),actual=>actual===error);a.equal(calls,1);})().catch(error=>{console.error(error);process.exitCode=1;});`,
      mutations:[
        {file:'src/retry.js',body:'return {...value,retry:(operation,options)=>value.retry(operation,{...options,attempts:1})};'},
        {file:'src/retry.js',body:'return {...value,retry:(operation,options)=>value.retry(operation,{...options,shouldRetry:()=>true})};'},
        {file:'src/retry.js',body:'return {...value,retry:(operation,options)=>value.retry(operation,{...options,wait:async()=>{}})};'},
        {file:'src/retry.js',body:'return {...value,retry:(operation,options={})=>value.retry(operation,{...options,attempts:options.attempts===0?1:options.attempts})};'},
        {file:'src/loader.js',body:'return {...value,loadRecord:(fetcher,id)=>value.loadRecord(fetcher,id)};'},
      ],
    });
  },
};

const reviewFiles={
  'src/format.js':`'use strict';
function formatLabel(label) {
  return label.trim().replace('  ',' ');
}
module.exports={formatLabel};
`,
  'src/list.js':`'use strict';
function listEnabled(entries,limit=2) {
  return entries.slice(0,limit).filter(entry=>entry.enabled);
}
module.exports={listEnabled};
`,
  'src/order.js':`'use strict';
function orderByTitle(entries) {
  return entries.sort((a,b)=>a.title.localeCompare(b.title));
}
module.exports={orderByTitle};
`,
  'test/entries.test.js':HEADER+"const {formatLabel}=require('../src/format.js');\n"
    +"test('trims a label',()=>assert.equal(formatLabel(' Label '),'Label'));\n",
};
const expectedFindings=[
  {file:'src/format.js',line:3,defectClass:'whitespace-normalization',severity:'medium'},
  {file:'src/list.js',line:3,defectClass:'filter-order',severity:'medium'},
  {file:'src/order.js',line:3,defectClass:'input-mutation',severity:'medium'},
];
function exactKeys(value,keys) {
  return value!==null && typeof value==='object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort());
}
function validReview(cwd) {
  try {
    const filename=path.join(cwd,'findings.json');
    if(!fs.lstatSync(filename).isFile() || fs.statSync(filename).size>16384) return false;
    const report=JSON.parse(fs.readFileSync(filename,'utf8'));
    if(!exactKeys(report,['findings']) || !Array.isArray(report.findings)
      || report.findings.length!==expectedFindings.length) return false;
    const seen=new Set();
    return report.findings.every(finding=>{
      if(!exactKeys(finding,['file','line','defectClass','severity','explanation'])
        || typeof finding.explanation!=='string' || finding.explanation.trim().length<20
        || finding.explanation.length>1000) return false;
      const index=expectedFindings.findIndex(expected=>Object.entries(expected)
        .every(([key,value])=>finding[key]===value));
      if(index<0 || seen.has(index)) return false;
      seen.add(index);
      return true;
    });
  } catch { return false; }
}
const review={
  id:'workflow-entry-review',
  task:'Review src/format.js, src/list.js and src/order.js against this local data-shaping contract; '
    +'do not fix code. formatLabel accepts any string, trims leading and trailing JavaScript whitespace '
    +'and collapses every internal run of JavaScript whitespace (including tabs and newlines) into '
    +'one ASCII space. Entries are valid objects with a string title and boolean enabled. listEnabled '
    +'returns the first limit enabled entries in input order: disabled entries do not consume the page '
    +'limit. limit is a positive integer. orderByTitle returns a new '
    +'array ordered by title using localeCompare, preserving the original array and element identities. '
    +'Create only findings.json; all supplied files are immutable. Use this exact JSON schema with no '
    +'additional keys: {"findings":[{"file":"src/example.js","line":1,"defectClass":"filter-order",'
    +'"severity":"medium","explanation":"Concrete failure and why it violates the contract."}]}. '
    +'One finding per independently actionable defect, anchored to the exact one-based faulty statement '
    +'line. defectClass must be one of whitespace-normalization, filter-order, input-mutation, '
    +'missing-validation, wrong-comparison, unhandled-error. severity is medium for wrong results or '
    +'observable mutation, low for other demonstrated defects. explanation must '
    +'be 20–1000 characters, concrete and source-backed. Do not report speculative hardening, invalid '
    +'inputs excluded above, duplicate findings or stylistic preferences.'+COMMON,
  files:reviewFiles,
  allowedFiles:['findings.json'],
  rubric:{kind:'review',expectedDefects:3,mutationChecks:0,
    reviewScoring:'Exact source anchor, defect class and severity; all findings required, no false positives. '
      +'Explanation shape is checked, not semantic quality. The mutation gate is not applicable and mirrors the review oracle.'},
  verify(cwd) {
    const testsPassed=passed(run(cwd,['--test']));
    const oraclePassed=unchanged(cwd,reviewFiles) && validReview(cwd);
    // Review-only quality is the complete, precise finding set, not authored tests.
    return {testsPassed,oraclePassed,mutantChecksPassed:oraclePassed};
  },
};

module.exports={cases:[catalog,retryTests,review]};
