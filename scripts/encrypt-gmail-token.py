"""Run locally after Gmail consent. Never upload source token files to git."""
import getpass
import json
import os
from pathlib import Path
from cryptography.fernet import Fernet

os.umask(0o077)
try:
    path = Path(input('Đường dẫn gmail-token.json [gmail-token.json]: ').strip() or 'gmail-token.json').expanduser()
    info = json.loads(path.read_text(encoding='utf-8'))
    if info.get('token_uri') != 'https://oauth2.googleapis.com/token':
        raise ValueError('token endpoint')
    if set(info.get('scopes', [])) != {'https://www.googleapis.com/auth/gmail.send'}:
        raise ValueError('send-only scope')
    if not all(isinstance(info.get(k), str) and info[k] for k in ('refresh_token', 'client_id', 'client_secret')):
        raise ValueError('missing OAuth credentials')
    key = getpass.getpass('Dán CAPSULE_ENCRYPTION_KEY đang dùng trên Render (không hiện ký tự): ').strip()
    # Persist no short-lived access token. Backend obtains one when dispatching.
    safe_info = {k: info[k] for k in ('refresh_token', 'client_id', 'client_secret', 'token_uri', 'scopes')}
    encrypted = Fernet(key.encode()).encrypt(json.dumps(safe_info).encode()).decode()
    target = Path('gmail-token.encrypted.txt')
    with target.open('x', encoding='utf-8') as output:
        output.write(encrypted)
    os.chmod(target, 0o600)
    print('Đã tạo gmail-token.encrypted.txt. Copy nội dung vào CAPSULE_GMAIL_TOKEN_ENCRYPTED trên backend Render.')
    print('Không gửi file hoặc khóa qua chat/GitHub. File đã mã hóa vẫn là bí mật.')
except FileExistsError:
    raise SystemExit('File đầu ra đã tồn tại. Đổi tên bản cũ trước khi tạo lại.')
except Exception:
    raise SystemExit('Không tạo được file: kiểm tra đường dẫn, quyền gmail.send và khóa mã hóa. Không chia sẻ nội dung token.')
