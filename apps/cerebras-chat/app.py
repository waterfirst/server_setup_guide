import os
import time
from pathlib import Path

from cerebras.cloud.sdk import Cerebras
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix


ENV_PATH = Path("D:/python/.env")
ALLOWED_MODES = {"build", "debug"}
COMPLEX_MARKERS = {
    "architecture",
    "migration",
    "database",
    "authentication",
    "authorization",
    "security",
    "performance",
    "아키텍처",
    "마이그레이션",
    "데이터베이스",
    "인증",
    "권한",
    "보안",
    "성능",
    "전체 프로젝트",
}

SYSTEM_PROMPTS = {
    "build": """You are a senior full-stack engineer building practical internal company web services.
Translate the user's Korean requirements into a precise English implementation brief before coding.
Infer the most suitable language and framework from the request and choose the smallest practical stack.
Return the result in this exact order:
1. '## English brief' — a concise English specification.
2. '## 구현 코드' — complete, runnable code in fenced code blocks with filenames as headings.
3. '## 실행 방법' — short Korean setup and run commands.
4. '## 핵심 설명' — only important Korean implementation notes.
Prefer secure defaults, responsive light-theme UI, accessible HTML, and minimal dependencies.
Never expose API keys in client code. Do not use placeholders where working code is reasonably possible.""",
    "debug": """You are a senior debugging engineer for web applications and Python services.
The user will paste broken code, an error, or both. Infer the intended behavior and selected stack.
Return the result in this exact order:
1. '## 원인' — identify the root cause in concise Korean.
2. '## 수정 코드' — provide complete corrected code in fenced code blocks, not only a diff.
3. '## 수정 내용' — list the exact changes in Korean.
4. '## 확인 방법' — give commands or steps that reproduce the successful result.
Preserve unrelated behavior, do not invent missing secrets, and call out assumptions explicitly.
When the input is Korean, reason from an accurate English interpretation but answer in Korean.""",
}


def route_model(mode: str, prompt: str) -> tuple[str, str]:
    normalized = prompt.lower()
    line_count = prompt.count("\n") + 1
    complexity = sum(marker in normalized for marker in COMPLEX_MARKERS)

    if len(prompt) > 5_000 or line_count > 120 or complexity >= 2:
        return "gpt-oss-120b", "대규모·복합 작업이라 65K 컨텍스트의 GPT OSS 120B를 선택함"
    if len(prompt) <= 1_200 and line_count <= 35 and complexity == 0:
        task = "짧은 오류 수정" if mode == "debug" else "짧은 단일 기능"
        return "zai-glm-4.7", f"{task}이라 저지연 ZAI GLM 4.7을 선택함"
    return "gemma-4-31b", "일반 웹앱 작업이라 속도와 65K 컨텍스트를 갖춘 Gemma 4 31B를 선택함"

load_dotenv(ENV_PATH)

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)


def get_client() -> Cerebras:
    api_key = os.environ.get("CEREBRAS_API_KEY")
    if not api_key:
        raise RuntimeError(f"CEREBRAS_API_KEY가 {ENV_PATH}에 없습니다.")
    return Cerebras(api_key=api_key)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": bool(os.environ.get("CEREBRAS_API_KEY"))})


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    prompt = str(payload.get("prompt", "")).strip()
    mode = str(payload.get("mode", "build"))

    if not prompt:
        return jsonify({"error": "질문을 입력해라."}), 400
    if len(prompt) > 12_000:
        return jsonify({"error": "질문은 12,000자 이하로 입력해라."}), 400
    if mode not in ALLOWED_MODES:
        return jsonify({"error": "지원하지 않는 작업 모드다."}), 400

    model, routing_reason = route_model(mode, prompt)

    started = time.perf_counter()
    try:
        result = get_client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPTS[mode]},
                {
                    "role": "user",
                    "content": f"Infer the appropriate technology stack.\n\nUser input:\n{prompt}",
                },
            ],
            temperature=0.2,
        )
        elapsed = time.perf_counter() - started
        usage = result.usage
        return jsonify(
            {
                "answer": result.choices[0].message.content,
                "model": result.model,
                "routing_reason": routing_reason,
                "elapsed_seconds": round(elapsed, 3),
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
            }
        )
    except Exception as exc:
        app.logger.exception("Cerebras request failed")
        status_code = getattr(exc, "status_code", 502)
        if status_code not in {400, 401, 403, 404, 429}:
            status_code = 502
        messages = {
            401: "API 키 인증에 실패했다.",
            403: "이 모델에 접근할 권한이 없다.",
            404: "모델을 찾을 수 없다.",
            429: "요청 한도에 도달했다. 잠시 후 다시 시도해라.",
        }
        return jsonify({"error": messages.get(status_code, "Cerebras 요청에 실패했다.")}), status_code


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
