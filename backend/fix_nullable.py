import os, re
from glob import glob

files = glob('app/**/*.py', recursive=True)

for f in files:
    content = open(f).read()
    # Fix ForeignKey("...", nullable=True)
    content = re.sub(r'ForeignKey\("([^"]+)", nullable=True\)', r'ForeignKey("\1")', content)
    # Fix String(N, nullable=True)
    content = re.sub(r'String\(([^,]+), nullable=True\)', r'String(\1)', content)
    # Fix DateTime(timezone=True, nullable=True)
    content = re.sub(r'DateTime\(timezone=True, nullable=True\)', r'DateTime(timezone=True)', content)
    # Add nullable=True to mapped_column if not present but we need it? 
    # Actually, if I just replace all of the above, I need to add nullable=True to mapped_column.
    # Let's just blindly add nullable=True before the closing parenthesis of mapped_column? 
    # Better yet, let's just use git checkout to reset, but I didn't commit the models.
    # Wait, the previous script DID add nullable=True, but it put it in the wrong place for calls with 1 pair of parens inside mapped_column.
    
    # Instead of doing that, let's just make a script that safely adds nullable=True to mapped_column if it is not there.
    open(f, 'w').write(content)
