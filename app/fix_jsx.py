import os

for root, _, files in os.walk('src/components'):
    for file in files:
        if file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r') as f:
                content = f.read()
            if ' / />' in content:
                content = content.replace(' / />', ' />')
                with open(filepath, 'w') as f:
                    f.write(content)
                print(f"Fixed {filepath}")
