import glob
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.expanduser('~/.pi/agent/sessions')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extracts')
os.makedirs(OUT, exist_ok=True)

SIGNALS = re.compile(
    r'\b(wtf|fuck\w*|shit|damn\w*|stop\b|no no|why did you|why are you|i never asked'
    r'|i did not ask|i didn\'?t ask|churn|bullshit|useless|pedantic|gold.?plat\w*'
    r'|what are you doing|what exactly are you doing|not what i|i told you|you ignored'
    r'|you keep|again\?|do not do that|don\'?t do that|undo that|revert that|wrong again'
    r'|listen\b|pay attention|frustrat\w*|annoy\w*|waste of|wasting)\b',
    re.IGNORECASE)

# already deep-analyzed today (dotfiles friction sessions)
KNOWN = {'019f6b09', '019f6bb0', '019f6c3b', '019f6cad'}

def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ' '.join(p.get('text', '') for p in content
                        if isinstance(p, dict) and p.get('type') == 'text')
    return ''

results = []
for path in glob.glob(os.path.join(ROOT, '*', '*.jsonl')):
    slug = os.path.basename(os.path.dirname(path))
    fname = os.path.basename(path)
    turns = []
    try:
        with open(path, encoding='utf-8') as f:
            for line in f:
                if '"message"' not in line and '"role"' not in line:
                    continue
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if e.get('type') != 'message':
                    continue
                m = e.get('message', e)
                role = m.get('role')
                if role not in ('user', 'assistant'):
                    continue
                txt = text_of(m.get('content')).strip()
                if txt:
                    turns.append((role, txt))
    except OSError:
        continue

    user_turns = [t for r, t in turns if r == 'user']
    hits = []
    for t in user_turns:
        # skip injected workflow prompts / tool noise: real typed messages are shortish
        if len(t) > 3000:
            continue
        for mt in SIGNALS.finditer(t):
            hits.append(mt.group(0).lower())
        if len(t) > 5 and t.upper() == t and re.search(r'[A-Z]{4,}', t):
            hits.append('ALLCAPS')
    if not hits:
        continue
    score = len(hits)
    known = any(k in fname for k in KNOWN)
    results.append((score, slug, fname, path, sorted(set(hits)), len(user_turns), known))

results.sort(reverse=True)
print(f"{len(results)} sessions with friction signals (of scanned corpus)\n")
for score, slug, fname, path, sigs, nuser, known in results:
    tag = ' [ALREADY-ANALYZED]' if known else ''
    print(f"score={score:3d} user_turns={nuser:3d} {slug} {fname[:40]}{tag}")
    print(f"   signals: {', '.join(sigs)}")

# extract transcripts for candidates scoring >= 3, excluding known
count = 0
for score, slug, fname, path, sigs, nuser, known in results:
    if score < 3 or known:
        continue
    out_path = os.path.join(OUT, f"{score:03d}__{slug}__{fname.replace('.jsonl', '')}.txt")
    with open(path, encoding='utf-8') as f, open(out_path, 'w', encoding='utf-8') as o:
        o.write(f"SESSION: {path}\nSIGNALS: {', '.join(sigs)}\n\n")
        for line in f:
            if '"message"' not in line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if e.get('type') != 'message':
                continue
            m = e.get('message', e)
            role = m.get('role')
            if role not in ('user', 'assistant'):
                continue
            txt = text_of(m.get('content')).strip()
            if not txt:
                continue
            limit = 2500 if role == 'user' else 1200
            o.write(f"[{role.upper()}] {txt[:limit]}\n\n")
    count += 1
print(f"\nextracted {count} candidate transcripts to {OUT}")
