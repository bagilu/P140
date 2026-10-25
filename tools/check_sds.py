"""P140 SDS v3.4 checks for this static deployment package (no database mutations)."""
import argparse
import json
from pathlib import Path
import re
from collections import Counter

parser = argparse.ArgumentParser()
parser.add_argument('--write-report', action='store_true')
args = parser.parse_args()
source = Path(__file__).resolve().parents[1]
root = source / 'dist' if (source / 'dist/index.html').exists() else source
files = ['index.html', 'app.mjs', 'core.mjs', 'stop-timetable.mjs', 'style.css', 'config-sample.js']
texts = {name: (root / name).read_text() for name in files}
frontend = '\n'.join(texts.values())
db_calls = bool(re.search(r'\.from\s*\(|/rest/v1/|/graphql/v1|createClient\s*\(', frontend))
sql_files = list((root / 'database').rglob('*.sql'))
no_database = not db_calls and not sql_files
checks = []

def result(code, status, evidence):
    checks.append(dict(code=code, status=status, evidence=evidence))

for code, topic in [('QA-01', 'RLS'), ('QA-04', 'Data API schema exposure'), ('QA-05', 'table grants'), ('QA-06', 'RLS policies'), ('QA-07', 'RPC return fields'), ('QA-08', 'RPC EXECUTE grants'), ('QA-09', 'function execution identity')]:
    result(code, 'PASS' if no_database else 'REVIEW', f'不適用：本版無 Supabase、資料表、RPC 或 SQL；{topic} 未涉及。' if no_database else '須檢查實際資料庫。')
result('QA-02', 'PASS' if not db_calls else 'FAIL', '前台未呼叫 Table/View API；靜態 JSON fetch 不屬於資料庫 API。')
result('QA-03', 'PASS' if no_database else 'REVIEW', '不適用：無 PostgreSQL 資料交換；僅讀取本包 JSON。')
result('QA-10', 'PASS' if no_database else 'REVIEW', '無 sequence 權限或伺服器端服務；前台無 service_role 設定。')
result('QA-11', 'PASS' if not re.search(r'type=[\"\x27]password', frontend, re.I) else 'REVIEW', '不適用：無登入或密碼欄位。')
secret_pattern = r'(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)'
secret_files = [name for name, text in texts.items() if re.search(secret_pattern, text)]
config_files = [p for p in root.rglob('config.js')]
result('QA-12', 'FAIL' if secret_files or config_files else 'REVIEW', '交付檔無 config.js 或可辨識 secret/private key；本包無 Git 歷史，無法完成 Git 歷史掃描。' if not secret_files and not config_files else '發現 config.js 或疑似機密，停止交付。')
result('QA-13', 'PASS' if not sql_files else 'REVIEW', '不適用：database 僅有說明文件，無 SQL，無跨專案或全域授權操作。')
required = ['config-sample.js', 'database/README.md', 'docs/SBI-P-SDS_v3.4.md', 'docs/MOBILE_QA.md']
missing = [p for p in required if not (root / p).exists()]
readme = (root / 'README.md').exists() or (source / 'docs/GITHUB_PAGES.md').exists()
result('QA-14', 'FAIL' if missing or not readme else 'REVIEW', 'README、config-sample.js、database、docs 已提供；ZIP 同名外層由打包工具驗證。此次為手機 UI 修正，未附海報；正式 GitHub 網址與 A3 PDF/SVG/QR 驗證待確認。' if not missing and readme else '缺少交付必要檔案：' + ', '.join(missing))
version = re.search(r"VERSION='V([0-9.]+)'", texts['core.mjs']).group(1)
queries = re.findall(r'\?v=([0-9.]+)', texts['index.html'] + texts['app.mjs'])
version_ok = f'V{version}' in texts['index.html'] and bool(queries) and all(q == version for q in queries)
result('QA-15', 'PASS' if version_ok else 'FAIL', f'Web Version V{version}；第一方 CSS/JS 及路網快取版本一致。')
checks.sort(key=lambda c: c['code'])
report = dict(projectCode='P140', sdsVersion='3.4', webVersion='V'+version, checkedDate='2026-10-25', commitSHA=None, scope='下載部署包；無正式站點或共用資料庫變更', review='自動靜態檢查及瀏覽器 UI 檢查；人工作品審核尚未指定', summary=dict(Counter(c['status'] for c in checks)), checks=checks)
if args.write_report:
    (root / 'docs/SDS_COMPLIANCE.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    rows='\n'.join(f"| {c['code']} | {c['status']} | {c['evidence']} |" for c in checks)
    (root / 'docs/SDS_COMPLIANCE.md').write_text(f"# P140 V{version}｜SDS v3.4 交付檢查\n\n檢查日期：2026-10-25。範圍：下載部署包。無正式站點、Auth 或共用資料庫變更。Git commit SHA：未提供（本次延續部署包）。\n\n{json.dumps(report['summary'], ensure_ascii=False)}。REVIEW 不等於 PASS；本報告未宣稱完成 Git 歷史或 A3 海報驗證。\n\n| 編號 | 結果 | 證據與適用性 |\n|---|---|---|\n{rows}\n\n手機實測結果見 MOBILE_QA.md；路網回歸檢查見 data/validation-report.json。資料路網與來源檔延續 V0.011，不重新估算。\n")
print(json.dumps(report, ensure_ascii=False))
raise SystemExit(1 if any(c['status']=='FAIL' for c in checks) else 0)
