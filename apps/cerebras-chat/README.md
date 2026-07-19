# Cerebras Fast Chat

Cerebras API를 서버에서 호출하는 간단한 Flask 채팅 웹앱이다. API 키는 브라우저에 노출되지 않는다.

## 실행

`D:\python\.env`에 다음 항목이 있어야 한다.

```dotenv
CEREBRAS_API_KEY=YOUR_CEREBRAS_API_KEY
```

```powershell
cd D:\python\smartphone_server\cerebras_webapp
python -m pip install -r requirements.txt
python app.py
```

브라우저에서 `http://127.0.0.1:5000`을 연다.

## 노트북 서버 배포

공개 주소는 `https://waterfirst.pro/cerebras/`, 내부 포트는 `8502`를 사용한다.

```bash
cd /home/waterfirst/apps/cerebras-chat
python3 -m venv venv
venv/bin/pip install -r requirements.txt
mkdir -p ~/.config/systemd/user
cp deploy/cerebras-chat.user.service ~/.config/systemd/user/cerebras-chat.service
systemctl --user daemon-reload
systemctl --user enable --now cerebras-chat
```

사용자 서비스가 로그아웃·재부팅 후에도 유지되려면 `loginctl show-user "$USER" -p Linger`가 `yes`여야 한다.

`deploy/cerebras-chat.nginx`의 두 `location` 블록을 현재 활성 Nginx `server` 블록 안에 추가한 뒤 설정을 검사하고 다시 불러온다.

```bash
sudo nginx -t
sudo systemctl reload nginx
```
