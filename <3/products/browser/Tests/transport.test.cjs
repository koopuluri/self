const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const resources = path.join(__dirname, '../Sources/GhostBrowser/Resources');

function environment() {
  const messages = [], listeners = {};
  class XHR {
    constructor() { this.listeners = {}; this.responseType = ''; }
    open(method, url) { this.url = url; }
    addEventListener(event, callback) { this.listeners[event] = callback; }
    send() { this.status = 200; this.responseText = JSON.stringify({data:{favorite_tweet:'Done'}}); this.listeners.load?.(); }
  }
  const sandbox = {
    URL, URLSearchParams, Request, Response, XMLHttpRequest: XHR, WeakMap, Promise, Date, console,
    location: {href:'https://x.com/alex/following'},
    document: {addEventListener:(event,fn)=>listeners[event]=fn,querySelectorAll:()=>[]},
    history: {pushState(state, title, url) { sandbox.location.href = new URL(url,sandbox.location.href).href; }, replaceState(state,title,url) {sandbox.location.href=new URL(url,sandbox.location.href).href;}},
    addEventListener:(event,fn)=>listeners[event]=fn,
    webkit:{messageHandlers:{ghost:{postMessage:value=>messages.push(value)}}},
    fetch: async () => new Response(JSON.stringify({data:{favorite_tweet:'Done'}}),{status:200})
  };
  sandbox.window=sandbox; sandbox.top=sandbox;
  const context = vm.createContext(sandbox);
  for (const script of ['X.js','Capture.js']) vm.runInContext(fs.readFileSync(path.join(resources,script),'utf8'),context);
  return {context,sandbox,messages,listeners};
}
const settle = () => new Promise(resolve=>setTimeout(resolve,20));
const endpoint = 'https://x.com/i/api/graphql/test/FavoriteTweet';

test('fetch wrapper emits once and leaves original response readable', async () => {
  const {sandbox,messages}=environment();
  const result=await sandbox.fetch(endpoint,{method:'POST',body:JSON.stringify({variables:{tweet_id:'123'}})});
  assert.equal((await result.json()).data.favorite_tweet,'Done');
  await settle();
  assert.equal(messages.filter(m=>m.kind==='event').length,1);
});
test('XHR wrapper captures the response once', () => {
  const {sandbox,messages}=environment();
  const xhr=new sandbox.XMLHttpRequest(); xhr.open('POST',endpoint); xhr.send(JSON.stringify({variables:{tweet_id:'123'}}));
  assert.equal(messages.filter(m=>m.kind==='event').length,1);
});
test('pausing excludes requests and discards in-flight pre-pause observations', async () => {
  const {sandbox,messages}=environment();
  const result=sandbox.fetch(endpoint,{method:'POST',body:JSON.stringify({variables:{tweet_id:'123'}})});
  sandbox.__ghostSetPaused(true);
  await result; await settle();
  assert.equal(messages.filter(m=>m.kind==='event').length,0);
  await sandbox.fetch(endpoint,{method:'POST',body:JSON.stringify({variables:{tweet_id:'456'}})}); await settle();
  assert.equal(messages.filter(m=>m.kind==='event').length,0);
});
test('SPA links preserve discovery source and ignore automatic URL rewrites', () => {
  const {sandbox,messages,listeners}=environment();
  sandbox.history.replaceState({},'', '/alex/following?lang=en');
  assert.equal(messages.filter(m=>m.kind==='navigation').length,0);
  const link={href:'https://x.com/sam',target:''};
  listeners.click({isTrusted:true,target:{closest:selector=>selector==='a[href]'?link:null}});
  sandbox.history.pushState({},'', '/sam');
  const nav=messages.find(m=>m.kind==='navigation');
  assert.equal(nav.source_url,'https://x.com/alex/following?lang=en');
  assert.equal(nav.context,'x.profile_from_following_list');
  sandbox.history.replaceState({},'', '/sam?lang=en');
  assert.equal(messages.filter(m=>m.kind==='navigation').length,1);
});
test('opening a background tab preserves source intent without a fake same-tab arrival', () => {
  const {sandbox,messages,listeners}=environment();
  const link={href:'https://x.com/sam',target:''};
  listeners.click({isTrusted:true,metaKey:true,target:{closest:()=>link}});
  sandbox.history.replaceState({},'', '/alex/following?foo=bar');
  assert.equal(messages.filter(m=>m.kind==='link').length,1);
  assert.equal(messages.filter(m=>m.kind==='navigation').length,0);
});
test('clickable post cards can produce a deliberate SPA arrival', () => {
  const {sandbox,messages,listeners}=environment();
  listeners.click({isTrusted:true,target:{closest:()=>null}});
  sandbox.history.pushState({},'', '/sam/status/123');
  assert.equal(messages.filter(m=>m.kind==='navigation').length,1);
});
