import test from 'node:test';import assert from 'node:assert/strict';import {mergeRules}from '../scripts/prepare-community-rules.mjs';
test('merge preserves existing owner rules and ignores braces in strings and comments',()=>{
 const source=`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents {
 // ignored }
 function pattern() { return 'a{2}'; }
 /* ignored } */ match /users/{uid}/{rest=**} { allow read: if request.auth.uid == uid; }
 } }`;
 const fragment='match /communityConfig/release { allow get: if request.auth != null; }';
 const result=mergeRules(source,fragment);assert(result.includes(fragment));assert(result.includes('request.auth.uid == uid;'));assert(result.endsWith('} }'));assert.equal(result.replace('\n// BEGIN KimKim Community beta v1\n'+fragment+'\n// END KimKim Community beta v1\n',''),source);
});
test('merge refuses duplicate or malformed rules instead of replacing the live ruleset',()=>{
 assert.throws(()=>mergeRules('match /communityProfiles/{uid} {}',''));assert.throws(()=>mergeRules('service cloud.firestore {}',''));assert.throws(()=>mergeRules('match /databases/{database}/documents {',''));
});
