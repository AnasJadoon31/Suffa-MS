import os, re
from glob import glob

files = glob('app/**/*.py', recursive=True)
p_mapped_opt = re.compile(r'Mapped\[Optional\[([^\]]+)\]\]')
p_mapped_union = re.compile(r'Mapped\[([^\|]+)\s*\|\s*None\]')
p_mapped_col = re.compile(r'(mapped_column\([^)]*)(\))')

for f in files:
    content = open(f).read()
    new_lines = []
    changed = False
    for line in content.split('\n'):
        if 'Mapped[' in line and ('Optional[' in line or '| None' in line):
            # If it has Optional or | None in Mapped, it should be nullable=True
            if 'nullable=' not in line and 'mapped_column' in line:
                line = p_mapped_col.sub(r'\1, nullable=True\2', line)
            
            # Remove Optional[]
            line = p_mapped_opt.sub(r'Mapped[\1]', line)
            # Remove | None
            line = p_mapped_union.sub(r'Mapped[\1]', line)
            changed = True
        new_lines.append(line)
        
    if changed:
        open(f, 'w').write('\n'.join(new_lines))
