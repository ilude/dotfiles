# Classifier artifact inventory evidence
timestamp: 2026-05-08T04:03:50Z
cwd: <worktree>
branch: plan/prompt-router-control-plane
## t2
{'classifier': 't2', 'artifacts': [{'model': 'router_v3.joblib', 'sha256': 'router_v3.sha256', 'hash_prefix': '1da4d8c292b0'}]}
exit:0
## lgbm
{'classifier': 'lgbm', 'artifacts': [{'model': 'router_v3_lgbm.joblib', 'sha256': 'router_v3_lgbm.sha256', 'hash_prefix': '5c0f18aa4d25'}]}
exit:0
## ensemble
{'classifier': 'ensemble', 'artifacts': [{'model': 'router_v3.joblib', 'sha256': 'router_v3.sha256', 'hash_prefix': '1da4d8c292b0'}, {'model': 'router_v3_lgbm.joblib', 'sha256': 'router_v3_lgbm.sha256', 'hash_prefix': '5c0f18aa4d25'}]}
exit:0
## confgate
{'classifier': 'confgate', 'artifacts': [{'model': 'router_v3.joblib', 'sha256': 'router_v3.sha256', 'hash_prefix': '1da4d8c292b0'}, {'model': 'router_v3_lgbm.joblib', 'sha256': 'router_v3_lgbm.sha256', 'hash_prefix': '5c0f18aa4d25'}]}
exit:0
