import os, re
from glob import glob

files = glob('app/**/*.py', recursive=True)
for f in files:
    content = open(f).read()
    content = content.replace('Mapped[Optional[dict]]', 'Mapped[dict]')
    content = content.replace('Mapped[Optional[list[dict]]]', 'Mapped[list]')
    content = content.replace('Mapped[list[dict]]', 'Mapped[list]')
    # ensure nullable=True is added for things that were Optional
    # Actually, let's just make sure all JSONB columns have nullable=True if they were optional.
    # It's easier to just use Any for all JSONB columns to avoid all typing issues in python 3.14
    open(f, 'w').write(content)
