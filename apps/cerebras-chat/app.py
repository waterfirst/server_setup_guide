import os
import time
from pathlib import Path

from cerebras.cloud.sdk import Cerebras
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix


ENV_PATH = Path("D:/python/.env")
ALLOWED_MODELS = {"gemma-4-31b", "gpt-oss-120b", "zai-glm-4.7"}

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
    model = str(payload.get("model", "gemma-4-31b"))

    if not prompt:
        return jsonify({"error": "질문을 입력해라."}), 400
    if len(prompt) > 12_000:
        return jsonify({"error": "질문은 12,000자 이하로 입력해라."}), 400
    if model not in ALLOWED_MODELS:
        return jsonify({"error": "지원하지 않는 모델이다."}), 400

    started = time.perf_counter()
    try:
        result = get_client().chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        )
        elapsed = time.perf_counter() - started
        usage = result.usage
        return jsonify(
            {
                "answer": result.choices[0].message.content,
                "model": result.model,
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
