import re
import glob
import os

files = glob.glob("app/src/routes/*.tsx")

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    
    # We want to find cases where AppShell has right={...} and there's a FilterBar.
    # It's tricky with regex because of nested braces.
    print(f"File: {f}")
