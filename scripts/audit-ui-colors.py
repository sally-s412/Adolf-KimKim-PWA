"""Inventory UI literals and migrate legacy CSS to centralized compatibility tokens.
Brand/content SVG images and canvas drawing colors are intentionally separate from UI surfaces.
"""
from pathlib import Path
import re,csv,json
root=Path('frontend');out=Path('docs');out.mkdir(exist_ok=True)
pattern=re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)')
rows=[]
for p in sorted(root.rglob('*')):
 if p.suffix not in ['.css','.js','.html'] or p.name in ['kimkim.html','sw.js','legacy-color-tokens.css']:continue
 for n,line in enumerate(p.read_text().splitlines(),1):
  for match in pattern.finditer(line):
   literal=match.group();scope='token foundation' if p.name=='design-tokens.css' else 'content / canvas / data validation' if p.name in ['storyEditor.js','storyGeometry.js','appearance.js','notes-studio.js','postStudio.js'] else 'UI'
   rows.append([str(p),n,literal,scope])
with (out/'ui-color-audit.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['file','line','original_color','classification']);w.writerows(rows)
# Unused legacy styles remain loadable for compatibility, with values centralized.
values={}
for p in root.glob('*.css'):
 if p.name in ['design-tokens.css','legacy-color-tokens.css']:continue
 s=p.read_text()
 def token(m):
  value=m.group();key='--compat-color-'+str(len(values)+1)
  if value in values:key=values[value]
  else:values[value]=key
  return 'var('+key+')'
 p.write_text(pattern.sub(token,s))
(root/'legacy-color-tokens.css').write_text('/* Compatibility layer; semantic components override these legacy values. */\n:root{\n'+'\n'.join(key+':'+value+';' for value,key in values.items())+'\n}\n')
summary={'occurrences':len(rows),'files':len(set(r[0] for r in rows)),'compatibilityTokens':len(values),'semanticSource':'frontend/design-tokens.css'}
(out/'ui-color-audit-summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary))
