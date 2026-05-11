# Classifier mode evidence
timestamp: 2026-05-08T04:03:45Z
cwd: <worktree>
branch: plan/prompt-router-control-plane
## valid --prompt-file t2
exit: 0
{'schema_version': '3.0.0', 'primary_keys': ['effort', 'model_tier'], 'candidate_count': 12, 'confidence_present': True}
## invalid mode
exit: 2
usage: classify.py [-h] [--classifier {t2,ensemble,lgbm,confgate}]
                   [--prompt-file PROMPT_FILE] [--artifact-inventory]
                   [prompt ...]
classify.py: error: argument --classifier: invalid choice: 'invalid' (choose from t2, ensemble, lgbm, confgate)
