const form = document.querySelector("#code-form");
const promptInput = document.querySelector("#prompt");
const modelSelect = document.querySelector("#model");
const stackSelect = document.querySelector("#stack");
const runButton = document.querySelector("#run-button");
const runLabel = document.querySelector("#run-label");
const promptLabel = document.querySelector("#prompt-label");
const editorFile = document.querySelector("#editor-file");
const charCount = document.querySelector("#char-count");
const outputEmpty = document.querySelector("#output-empty");
const outputLoading = document.querySelector("#output-loading");
const loadingTitle = document.querySelector("#loading-title");
const result = document.querySelector("#result");
const resultMeta = document.querySelector("#result-meta");
const copyAll = document.querySelector("#copy-all");
const status = document.querySelector("#api-status");
const examples = document.querySelector("#examples");
const modeTabs = [...document.querySelectorAll(".mode-tab")];

let activeMode = "build";
let rawAnswer = "";

const modeConfig = {
  build: {
    label: "만들고 싶은 서비스를 한글로 설명해라",
    file: "requirements.ko.md",
    placeholder: "예: 직원들이 회의실 예약 현황을 보고 예약할 수 있는 사내용 웹앱을 만들어줘. 관리자 화면과 모바일 반응형 UI도 필요해.",
    button: "영어 명세로 바꾸고 코드 만들기",
    loading: "요구사항을 영어 개발 명세로 정리하는 중…",
    examples: ["사내 업무 요청을 등록하고 상태를 관리하는 웹앱", "CSV를 올리면 매출 차트를 보여주는 대시보드"],
  },
  debug: {
    label: "문제가 생긴 코드와 에러 메시지를 붙여 넣어라",
    file: "broken-code.txt",
    placeholder: "코드와 터미널 에러를 함께 붙여 넣어라.\n\n예: TypeError: Cannot read properties of undefined…",
    button: "원인 분석하고 코드 수정하기",
    loading: "오류 원인과 실행 흐름을 분석하는 중…",
    examples: ["React 컴포넌트가 무한 렌더링되는 문제", "FastAPI에서 422 오류가 발생하는 코드"],
  },
};

function setMode(mode) {
  activeMode = mode;
  const config = modeConfig[mode];
  modeTabs.forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  promptLabel.textContent = config.label;
  editorFile.textContent = config.file;
  promptInput.placeholder = config.placeholder;
  runLabel.textContent = config.button;
  loadingTitle.textContent = config.loading;
  examples.querySelectorAll("button").forEach((button, index) => {
    button.textContent = config.examples[index];
  });
}

function appendText(container, text) {
  const cleaned = text.trim();
  if (!cleaned) return;
  const lines = cleaned.split("\n");
  lines.forEach((line) => {
    if (line.startsWith("## ")) {
      const heading = document.createElement("h2");
      heading.textContent = line.slice(3);
      container.append(heading);
    } else if (line.startsWith("### ")) {
      const heading = document.createElement("h3");
      heading.textContent = line.slice(4);
      container.append(heading);
    } else if (line.trim()) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line.replace(/^[-*]\s+/, "• ");
      container.append(paragraph);
    }
  });
}

function renderAnswer(answer) {
  result.replaceChildren();
  const fencePattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match;
  while ((match = fencePattern.exec(answer)) !== null) {
    appendText(result, answer.slice(cursor, match.index));
    const codeCard = document.createElement("section");
    codeCard.className = "code-card";
    const header = document.createElement("div");
    header.className = "code-header";
    const language = document.createElement("span");
    language.textContent = match[1].trim() || "code";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "코드 복사";
    button.addEventListener("click", () => copyText(match[2].trim(), button));
    header.append(language, button);
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = match[2].trim();
    pre.append(code);
    codeCard.append(header, pre);
    result.append(codeCard);
    cursor = fencePattern.lastIndex;
  }
  appendText(result, answer.slice(cursor));
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "복사됨 ✓";
    setTimeout(() => { button.textContent = original; }, 1400);
  } catch {
    button.textContent = "복사 실패";
  }
}

async function checkHealth() {
  try {
    const response = await fetch("api/health");
    const data = await response.json();
    status.classList.toggle("online", data.ok);
    status.classList.toggle("offline", !data.ok);
    status.lastChild.textContent = data.ok ? " API 준비됨" : " API 키 없음";
  } catch {
    status.classList.add("offline");
    status.lastChild.textContent = " 서버 연결 실패";
  }
}

async function runTask() {
  const prompt = promptInput.value.trim();
  if (!prompt || runButton.disabled) return;

  runButton.disabled = true;
  outputEmpty.classList.add("hidden");
  result.classList.add("hidden");
  resultMeta.classList.add("hidden");
  outputLoading.classList.remove("hidden");
  copyAll.disabled = true;

  try {
    const response = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        mode: activeMode,
        stack: stackSelect.value,
        model: modelSelect.value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "요청에 실패했다.");
    rawAnswer = data.answer;
    renderAnswer(rawAnswer);
    result.classList.remove("hidden", "error-result");
    resultMeta.textContent = `${data.model} · ${data.elapsed_seconds}초 · 입력 ${data.prompt_tokens} / 출력 ${data.completion_tokens} 토큰`;
    resultMeta.classList.remove("hidden");
    copyAll.disabled = false;
  } catch (error) {
    rawAnswer = "";
    result.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "요청을 완료하지 못했다";
    const message = document.createElement("p");
    message.textContent = error.message;
    result.append(heading, message);
    result.classList.remove("hidden");
    result.classList.add("error-result");
  } finally {
    outputLoading.classList.add("hidden");
    runButton.disabled = false;
  }
}

modeTabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
form.addEventListener("submit", (event) => { event.preventDefault(); runTask(); });
promptInput.addEventListener("input", () => { charCount.textContent = `${promptInput.value.length.toLocaleString()} / 12,000`; });
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
examples.addEventListener("click", (event) => {
  if (!event.target.matches("button")) return;
  promptInput.value = event.target.textContent;
  promptInput.dispatchEvent(new Event("input"));
  promptInput.focus();
});
copyAll.addEventListener("click", () => copyText(rawAnswer, copyAll));

setMode("build");
checkHealth();
