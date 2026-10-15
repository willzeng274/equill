const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/../src/cohere.js', 'utf8');
const model = (name, extra={}) => ({name, endpoints:['chat'], is_deprecated:false, finetuned:false, ...extra});
const old = model('command-r-plus-08-2024');
const latest = model('command-a-plus-05-2026');
const ok = data => ({ok:true,status:200,json:async()=>data});
const fail = (status,message) => ({ok:false,status,json:async()=>({message})});
const result = {inclusiveText:'Hello everyone', nonInclusiveTexts:[{text:'guys',reason:'Use a neutral greeting',replacement:'everyone'}]};
const chat = value => ok({finish_reason:'COMPLETE',message:{content:[{type:'text',text:JSON.stringify(value)}]}});
const args = {apiKey:'test-only', instructions:'Edit inclusively',text:'Hello guys',temperature:'0.3',seed:'42'};
function setup(fetch) { const ctx = vm.createContext({fetch,AbortSignal,URLSearchParams}); vm.runInContext(source,ctx); return vm.runInContext('CohereAPI',ctx); }
test('selects newest active general models and excludes deprecated, specialised and fine-tuned models',()=>{
 const api=setup();const selected=api.selectModels([old,latest,model('command-a-reasoning-08-2025'),model('command-a-03-2025',{is_deprecated:true}),model('command-a-09-2027',{finetuned:true})]);
 assert.deepEqual(Array.from(selected),[latest.name,old.name]);
});
test('uses v2 messages, numeric settings and JSON mode; caches discovery; preserves original input',async()=>{
 const calls=[];const api=setup(async(url,options)=>{calls.push({url,options});return url.includes('/models')?ok({models:[old,latest]}):chat(result);});
 const output=await api.rewrite(args);await api.rewrite(args);
 assert.equal(output.originalText,args.text);assert.equal(output.model,latest.name);
 assert.equal(calls.filter(x=>x.url.includes('/models')).length,1);
 const body=JSON.parse(calls[1].options.body);assert.equal(body.model,latest.name);assert.equal(body.messages[1].content,args.text);assert.equal(body.temperature,0.3);assert.equal(body.seed,42);assert.equal(body.response_format.type,'json_object');assert.equal(body.connectors,undefined);assert.match(calls[1].url,/v2\/chat$/);
});
test('follows model-list pagination',async()=>{
 const api=setup(async url=>url.includes('page_token=next')?ok({models:[latest]}):url.includes('/models')?ok({models:[old],next_page_token:'next'}):chat(result));
 assert.equal((await api.rewrite(args)).model,latest.name);
});
test('falls back when a selected model is unavailable',async()=>{
 const api=setup(async(url,opt)=>url.includes('/models')?ok({models:[old,latest]}):JSON.parse(opt.body).model===latest.name?fail(404,'model not found'):chat(result));
 assert.equal((await api.rewrite(args)).model,old.name);
});
test('does not retry authentication, quota or malformed-input failures',async()=>{
 for(const status of [401,429,400]) {let chats=0;const api=setup(async url=>url.includes('/models')?ok({models:[old,latest]}):(chats++,fail(status,'invalid input')));await assert.rejects(api.rewrite(args));assert.equal(chats,1);}
});
test('uses supported fallback if catalogue service is down',async()=>{
 const api=setup(async url=>url.includes('/models')?fail(503,'outage'):chat(result));assert.equal((await api.rewrite(args)).model,latest.name);
});
test('does not use known deprecated models when catalogue has no active models',async()=>{
 let chats=0;const api=setup(async url=>url.includes('/models')?ok({models:[model(old.name,{is_deprecated:true})]}):(chats++,chat(result)));
 await assert.rejects(api.rewrite(args),/No active/);assert.equal(chats,0);
});
test('rejects malformed JSON, invalid structure and truncated generations',async()=>{
 for(const payload of [{message:{content:[{type:'text',text:'oops'}]}},{message:{content:[{type:'text',text:'{"inclusiveText":"hi"}'}]}},{finish_reason:'MAX_TOKENS'}]) {
  const api=setup(async url=>url.includes('/models')?ok({models:[latest]}):ok(payload));await assert.rejects(api.rewrite(args));
 }
});
test('cancelled discovery does not start a chat',async()=>{
 const controller=new AbortController();controller.abort();let chats=0;
 const api=setup(async(url,opt)=>{if(url.includes('/models'))throw new Error('cancelled');chats++;return chat(result);});
 await assert.rejects(api.rewrite({...args,signal:controller.signal}));assert.equal(chats,0);
});
