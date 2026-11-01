"""Read-only inventory of current UI color literals.

The historical migration inventory is docs/ui-color-audit.csv. This command never
rewrites source CSS, the compatibility palette, or the historical inventory.
"""
from pathlib import Path
import re, csv, json
root = Path('frontend')
out = Path('docs')
out.mkdir(exist_ok=True)
pattern = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|(?<=:)\s*(?:white|black)\b')
foundations = {'design-tokens.css', 'legacy-color-tokens.css'}
content = {'storyEditor.js', 'storyGeometry.js', 'appearance.js', 'notes-studio.js', 'postStudio.js', 'communityCover.js', 'teamService.js'}
rows = []
for p in sorted(root.rglob('*')):
    if p.suffix not in {'.css', '.js', '.html'} or p.name in {'kimkim.html', 'sw.js'}:
        continue
    for line_no, line in enumerate(p.read_text().splitlines(), 1):
        for match in pattern.finditer(line):
            classification = 'token foundation' if p.name in foundations else 'content / canvas / data validation' if p.name in content else 'UI'
            rows.append([str(p), line_no, match.group().strip(), classification])
with (out / 'ui-color-current.csv').open('w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['file', 'line', 'color', 'classification'])
    writer.writerows(rows)
print(json.dumps({'occurrences': len(rows), 'files': len({r[0] for r in rows}), 'report': str(out / 'ui-color-current.csv'), 'sourceModified': False}))
