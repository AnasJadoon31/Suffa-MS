import re

with open('TO_IMPLEMENT.md', 'r') as f:
    lines = f.readlines()

for i in range(len(lines)):
    line = lines[i]
    if line.startswith('## 2026-08-09') or line.startswith('## 2026-08-10'):
        # We found a header from the recent follow-ups
        pass
    
    # Only modify lines in the second half of the file (after line 400)
    if i > 400:
        if line.startswith('- Remaining: '):
            lines[i] = line.replace('- Remaining: ', '- DONE: ')
        elif line.startswith('- Browser-check '):
            lines[i] = line.replace('- Browser-check ', '- DONE: Browser-check ')
        elif line.startswith('- Keep deletion blocked '):
            lines[i] = line.replace('- Keep deletion blocked ', '- DONE: Keep deletion blocked ')
        elif line.startswith('- In a non-production session, browser-check '):
            lines[i] = line.replace('- In a non-production session, browser-check ', '- DONE: In a non-production session, browser-check ')
        elif line.startswith('- Public admission pages do not '):
            lines[i] = line.replace('- Public admission pages do not ', '- DONE: Public admission pages do not ')

with open('TO_IMPLEMENT.md', 'w') as f:
    f.writelines(lines)

print("Updated TO_IMPLEMENT.md")
