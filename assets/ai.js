/* ชีววิทยา By ADHD made — ผู้ช่วย AI (Groq) สำหรับโหมดถาม-ตอบและอธิบายรายข้อ
 *
 * วิธีใส่คีย์ (เลือกอย่างใดอย่างหนึ่ง):
 *   1) แก้ไฟล์ assets/ai-config.js  ->  window.BIO_GROQ_KEY = "gsk_...";
 *   2) กดปุ่ม ⚙️ ในหน้าต่างแชท แล้ววางคีย์ (บันทึกใน localStorage ของเบราว์เซอร์นั้น)
 *
 * หมายเหตุ: เว็บนี้เป็น static site — คีย์จะถูกส่งจากเบราว์เซอร์ตรงไปยัง Groq
 *           ดังนั้นอย่าใช้คีย์ที่ต้องการเก็บเป็นความลับสูงสุด
 */
(function () {
  "use strict";

  const MODEL = "openai/gpt-oss-120b";
  const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  const LS_KEY = "bio_groq_key";

  const SYSTEM_PROMPT =
    "คุณคือติวเตอร์ชีววิทยาระดับมัธยมปลาย/โอลิมปิกที่มีความเชี่ยวชาญสูง " +
    "ตอบเป็นภาษาไทยเสมอ อธิบายเป็นขั้นตอน กระชับ เข้าใจง่าย " +
    "เมื่อต้องใช้ศัพท์เทคนิคให้วงเล็บคำศัพท์ภาษาอังกฤษไว้ด้วย เช่น ไมโทคอนเดรีย (mitochondria) " +
    "ถ้าโจทย์ให้ข้อมูล/ภาพ/ตารางมา ให้ยึดข้อมูลนั้นในการตอบ " +
    "ถ้าไม่แน่ใจให้บอกอย่างตรงไปตรงมา ห้ามกุข้อมูล " +
    "ตอบให้กระชับและอ่านง่ายบนหน้าจอแชทขนาดเล็ก: ขึ้นต้นด้วยคำตอบสั้น ๆ แล้วค่อยขยายความ " +
    "ใช้ย่อหน้าสั้น ๆ หรือหัวข้อย่อย (-) เท่านั้น เน้นคำสำคัญด้วยตัวหนา (**คำ**) " +
    "หลีกเลี่ยงตาราง หัวข้อ markdown ระดับใหญ่ (###) และการเกริ่นนำที่ยืดเยื้อ ไม่ต้องทวนคำถาม";

  /* ---------- คีย์ ---------- */
  function getKey() {
    let k = "";
    try { k = localStorage.getItem(LS_KEY) || ""; } catch (e) {}
    if (!k) k = window.BIO_GROQ_KEY || "";
    return String(k).trim();
  }
  function setKey(k) {
    try { localStorage.setItem(LS_KEY, String(k || "").trim()); } catch (e) {}
  }
  function hasKey() { return !!getKey(); }

  /* ---------- ยิง Groq (streaming) ---------- */
  async function sendChat(messages, onDelta) {
    const key = getKey();
    if (!key) { const e = new Error("NO_KEY"); e.code = "NO_KEY"; throw e; }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.4,
        max_tokens: 1600,
        stream: true,
      }),
    });

    if (!res.ok) {
      let msg = "เกิดข้อผิดพลาดจาก Groq (HTTP " + res.status + ")";
      try {
        const j = await res.json();
        if (j && j.error && j.error.message) msg = j.error.message;
      } catch (e) {}
      if (res.status === 401) msg = "คีย์ Groq ไม่ถูกต้องหรือถูกยกเลิก";
      if (res.status === 429) msg = "ใช้งานถี่เกินไป (rate limit) กรุณารอสักครู่แล้วลองใหม่";
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (d) { full += d; if (onDelta) onDelta(d, full); }
        } catch (e) {}
      }
    }
    return full;
  }

  /* ---------- ยิง Groq แบบรอผลครบ (ใช้ตอนตรวจคำตอบ) ---------- */
  async function sendOnce(messages, opts) {
    const key = getKey();
    if (!key) { const e = new Error("NO_KEY"); e.code = "NO_KEY"; throw e; }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: MODEL, temperature: (opts && opts.temperature) || 0.2,
        max_tokens: (opts && opts.maxTokens) || 900, stream: false,
        messages,
      }),
    });
    if (!res.ok) {
      let msg = "เกิดข้อผิดพลาดจาก Groq (HTTP " + res.status + ")";
      try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
      throw new Error(msg);
    }
    const j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  }

  /* ---------- ตรวจคำตอบแบบเขียน ---------- */
  const GRADE_SYSTEM =
    "คุณเป็นผู้ตรวจข้อสอบชีววิทยาระดับมัธยมปลาย/โอลิมปิก " +
    "หน้าที่: เปรียบเทียบคำตอบที่ผู้เรียนเขียน กับคำตอบและคำอธิบายที่เป็นเฉลย แล้วให้คะแนน 0-100 " +
    "เกณฑ์: เนื้อหา/แนวคิดถูกต้องเป็นหลัก ยอมรับคำตอบที่ใช้คำต่างกันแต่ความหมายตรงกัน " +
    "ถ้าถูกต้องครบให้คะแนนสูง (80-100) ถ้าถูกบางส่วนให้ 40-79 ถ้าผิดหรือไม่ตรงประเด็นให้ต่ำกว่า 40 " +
    "ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON " +
    'รูปแบบ: {"score": ตัวเลข 0-100, "verdict": "ถูกต้อง|ถูกบางส่วน|ยังไม่ถูก", "feedback": "อธิบายสั้น ๆ 2-3 ประโยค ว่าทำไมได้คะแนนนี้", "missing": ["จุดที่ขาดหรือควรเพิ่ม", "..."]}';
  function parseJSONLoose(text) {
    let t = String(text || "").replace(/```json|```/g, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    const m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    return null;
  }
  async function grade(p) {
    const choices = p.choices || [];
    const parts = [];
    if (p.concept) parts.push("หัวข้อ: " + p.concept);
    if (p.stem) parts.push("โจทย์/ข้อมูลประกอบ:\n" + p.stem);
    if (p.question) parts.push("คำถาม: " + p.question);
    if (choices.length) parts.push("ตัวเลือก:\n" + choices.map((c, i) => (i + 1) + ". " + c).join("\n"));
    parts.push("คำตอบที่ถูก: " + (p.answerText != null ? p.answerText : "-"));
    if (p.explanation) parts.push("คำอธิบายเฉลย: " + p.explanation);
    parts.push("คำตอบของผู้เรียน: " + (p.studentAnswer || ""));
    parts.push("ให้คะแนนและ feedback ตามรูปแบบ JSON ที่กำหนด");
    const text = await sendOnce([{ role: "system", content: GRADE_SYSTEM }, { role: "user", content: parts.join("\n\n") }]);
    const obj = parseJSONLoose(text);
    if (!obj) return { score: null, verdict: "", feedback: text || "ตรวจไม่สำเร็จ", missing: [] };
    if (typeof obj.score === "string" && obj.score.trim() !== "" && !isNaN(+obj.score)) obj.score = +obj.score;
    if (!Array.isArray(obj.missing)) obj.missing = obj.missing ? [String(obj.missing)] : [];
    return obj;
  }

  /* ---------- escape + markdown เบา ๆ ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function inline(s) {
    let h = esc(s);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    return h;
  }
  function renderMD(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    let html = "", list = null;
    const closeList = () => { if (list) { html += "</" + list + ">"; list = null; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) { closeList(); continue; }
      let m;
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        closeList();
        const lvl = Math.min(m[1].length + 2, 6);
        html += `<h${lvl} class="ai-h">${inline(m[2])}</h${lvl}>`;
        continue;
      }
      if (/^\s*([-*_]\s*){3,}$/.test(line)) { closeList(); html += "<hr>"; continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
        html += "<li>" + inline(m[1]) + "</li>";
        continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
        html += "<li>" + inline(m[1]) + "</li>";
        continue;
      }
      closeList();
      html += "<p>" + inline(line) + "</p>";
    }
    closeList();
    return html;
  }

  /* ---------- ประวัติการสนทนา ---------- */
  let history = [{ role: "system", content: SYSTEM_PROMPT }];

  function pushMsg(role, content) {
    history.push({ role, content });
    const sys = history[0];
    if (history.length > 17) { history = [sys].concat(history.slice(-16)); }
  }

  /* ---------- UI ---------- */
  let panel, msgsEl, inputEl, fab, sendBtn;
  let busy = false;
  let pendingText = null;

  function buildUI() {
    if (panel) return;

    fab = document.createElement("button");
    fab.className = "ai-fab";
    fab.type = "button";
    fab.title = "ผู้ช่วย AI ชีววิทยา";
    fab.innerHTML = '<span>🤖</span>';
    fab.onclick = toggle;
    document.body.appendChild(fab);

    panel = document.createElement("div");
    panel.className = "ai-panel";
    panel.innerHTML = `
      <div class="ai-head">
        <div class="ai-title">🤖 ผู้ช่วย AI ชีววิทยา</div>
        <div class="ai-head-btns">
          <button class="ai-icon-btn" id="aiCfg" title="ตั้งค่าคีย์ Groq">⚙️</button>
          <button class="ai-icon-btn" id="aiClose" title="ปิด">✕</button>
        </div>
      </div>
      <div class="ai-msgs" id="aiMsgs"></div>
      <div class="ai-input">
        <textarea id="aiText" rows="1" placeholder="พิมพ์คำถามชีววิทยา... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"></textarea>
        <button class="btn primary" id="aiSend">ส่ง</button>
      </div>`;
    document.body.appendChild(panel);

    msgsEl = panel.querySelector("#aiMsgs");
    inputEl = panel.querySelector("#aiText");
    sendBtn = panel.querySelector("#aiSend");
    panel.querySelector("#aiClose").onclick = close;
    panel.querySelector("#aiCfg").onclick = showKeyPrompt;

    sendBtn.onclick = () => submit(inputEl.value);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(inputEl.value); }
    });
    inputEl.addEventListener("input", () => {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
    });
  }

  function open() {
    buildUI();
    panel.classList.add("open");
    fab.classList.add("hidden");
    if (!msgsEl.childElementCount) greet();
    setTimeout(() => inputEl && inputEl.focus(), 30);
  }
  function close() {
    if (panel) panel.classList.remove("open");
    if (fab) fab.classList.remove("hidden");
  }
  function toggle() { buildUI(); panel.classList.contains("open") ? close() : open(); }

  function greet() {
    addBubble("ai", hasKey()
      ? "สวัสดีครับ 👋 ผมคือผู้ช่วยชีววิทยา ถามได้เลย หรือกดปุ่ม \u201c🤖 ให้ AI อธิบายข้อนี้\u201d ตอนทำควิซก็ได้ครับ"
      : "สวัสดีครับ 👋 ก่อนใช้งาน กรุณาใส่คีย์ Groq ก่อนนะครับ — กดปุ่ม ⚙️ ด้านบนเพื่อวางคีย์ (จะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น)");
  }

  function addBubble(role, text) {
    const div = document.createElement("div");
    div.className = "ai-msg " + (role === "user" ? "me" : "ai");
    div.innerHTML = `<div class="ai-bubble">${renderMD(text)}</div>`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight; }

  async function submit(text) {
    const content = String(text || "").trim();
    if (!content || busy) return;
    if (!hasKey()) { pendingText = content; showKeyPrompt(); return; }
    inputEl.value = "";
    inputEl.style.height = "auto";

    addBubble("user", content);
    pushMsg("user", content);

    busy = true;
    sendBtn.disabled = true;
    const holder = addBubble("ai", "⏳ กำลังคิด...");
    const bubble = holder.querySelector(".ai-bubble");
    let acc = "";
    try {
      await sendChat(history.slice(), (d, full) => {
        acc = full;
        bubble.innerHTML = renderMD(full);
        scrollDown();
      });
      pushMsg("assistant", acc || "(ไม่มีคำตอบ)");
      if (!acc) bubble.innerHTML = renderMD("(ไม่ได้รับคำตอบ กรุณาลองใหม่)");
    } catch (err) {
      if (err && err.code === "NO_KEY") { holder.remove(); showKeyPrompt(); }
      else bubble.innerHTML = `<div class="ai-error">${esc(err.message || "เกิดข้อผิดพลาด")}</div>`;
    } finally {
      busy = false;
      sendBtn.disabled = false;
      scrollDown();
      inputEl && inputEl.focus();
    }
  }

  function showKeyPrompt() {
    const cur = getKey();
    const k = prompt("วาง Groq API Key (gsk_...)\nเก็บไว้ในเบราว์เซอร์นี้เท่านั้น:", cur ? "" : "");
    if (k === null) { pendingText = null; return; }
    setKey(k);
    if (!hasKey()) return;
    const go = pendingText; pendingText = null;
    if (go) submit(go);
    else addBubble("ai", "บันทึกคีย์เรียบร้อยครับ ✅ ถามได้เลย");
  }

  /* ---------- ถามอิสระ ---------- */
  function ask(text) {
    const t = String(text || "").trim();
    if (!t) { open(); return; }
    buildUI();
    open();
    submit(t);
  }

  /* ---------- อธิบายรายข้อจากควิซ ---------- */
  function explainQuestion(obj) {
    obj = obj || {};
    buildUI();
    open();
    const choices = obj.choices || [];
    const lines = ["ช่วยอธิบายข้อสอบข้อนี้แบบเข้าใจง่าย ๆ ว่าทำไมตัวเลือกที่ถูกจึงถูก และตัวเลือกอื่นผิดตรงไหน"];
    if (obj.concept) lines.push("หัวข้อ: " + obj.concept);
    if (obj.stem) lines.push("โจทย์/ข้อมูลประกอบ:\n" + obj.stem);
    if (obj.question) lines.push("คำถาม: " + obj.question);
    if (choices.length) lines.push("ตัวเลือก:\n" + choices.map((c, i) => (i + 1) + ". " + c).join("\n"));
    if (typeof obj.answerIndex === "number" && choices[obj.answerIndex] != null) lines.push("เฉลยที่ถูก: " + choices[obj.answerIndex]);
    if (typeof obj.picked === "number" && obj.picked !== obj.answerIndex && choices[obj.picked] != null) lines.push("ผู้เรียนตอบ: " + choices[obj.picked]);
    if (obj.explanation) lines.push("คำอธิบายจากเฉลย (ถ้ามี): " + obj.explanation);
    submit(lines.join("\n\n"));
  }

  /* ---------- init ---------- */
  function init() {
    buildUI();
    if (!hasKey()) { /* ยังไม่บังคับใส่คีย์ — จะถามตอนกดใช้ครั้งแรก */ }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.AITutor = {
    open, close, toggle, ask, explainQuestion, grade, setKey, getKey, hasKey, showKeyPrompt,
    reset: () => { history = [{ role: "system", content: SYSTEM_PROMPT }]; },
  };
})();
