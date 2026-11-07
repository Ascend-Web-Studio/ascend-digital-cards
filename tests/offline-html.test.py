"""Validate the delivered file, not just its original JavaScript bundle."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess

class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts = []
        self.active = None
        self.outside_text = []
        self.style = False
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.active = {'attrs': dict(attrs), 'body': ''}
            self.scripts.append(self.active)
        if tag == 'style': self.style = True
    def handle_endtag(self, tag):
        if tag == 'script': self.active = None
        if tag == 'style': self.style = False
    def handle_data(self, data):
        if self.active is not None: self.active['body'] += data
        elif not self.style: self.outside_text.append(data)

root = Path(__file__).resolve().parents[1]
doc = Document()
doc.feed((root / 'offline-demo/START-HERE.html').read_text(encoding='utf-8'))
assert len(doc.scripts) == 2, f'Expected 2 script elements, got {len(doc.scripts)}'
assert 'window.__ASCEND_OFFLINE__=true' in doc.scripts[0]['body']
assert doc.scripts[1]['attrs'].get('type') == 'module'
assert all('src' not in script['attrs'] for script in doc.scripts)
assert len(doc.scripts[1]['body']) > 100_000
assert len(''.join(doc.outside_text).strip()) < 200, 'JavaScript leaked into visible document text'
check = root / '.sites-runtime/offline-delivered-script.mjs'
check.write_text(doc.scripts[1]['body'], encoding='utf-8')
subprocess.run(['node', '--check', str(check)], check=True)
print('Passed: generated offline HTML has two valid inline scripts, no external script dependency and no JavaScript leaking into page text.')
