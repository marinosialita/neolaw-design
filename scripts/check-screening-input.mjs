import assert from 'node:assert/strict';
import {screeningInputIssue} from '../modules/screening-input.js';
let checks=0;
for(const registrationNumber of ['---','...',' / ','( )','HE123,HE456']){
 const issue=screeningInputIssue({name:'Example Company',type:'entity',registrationNumber});
 assert.equal(issue?.code,'invalid_company_number');assert.equal(issue.field,'registrationNumber');assert.ok(issue.formMessage);checks++;
}
for(const registrationNumber of ['HE 001234','HRB 12/2024','123.456.789','甲123','1','',' ']){
 assert.equal(screeningInputIssue({name:'Example Company',type:'entity',registrationNumber}),null);checks++;
}
assert.equal(screeningInputIssue({name:'Example Individual',type:'person',registrationNumber:'---'}),null);checks++;
const mixed=screeningInputIssue({name:'Example Individual passport number TEST000111',type:'person'});
assert.equal(mixed.code,'passport_in_name');assert.equal(mixed.suggestedName,'Example Individual');checks++;
console.log(`${checks} input checks passed. Synthetic values only; no network or provider calls.`);
