import os
import re

def find_closing_tag(text, start_idx):
    # This finds the closing '>' for a tag, ignoring any '>' that appear inside '{ ... }' or '" ... "'
    in_braces = 0
    in_quotes = False
    for i in range(start_idx, len(text)):
        if text[i] == '"' and text[i-1] != '\\':
            in_quotes = not in_quotes
        elif not in_quotes:
            if text[i] == '{':
                in_braces += 1
            elif text[i] == '}':
                in_braces -= 1
            elif text[i] == '>' and in_braces == 0:
                return i
    return -1

def find_closing_brace(text, start_idx):
    count = 0
    for i in range(start_idx, len(text)):
        if text[i] == '{': count += 1
        elif text[i] == '}':
            count -= 1
            if count == 0: return i
    return -1

def extract_prop(text, prop_name):
    idx = text.find(f'{prop_name}=')
    if idx == -1: return None
    val_start = idx + len(f'{prop_name}=')
    if text[val_start] == '"':
        end = text.find('"', val_start + 1)
        return text[val_start:end+1]
    elif text[val_start] == '{':
        end = find_closing_brace(text, val_start)
        return text[val_start:end+1]
    return None

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    idx = 0
    out = ""
    
    while True:
        m_start = content.find('<Modal ', idx)
        if m_start == -1:
            out += content[idx:]
            break
            
        m_end = find_closing_tag(content, m_start)
        if m_end == -1:
            out += content[idx:m_start+7]
            idx = m_start + 7
            continue
            
        modal_tag = content[m_start:m_end+1]
        
        form_search_start = m_end + 1
        curr = form_search_start
        while curr < len(content) and content[curr] in ' \n\t\r':
            curr += 1
            
        if not content.startswith('<form', curr):
            out += content[idx:m_start+7]
            idx = m_start+7
            continue
            
        form_start = curr
        form_end = find_closing_tag(content, form_start)
        form_tag = content[form_start:form_end+1]
        
        if 'className="inlineForm"' not in form_tag:
            out += content[idx:m_start+7]
            idx = m_start+7
            continue
            
        close_form = content.find('</form>', form_end)
        close_modal = content.find('</Modal>', close_form)
        
        if close_form == -1 or close_modal == -1:
            out += content[idx:m_start+7]
            idx = m_start+7
            continue
            
        inner_content = content[form_end+1:close_form]
        
        title = extract_prop(modal_tag, 'title')
        onClose = extract_prop(modal_tag, 'onClose')
        onSubmit = extract_prop(form_tag, 'onSubmit')
        
        error_prop = ""
        error_regex = r'\{error && <p className="notice" style=\{\{\s*color:\s*"var\(--rose\)"\s*\}\}\>\{error\}</p>\}'
        if re.search(error_regex, inner_content):
            error_prop = '\n  error={error}'
            inner_content = re.sub(error_regex, '', inner_content).strip()
            
        actions_start = inner_content.find('<div className="formActions"')
        if actions_start != -1:
            actions_end = inner_content.find('</div>', actions_start) + 6
            actions_block = inner_content[actions_start:actions_end]
            inner_content = inner_content[:actions_start] + inner_content[actions_end:]
            inner_content = inner_content.strip()
            
            button_match = re.search(r'<Button([^>]*?type="submit"[^>]*?)>([\s\S]*?)</Button>', actions_block, re.DOTALL)
            if button_match:
                btn_props = button_match.group(1)
                inner_btn = button_match.group(2).strip()
                
                disabled_match = re.search(r'disabled=(\{.*?\})', btn_props)
                disabled_prop = f'\n  submitDisabled={disabled_match.group(1)}' if disabled_match else ""
                
                icon_match = re.match(r'(<[A-Za-z0-9]+.*?/>)\s*(.*)', inner_btn, re.DOTALL)
                if icon_match:
                    icon = icon_match.group(1)
                    label = icon_match.group(2).strip()
                    submitIcon_prop = f'\n  submitIcon={{{icon}}}'
                    submitLabel_prop = f'\n  submitLabel={{{label}}}' if not label.startswith('{') else f'\n  submitLabel={label}'
                else:
                    submitIcon_prop = ""
                    submitLabel_prop = f'\n  submitLabel={{{inner_btn}}}' if not inner_btn.startswith('{') else f'\n  submitLabel={inner_btn}'
            else:
                out += content[idx:m_start+7]
                idx = m_start+7
                continue
        else:
            out += content[idx:m_start+7]
            idx = m_start+7
            continue
            
        new_block = f'<FormModal\n  title={title}\n  onClose={onClose}'
        if onSubmit: new_block += f'\n  onSubmit={onSubmit}'
        new_block += f'{submitLabel_prop}{submitIcon_prop}{disabled_prop}{error_prop}\n>\n  {inner_content}\n</FormModal>'
        
        out += content[idx:m_start] + new_block
        idx = close_modal + 8
        
    out += content[idx:]
    if '<FormModal' in out and 'FormModal' not in original:
        out = re.sub(r'import\s+\{\s*Modal\s*\}\s+from\s+"([^"]*?)Modal";', r'import { Modal, FormModal } from "\1Modal";', out)
        
    if out != original:
        with open(filepath, 'w') as f:
            f.write(out)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src/components'):
    for file in files:
        if file.endswith('.tsx') and 'ui' not in root:
            process_file(os.path.join(root, file))
