import os, re
from glob import glob

files = glob('app/**/*.py', recursive=True)
p = re.compile(r'Mapped\[([A-Za-z0-9_\[\]\.\, ]+) \| None\]')

for f in files:
    content = open(f).read()
    if '| None' in content:
        content = p.sub(r'Mapped[Optional[\1]]', content)
        if 'Optional' in content and 'from typing import' not in content:
            content = 'from typing import Optional\n' + content
        elif 'Optional' in content and 'from typing import Optional' not in content:
            content = content.replace('from typing import ', 'from typing import Optional, ')
        open(f, 'w').write(content)
