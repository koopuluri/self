import test from 'node:test';
import assert from 'node:assert/strict';
import {bloomAt,scaleAt,sanitize,DEFAULTS} from './math.js';
test('recursive flowers hand off with identical scale and opening',()=>{
  for(const zoom of [2.8,3.8,5])for(let i=-5;i<4;i++)for(let ring=0;ring<3;ring++)for(const bias of [-1,0,1]){
    assert.ok(Math.abs(scaleAt(i,1,zoom)-scaleAt(i+1,0,zoom))<1e-8);
    assert.equal(bloomAt(i,1,ring,bias),bloomAt(i+1,0,ring,bias));
  }
});
test('blossoms open monotonically as they approach',()=>{
  for(let i=-3;i<2;i++)for(let r=0;r<3;r++)assert.ok(bloomAt(i,.8,r)>=bloomAt(i,.2,r));
});
test('shared settings cannot break geometry or timing',()=>{
  assert.deepEqual(sanitize({}),DEFAULTS);
  assert.equal(sanitize({duration:0,zoom:100}).duration,3);
  assert.equal(sanitize({duration:'garbage',figure:'no'}).duration,5);
});
