/* Merge only the additive community rules into an operator-exported live ruleset.
 * Does not authenticate, deploy, replace existing rules, or enable billing. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export function mergeRules(existing,fragment){
 if(existing.includes('match /communityProfiles/'))throw new Error('Community rules already exist; review the current version instead of adding duplicates.');
 const match=/match\s+\/databases\/\{database\}\/documents\s*\{/.exec(existing);
 if(!match)throw new Error('Expected the existing /databases/{database}/documents match. No file was replaced.');
 const open=match.index+match[0].length-1;let level=1,quote='',comment='',end=-1;
 for(let i=open+1;i<existing.length;i++){
  const c=existing[i],next=existing[i+1];
  if(comment==='line'){if(c==='\n')comment='';continue;}
  if(comment==='block'){if(c==='*'&&next==='/'){comment='';i++;}continue;}
  if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
  if(c==='/'&&next==='/'){comment='line';i++;continue;}
  if(c==='/'&&next==='*'){comment='block';i++;continue;}
  if(c==='\''||c==='"'){quote=c;continue;}
  if(c==='{')level++;if(c==='}'&&--level===0){end=i;break;}
 }
 if(end<0)throw new Error('Unbalanced existing rules. No file was replaced.');
 return existing.slice(0,end)+'\n// BEGIN KimKim Community beta v1\n'+fragment+'\n// END KimKim Community beta v1\n'+existing.slice(end);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),input=args[args.indexOf('--existing')+1],output=args[args.indexOf('--out')+1];
 if(!args.includes('--existing')||!args.includes('--out')||!input||!output)throw new Error('Usage: node scripts/prepare-community-rules.mjs --existing /path/live.rules --out /path/reviewed.rules');
 if(resolve(input)===resolve(output))throw new Error('Output must be a separate review file.');
 const fragment=readFileSync(new URL('../firebase/community.rules.fragment',import.meta.url),'utf8');
 const merged=mergeRules(readFileSync(input,'utf8'),fragment);mkdirSync(dirname(resolve(output)),{recursive:true});writeFileSync(output,merged);
 console.log('Prepared '+resolve(output)+'. Review all overlapping allow rules before deploying to adolfkimkim.');
}
