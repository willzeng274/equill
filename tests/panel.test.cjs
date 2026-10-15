const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const main=fs.readFileSync(__dirname+'/../src/main.js','utf8');
const html=fs.readFileSync(__dirname+'/../src/main.html','utf8');
async function panel(rewrite) {
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://extension.test/'});
 dom.window.chrome={storage:{local:{get:async defaults=>({...defaults,apiKey:'test-only'}),set:async()=>{},remove:async()=>{}}},runtime:{onMessage:{addListener(){}}}};
 dom.window.CohereAPI={rewrite,reset(){}};
 dom.window.eval(main);await new Promise(resolve=>setImmediate(resolve));
 return dom;
}
const result={inclusiveText:'Hello everyone',nonInclusiveTexts:[{text:'guys',reason:'Use a neutral greeting',replacement:'everyone'}],model:'command-a-plus-05-2026'};
test('successful rewrite renders suggestions and score, and clears all loading UI',async()=>{
 const dom=await panel(async()=>result),w=dom.window;
 await w.getResults('Hello guys');
 assert.equal(w.document.getElementById('results').textContent,'Hello everyone');
 assert.equal(w.document.getElementById('score').textContent,'98');
 assert.equal(w.document.querySelectorAll('.highlight-final').length,1);
 for(const id of ['loading-overlay','spinner'])assert.ok(w.document.getElementById(id).classList.contains('hidden'));
 const span=w.document.querySelector('.highlight-original');span.dispatchEvent(new w.Event('mouseenter'));assert.equal(span.textContent,'everyone');span.dispatchEvent(new w.Event('mouseleave'));assert.equal(span.textContent,'guys');
 dom.window.close();
});
test('API errors are visible and never leave the spinner running',async()=>{
 const dom=await panel(async()=>{throw new Error('Cohere rate or usage limit reached.');}),w=dom.window;
 await w.getResults('Hello guys');assert.match(w.document.getElementById('results').textContent,/limit reached/);
 for(const id of ['loading-overlay','spinner'])assert.ok(w.document.getElementById(id).classList.contains('hidden'));
 dom.window.close();
});
test('latest request wins when responses arrive out of order',async()=>{
 const pending=[];const dom=await panel(()=>new Promise(resolve=>pending.push(resolve))),w=dom.window;
 const a=w.getResults('first'),b=w.getResults('second');
 pending[1]({...result,inclusiveText:'second result'});await b;
 pending[0]({...result,inclusiveText:'first result'});await a;
 assert.equal(w.document.getElementById('results').textContent,'second result');dom.window.close();
});
test('model and source markup render only as text',async()=>{
 const payload='<img src=x onerror="alert(1)">';
 const dom=await panel(async()=>({...result,inclusiveText:payload,nonInclusiveTexts:[{text:payload,reason:payload,replacement:payload}]})),w=dom.window;
 await w.getResults(payload);assert.equal(w.document.querySelector('#results img'),null);assert.equal(w.document.querySelector('#suggestions-container img'),null);assert.equal(w.document.getElementById('results').textContent,payload);dom.window.close();
});
test('first-time settings retain defaults instead of undefined values',async()=>{
 let seen;const dom=await panel(async args=>{seen=args;return result;});
 await dom.window.getResults('Hello guys');assert.doesNotMatch(seen.instructions,/undefined/);assert.equal(dom.window.document.getElementById('country').value,'International');dom.window.close();
});
