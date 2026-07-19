const form = document.querySelector("#chat-form");
const promptInput = document.querySelector("#prompt");
const modelSelect = document.querySelector("#model");
const messages = document.querySelector("#messages");
const sendButton = document.querySelector("#send");
const suggestions = document.querySelector("#suggestions");
const status = document.querySelector("#api-status");
const modelNote = document.querySelector("#model-note");

const modelNotes = {
  "gemma-4-31b": "65K 컨텍스트 · Preview",
  "gpt-oss-120b": "65K 컨텍스트 · Production",
  "zai-glm-4.7": "8K 컨텍스트 · Preview",
};

function addMessage(text, role, extraClass = "") {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "C";
    article.append(avatar);
  }
  const bubble = document.createElement("div");
  bubble.className = `bubble ${extraClass}`.trim();
  bubble.textContent = text;
  article.append(bubble);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function addTyping() {
  const article = addMessage("", "assistant");
  const bubble = article.querySelector(".bubble");
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  return article;
}

function addMeta(data) {
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${data.model} · ${data.elapsed_seconds}초 · 입력 ${data.prompt_tokens} / 출력 ${data.completion_tokens} 토큰`;
  messages.append(meta);
}

async function checkHealth() {
  try {
    const response = await fetch("api/health");
    const data = await response.json();
    status.classList.toggle("online", data.ok);
    status.classList.toggle("offline", !data.ok);
    status.lastChild.textContent = data.ok ? " API 연결됨" : " API 키 없음";
  } catch {
    status.classList.add("offline");
    status.lastChild.textContent = " 서버 연결 실패";
  }
}

async function sendPrompt(text) {
  const prompt = text.trim();
  if (!prompt || sendButton.disabled) return;

  suggestions?.remove();
  addMessage(prompt, "user");
  promptInput.value = "";
  promptInput.style.height = "auto";
  sendButton.disabled = true;
  const typing = addTyping();

  try {
    const response = await fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model: modelSelect.value }),
    });
    const data = await response.json();
    typing.remove();
    if (!response.ok) throw new Error(data.error || "요청에 실패했다.");
    addMessage(data.answer, "assistant");
    addMeta(data);
  } catch (error) {
    typing.remove();
    addMessage(error.message, "assistant", "error");
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  sendPrompt(promptInput.value);
});

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 150)}px`;
});

suggestions.addEventListener("click", (event) => {
  if (event.target.matches("button")) sendPrompt(event.target.textContent);
});

modelSelect.addEventListener("change", () => {
  modelNote.textContent = modelNotes[modelSelect.value];
});

checkHealth();
promptInput.focus();
