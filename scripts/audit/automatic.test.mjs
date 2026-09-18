import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticFindings } from '../../extension/lib/automatic.mjs';
const start=Date.parse('2026-09-14T12:00:00Z');
const step={name:'Cart',action:'cart',automatic:true,startedAt:new Date(start).toISOString()};
const pixel={platform:'Meta',event:'PageView',status:200,at:new Date(start-10000).toISOString()};
test('inference waits for capture window and requires observed vendor',()=>{
 assert.equal(automaticFindings([step],[],start+9000).length,0);
 assert.equal(automaticFindings([step],[pixel],start+7000).length,0);
 assert.equal(automaticFindings([step],[{...pixel,failed:true}],start+9000).length,0);
 const [finding]=automaticFindings([step],[pixel],start+9000);
 assert.equal(finding.severity,'warning'); assert.equal(finding.inferred,true);
});
test('delayed event across step boundary satisfies inferred expectation',()=>{
 const event={...pixel,event:'AddToCart',step:'Next page',at:new Date(start+6000).toISOString()};
 assert.equal(automaticFindings([step],[pixel,event],start+9000).length,0);
});
test('generic form submissions and unknown platforms do not infer conversions',()=>{
 assert.equal(automaticFindings([{...step,action:'form'}],[pixel],start+9000).length,0);
 assert.equal(automaticFindings([step],[{...pixel,platform:'Google Ads'}],start+9000).length,0);
});
