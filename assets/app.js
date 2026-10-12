/* ชีววิทยา By ADHD made — เกมควิซชีววิทยา (ไร้หลังบ้าน) */
(function () {
  "use strict";

  /* ================= Utilities ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const LETTERS = ["ก", "ข", "ค", "ง", "จ", "ฉ"];
  const MODE_ORDER = ["m4-1", "m4-2", "m5-1", "m5-2", "m6-1", "m6-2"];

  /* ================= Data ================= */
  const DATA = window.BIO_DATA || {};
  const KNOW = window.BIO_KNOWLEDGE || {};
  const QOVERRIDE = window.BIO_QUESTIONS || {};

  function ensureIds() {
    MODE_ORDER.forEach((mid) => {
      const mode = DATA[mid];
      if (!mode) return;
      mode.id = mid;
      (mode.chapters || []).forEach((ch, ci) => {
        const over = QOVERRIDE[mid] && QOVERRIDE[mid][ci];
        if (over && over.length) ch.questions = over;
        ch._ci = ci;
        (ch.questions || []).forEach((q, qi) => {
          q.id = `${mid}-c${ci}-q${qi}`;
          q._ci = ci;
          q._mode = mid;
        });
      });
    });
  }

  const allQuestions = () => {
    const out = [];
    MODE_ORDER.forEach((mid) => {
      const m = DATA[mid];
      if (!m) return;
      (m.chapters || []).forEach((ch) => (ch.questions || []).forEach((q) => out.push(q)));
    });
    return out;
  };
  const modeCount = (mid) => (DATA[mid] ? DATA[mid].chapters.reduce((s, c) => s + c.questions.length, 0) : 0);
  const chapterTitle = (q) => (DATA[q._mode] ? DATA[q._mode].chapters[q._ci].title : "");

  /* ================= Storage ================= */
  const KEY = "bio_quiz_v1";
  let Store = loadStore();
  function defaultStore() { return { version: 1, user: null, modes: {}, flash: {}, session: null, last: null }; }
  function loadStore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultStore();
      const s = JSON.parse(raw);
      s.user = s.user || null; s.modes = s.modes || {}; s.flash = s.flash || {};
      s.session = s.session || null; s.last = s.last || null;
      return s;
    } catch (e) { return defaultStore(); }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Store)); } catch (e) {} };

  /* ---- Session (save/resume quiz) ---- */
  function findQuestion(id) { return allQuestions().find((q) => q.id === id) || null; }
  function persistSession() {
    if (!S) { Store.session = null; save(); return; }
    Store.session = {
      modeId: S.modeId, count: S.count, chapter: S.chapter, idx: S.idx, correct: S.correct, at: Date.now(),
      items: S.items.map((it) => ({ id: it.id, order: it.order, picked: it.picked, correct: it.correct })),
    };
    Store.last = { modeId: S.modeId, at: Date.now() };
    save();
  }
  function clearSession() { Store.session = null; save(); }
  function restoreSession(saved) {
    if (!saved || !saved.items || !saved.items.length) return null;
    const items = [];
    for (const si of saved.items) {
      const q = findQuestion(si.id);
      if (!q) return null;
      const order = (si.order && si.order.length === q.choices.length) ? si.order : q.choices.map((_, i) => i);
      items.push({
        id: si.id, q, order, choices: order.map((i) => q.choices[i]),
        answer: order.indexOf(q.answer), picked: si.picked, correct: si.correct,
      });
    }
    let idx = Math.min(Math.max(saved.idx | 0, 0), items.length - 1);
    let correct = saved.correct | 0;
    if (items.every((it) => it.picked !== null)) { idx = items.length - 1; correct = items.filter((it) => it.correct).length; }
    return { modeId: saved.modeId, count: saved.count, chapter: saved.chapter, items, idx, correct, restored: true };
  }
  const sessionFor = (mid) => (Store.session && Store.session.modeId === mid ? Store.session : null);
  const modeStat = (mid) => {
    Store.modes[mid] = Store.modes[mid] || { plays: 0, best: 0, last: 0, lastAt: 0, questions: {}, chapters: {} };
    return Store.modes[mid];
  };

  function recordAnswer(q, correct) {
    const ms = modeStat(q._mode);
    const r = ms.questions[q.id] || { correct: 0, wrong: 0 };
    correct ? r.correct++ : r.wrong++;
    ms.questions[q.id] = r;
    const c = ms.chapters[q._ci] || { correct: 0, total: 0 };
    c.total++; if (correct) c.correct++;
    ms.chapters[q._ci] = c;
  }
  function chapterAcc(mid, ci) {
    const ms = Store.modes[mid];
    if (!ms || !ms.chapters[ci] || !ms.chapters[ci].total) return null;
    return ms.chapters[ci].correct / ms.chapters[ci].total;
  }
  function modeMastery(mid) {
    const m = DATA[mid]; if (!m) return 0;
    let sum = 0, n = 0;
    m.chapters.forEach((_, ci) => { const a = chapterAcc(mid, ci); if (a !== null) { sum += a; n++; } });
    return n ? Math.round((sum / n) * 100) : 0;
  }
  function weakQuestions() {
    const out = [];
    allQuestions().forEach((q) => {
      const ms = Store.modes[q._mode];
      const r = ms && ms.questions[q.id];
      if (r && r.wrong > 0) out.push(q);
    });
    return out;
  }
  function avgMastery() {
    const v = MODE_ORDER.map(modeMastery).filter((x) => x > 0);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  }
  const hasData = () => MODE_ORDER.some((mid) => Store.modes[mid] && Store.modes[mid].plays > 0);
  const accColor = (a) => (a >= 0.7 ? "var(--ok)" : a >= 0.4 ? "var(--warn)" : "var(--danger)");

  /* ================= Profile ================= */
  function renderProfileChip() {
    const el = $("#profileChip");
    if (!Store.user) { el.textContent = "ตั้งชื่อผู้เล่น"; el.onclick = showNameModal; return; }
    el.innerHTML = `<span class="avatar">${esc(Store.user.name.slice(0, 1).toUpperCase())}</span><span>${esc(Store.user.name)}</span>`;
    el.title = "คลิกเพื่อเปลี่ยนชื่อ";
    el.onclick = changeName;
  }
  function ensureUser() {
    if (!Store.user) showNameModal();
    else { Store.user.lastSeen = Date.now(); save(); renderProfileChip(); }
  }
  function showNameModal() {
    if ($(".modal-back")) return;
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal card">
      <h3>ยินดีต้อนรับสู่เกมชีววิทยา 🧬</h3>
      <p class="muted">ตั้งชื่อเล่นของคุณ ระบบจะจดจำความคืบหน้าและคะแนนไว้ในเครื่องนี้</p>
      <input class="text" id="nameInput" maxlength="20" placeholder="ชื่อเล่น เช่น ADHD" />
      <div class="row" style="margin-top:14px"><button class="btn primary" id="nameSave">เริ่มเล่น</button></div>
    </div>`;
    document.body.appendChild(back);
    const input = $("#nameInput", back); input.focus();
    const doSave = () => {
      Store.user = { name: input.value.trim() || "ผู้เล่น", createdAt: Date.now(), lastSeen: Date.now() };
      save(); back.remove(); renderProfileChip(); route("home");
    };
    $("#nameSave", back).onclick = doSave;
    input.onkeydown = (e) => { if (e.key === "Enter") doSave(); };
  }
  function changeName() {
    const n = prompt("ชื่อเล่นใหม่:", Store.user ? Store.user.name : "");
    if (n === null) return;
    Store.user = Store.user || { createdAt: Date.now() };
    Store.user.name = n.trim() || "ผู้เล่น";
    save(); renderProfileChip(); route(current);
  }

  /* ================= Router ================= */
  let current = "home";
  function route(view, params) {
    current = view;
    if (quizKeyHandler) { document.removeEventListener("keydown", quizKeyHandler); quizKeyHandler = null; }
    $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
    window.scrollTo(0, 0);
    const main = $("#app");
    main.innerHTML = "";
    ({ home: renderHome, mode: renderMode, quiz: renderQuiz, result: renderResult,
       knowledge: renderKnowledge, stats: renderStats, flash: renderFlash }[view] || renderHome)(main, params);
  }

  /* ================= Home ================= */
  function renderHome(main) {
    const wrap = document.createElement("div");
    const greet = Store.user ? `ยินดีต้อนรับกลับ ${esc(Store.user.name)}! 👋` : "ยินดีต้อนรับ! 👋";
    let banner = "";
    const sess = Store.session;
    if (sess && sess.items && sess.items.length) {
      const sinfo = modeInfo(sess.modeId);
      const stitle = sinfo ? sinfo.title : sess.modeId;
      const prog = Math.min(sess.idx + 1, sess.items.length);
      const answered = sess.items.filter((i) => i.picked !== null).length;
      banner = `
      <div class="card resume-banner" style="margin-bottom:20px;border-color:var(--accent)">
        <div class="row" style="align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <h3 class="section-title" style="font-size:18px;margin:0">⏯ มีควิซค้างอยู่</h3>
            <p class="muted" style="font-size:13px;margin:6px 0 0">${esc(stitle)} • ข้อ ${prog}/${sess.items.length} • ตอบแล้ว ${answered} ข้อ</p>
          </div>
          <div class="row">
            <button class="btn primary" id="resumeBtn">ทำต่อ</button>
            <button class="btn" id="discardBtn">เริ่มใหม่</button>
          </div>
        </div>
      </div>`;
    } else if (Store.last && Store.last.modeId) {
      const linfo = modeInfo(Store.last.modeId);
      if (linfo) banner = `<p class="section-sub">🕘 เล่นล่าสุด: <b>${esc(linfo.title)}</b></p>`;
    }
    wrap.innerHTML = `${banner}
      <div class="card" style="margin-bottom:20px">
        <h2 class="section-title">${greet}</h2>
        <p class="section-sub">เลือกโหมดที่ต้องการ ระบบจะสุ่มข้อและสลับตัวเลือกใหม่ทุกครั้ง และจดจำความคืบหน้าของคุณไว้</p>
        <div class="row">
          <div class="stat-pill"><span>📚</span><div><b>${allQuestions().length}</b><div class="muted" style="font-size:12px">ข้อสอบทั้งหมด</div></div></div>
          <div class="stat-pill"><span>🧩</span><div><b>${MODE_ORDER.length}</b><div class="muted" style="font-size:12px">โหมดการเรียน</div></div></div>
          <div class="stat-pill"><span>🎯</span><div><b>${avgMastery()}%</b><div class="muted" style="font-size:12px">ความชำนาญเฉลี่ย</div></div></div>
          <div class="stat-pill"><span>🔁</span><div><b>${weakQuestions().length}</b><div class="muted" style="font-size:12px">ข้อที่เคยตอบผิด</div></div></div>
        </div>
      </div>
      <h3 class="section-title">โหมดการเรียน</h3>
      <div class="grid" id="modeGrid"></div>
      <h3 class="section-title" style="margin-top:26px">โหมดพิเศษ</h3>
      <div class="grid" id="specialGrid"></div>`;
    main.appendChild(wrap);

    if ($("#resumeBtn", wrap)) {
      $("#resumeBtn", wrap).onclick = () => route("quiz", { modeId: sess.modeId, count: sess.count || 0, resume: true });
      $("#discardBtn", wrap).onclick = () => {
        if (confirm("ลบควิซที่ค้างไว้และเริ่มใหม่?")) { clearSession(); route("mode", sess.modeId); }
      };
    }

    const grid = $("#modeGrid", wrap);
    MODE_ORDER.forEach((mid) => {
      const m = DATA[mid]; if (!m) return;
      const mastery = modeMastery(mid);
      const card = document.createElement("div");
      card.className = "mode-card";
      card.innerHTML = `<div class="icon">${m.icon || "📘"}</div><h3>${esc(m.title)}</h3>
        <p>${m.chapters.length} บท • ${modeCount(mid)} ข้อ</p>
        <div class="progress-bar"><i style="width:${mastery}%"></i></div>
        <div class="muted" style="font-size:12px;margin-top:6px">ความชำนาญ ${mastery}%${Store.modes[mid] ? ` • เล่น ${Store.modes[mid].plays} ครั้ง` : ""}</div>`;
      card.onclick = () => route("mode", mid);
      grid.appendChild(card);
    });

    const sg = $("#specialGrid", wrap);
    [
      { id: "__special__", icon: "🎲", title: "รวมทุกเนื้อหา (สุ่ม)", desc: `สุ่มจากทุกบท รวม ${allQuestions().length} ข้อ` },
      { id: "__review__", icon: "🔁", title: "ทบทวนข้อที่เคยตอบผิด", desc: `มี ${weakQuestions().length} ข้อที่รอทบทวน` },
    ].forEach((s) => {
      const c = document.createElement("div");
      c.className = "mode-card special";
      c.innerHTML = `<div class="icon">${s.icon}</div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p>`;
      c.onclick = () => route("mode", s.id);
      sg.appendChild(c);
    });
  }

  /* ================= Mode intro ================= */
  function modeInfo(id) {
    if (id === "__special__") return { id, title: "รวมทุกเนื้อหา (สุ่ม)", icon: "🎲", chapters: null, count: allQuestions().length };
    if (id === "__review__") return { id, title: "ทบทวนข้อที่เคยตอบผิด", icon: "🔁", chapters: null, count: weakQuestions().length };
    const m = DATA[id]; if (!m) return null;
    return { id, title: m.title, icon: m.icon || "📘", chapters: m.chapters, count: modeCount(id) };
  }

  function renderMode(main, id) {
    const info = modeInfo(id);
    if (!info) return route("home");
    const mastery = Store.modes[id] ? modeMastery(id) : 0;
    const best = Store.modes[id] ? Store.modes[id].best : 0;
    const wrap = document.createElement("div");
    wrap.className = "card";
    let chap = "";
    if (info.chapters) {
      chap = `<div style="margin-top:18px"><b>บทที่ครอบคลุม</b><p class="muted" style="font-size:13px;margin:6px 0 0">แตะบทเพื่อทำควิซเฉพาะบทนั้น</p><div class="row" style="margin-top:10px">` +
        info.chapters.map((ch, ci) => {
          const a = chapterAcc(id, ci);
          const tag = a === null ? "" : ` <b style="color:${accColor(a)}">${Math.round(a * 100)}%</b>`;
          return `<button class="badge chapbtn" data-ci="${ci}">${esc(ch.title)}${tag}</button>`;
        }).join("") + `</div></div>`;
    }
    const empty = info.count === 0;
    const sess = sessionFor(id);
    let resumeRow = "";
    if (sess && sess.items && sess.items.length) {
      const prog = Math.min(sess.idx + 1, sess.items.length);
      const answered = sess.items.filter((i) => i.picked !== null).length;
      resumeRow = `<div class="card resume-banner" style="margin-top:16px;border-color:var(--accent)">
        <div class="row" style="align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div><b>⏯ ทำค้างไว้</b><div class="muted" style="font-size:13px">ข้อ ${prog}/${sess.items.length} • ตอบแล้ว ${answered} ข้อ</div></div>
          <div class="row"><button class="btn primary" id="resumeBtn">ทำต่อ</button>
          <button class="btn" id="restartBtn">เริ่มใหม่</button></div>
        </div>
      </div>`;
    }
    wrap.innerHTML = `
      <div style="font-size:40px">${info.icon}</div>
      <h2 class="section-title">${esc(info.title)}</h2>
      <p class="section-sub">${info.count} ข้อ${info.chapters ? ` • ${info.chapters.length} บท` : " • รวมหลายบท"}${Store.modes[id] ? ` • คะแนนดีที่สุด ${best}%` : ""}</p>
      ${chap}
      ${resumeRow}
      ${empty
        ? `<p class="muted" style="margin-top:18px">ยังไม่มีข้อในโหมดนี้ — ไปทำโหมดอื่นเพื่อสะสมข้อที่ตอบผิดก่อนนะครับ</p>
           <div class="row" style="margin-top:14px"><button class="btn" id="back">← กลับ</button></div>`
        : `<div class="row" style="margin-top:20px;align-items:center">
             <label class="muted">จำนวนข้อ:</label>
             <select class="text" id="qCount" style="width:auto">
               <option value="10">10 ข้อ</option>
               <option value="20">20 ข้อ</option>
               <option value="30">30 ข้อ</option>
               <option value="0">ทั้งหมด (${info.count} ข้อ)</option>
             </select>
             <button class="btn primary" id="start">▶ เริ่มทำควิซ</button>
             ${id.startsWith("__") ? "" : `<button class="btn" id="flash">🃏 แฟลชการ์ด</button><button class="btn" id="know">📖 คลังความรู้</button>`}
           </div>`}`;
    main.appendChild(wrap);
    if (empty) { $("#back", wrap).onclick = () => route("home"); return; }
    $$(".chapbtn", wrap).forEach((b) => {
      b.onclick = () => {
        const ci = parseInt(b.dataset.ci, 10);
        if (sess) { if (!confirm("มีควิซค้างอยู่ ต้องการเริ่มใหม่ทับของเดิมหรือไม่?")) { route("quiz", { modeId: id, count: sess.count || 0, resume: true }); return; } clearSession(); S = null; }
        route("quiz", { modeId: id, count: 0, chapter: ci });
      };
    });
    $("#start", wrap).onclick = () => {
      const n = parseInt($("#qCount", wrap).value, 10);
      if (sess) { if (!confirm("มีควิซค้างอยู่ ต้องการเริ่มใหม่ทับของเดิมหรือไม่?")) { route("quiz", { modeId: id, count: sess.count || n, resume: true }); return; } clearSession(); S = null; }
      route("quiz", { modeId: id, count: n });
    };
    if ($("#resumeBtn", wrap)) $("#resumeBtn", wrap).onclick = () => route("quiz", { modeId: id, count: sess.count || 0, resume: true });
    if ($("#restartBtn", wrap)) $("#restartBtn", wrap).onclick = () => { clearSession(); S = null; route("quiz", { modeId: id, count: sess.count || 0 }); };
    if ($("#flash", wrap)) $("#flash", wrap).onclick = () => route("flash", id);
    if ($("#know", wrap)) $("#know", wrap).onclick = () => route("knowledge", id);
  }

  /* ================= Quiz ================= */
  let S = null;
  let quizKeyHandler = null;


  function buildSession(modeId, count, chapter) {
    let pool;
    if (modeId === "__special__") pool = allQuestions();
    else if (modeId === "__review__") pool = weakQuestions();
    else if (chapter != null && DATA[modeId].chapters[chapter]) pool = DATA[modeId].chapters[chapter].questions;
    else pool = DATA[modeId].chapters.flatMap((c) => c.questions);
    pool = shuffle(pool);
    if (count > 0 && count < pool.length) pool = pool.slice(0, count);
    const items = pool.map((q) => {
      const order = shuffle(q.choices.map((_, i) => i));
      return { id: q.id, q, order, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer), picked: null, correct: null };
    });
    return { modeId, count, chapter: chapter == null ? null : chapter, items, idx: 0, correct: 0 };
  }

  function renderQuiz(main, params) {
    if (params && params.resume) {
      const r = restoreSession(Store.session);
      if (r) S = r;
    }
    if (!S || S.modeId !== params.modeId || (params.chapter != null && S.chapter !== params.chapter)) {
      S = buildSession(params.modeId, params.count || 0, params.chapter);
      persistSession();
    }
    if (!S.items.length) return route("mode", params.modeId);
    renderQ(main);
  }

  function renderQ(main) {
    if (quizKeyHandler) { document.removeEventListener("keydown", quizKeyHandler); quizKeyHandler = null; }
    const it = S.items[S.idx];
    const total = S.items.length;
    const pct = Math.round((S.idx / total) * 100);
    main.innerHTML = `
      <div class="quiz-top">
        <button class="btn ghost" id="quit">← ออก</button>
        <span class="q-index">ข้อ ${S.idx + 1}/${total}</span>
        <span class="badge">${esc(chapterTitle(it.q))}</span>
        <span class="spacer"></span>
        <span class="badge">✅ ${S.correct}</span>
      </div>
      <div class="qbar"><i style="width:${pct}%"></i></div>
      <div class="card">
        <div class="q-topic">${esc(it.q.concept || "")}</div>
        <div class="question">${esc(it.q.q)}</div>
        <div class="choices" id="choices"></div>
        <div class="kbd-hint muted">⌨️ กดคีย์ ก ข ค ง หรือ 1 2 3 4 เพื่อตอบ • Enter เพื่อไปข้อต่อไป</div>
        <div id="fb"></div>
      </div>`;
    $("#quit", main).onclick = () => {
      if (confirm("ออกจากการทำควิซ? ความคืบหน้าจะถูกบันทึกไว้ ทำต่อได้ภายหลัง")) {
        persistSession(); S = null; route("home");
      }
    };

    const cbox = $("#choices", main);
    it.choices.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span class="key">${LETTERS[i]}</span><span>${esc(t)}</span>`;
      b.onclick = () => pick(i);
      cbox.appendChild(b);
    });

    if (it.picked !== null) showResult();

    function pick(i) {
      if (it.picked !== null) return;
      it.picked = i;
      it.correct = i === it.answer;
      if (it.correct) S.correct++;
      recordAnswer(it.q, it.correct); persistSession();
      showResult();
    }

    function showResult() {
      $$(".choice", cbox).forEach((b, bi) => {
        b.classList.add("locked");
        if (bi === it.answer) b.classList.add("correct");
        if (bi === it.picked && !it.correct) b.classList.add("wrong");
      });
      const fb = $("#fb", main);
      fb.innerHTML = `
        <div class="feedback ${it.correct ? "ok" : "no"}">
          <h4>${it.correct ? "✅ ตอบถูกต้อง!" : `❌ ตอบผิด — คำตอบที่ถูกคือ "${esc(it.choices[it.answer])}"`}</h4>
          <p><span class="explain-label">คำอธิบาย: </span>${esc(it.q.explanation || "—")}</p>
        </div>
        <div class="row" style="margin-top:16px">
          <button class="btn primary" id="next">${S.idx + 1 < total ? "ข้อต่อไป →" : "ดูสรุปผล 🏁"}</button>
        </div>`;
      $("#next", main).onclick = () => {
        S.idx++;
        if (S.idx >= S.items.length) finish();
        else { persistSession(); renderQ($("#app")); }
      };
    }

    const keyMap = { "1": 0, "2": 1, "3": 2, "4": 3, "ก": 0, "ข": 1, "ค": 2, "ง": 3 };
    quizKeyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (it.picked === null) {
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (k in keyMap) { e.preventDefault(); pick(keyMap[k]); }
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const nb = $("#next", main); if (nb) nb.click();
      }
    };
    document.addEventListener("keydown", quizKeyHandler);
  }

  function finish() {
    const total = S.items.length;
    const correct = S.items.filter((i) => i.correct).length;
    const score = Math.round((correct / total) * 100);
    const ms = modeStat(S.modeId);
    ms.plays++; ms.best = Math.max(ms.best, score); ms.last = score; ms.lastAt = Date.now();
    Store.session = null;
    Store.last = { modeId: S.modeId, at: Date.now() };
    save();
    const modeId = S.modeId;
    S = null;
    route("result", { modeId, correct, total, score });
  }

  /* ================= Result ================= */
  function barHTML(title, acc, sub) {
    return `<div class="weak-bar"><div class="top"><span>${esc(title)}</span><span>${Math.round(acc * 100)}%</span></div>
      <div class="track"><i style="width:${Math.round(acc * 100)}%;background:${accColor(acc)}"></i></div>${sub ? `<div class="muted" style="font-size:12px">${esc(sub)}</div>` : ""}</div>`;
  }
  function chapterAccList(modeId) {
    const m = DATA[modeId]; if (!m) return [];
    return m.chapters.map((ch, ci) => ({ title: ch.title, acc: chapterAcc(modeId, ci) })).filter((x) => x.acc !== null);
  }

  function renderResult(main, p) {
    const { modeId, correct, total, score } = p;
    const msg = score >= 80 ? "ยอดเยี่ยมมาก! 🎉" : score >= 60 ? "ดีมาก เกือบสมบูรณ์ ✨" : score >= 40 ? "พอใช้ได้ ลองทบทวนอีกนิด 💪" : "ไม่เป็นไร ค่อย ๆ ทบทวนนะ 🌱";
    const bars = (DATA[modeId] ? DATA[modeId].chapters.map((ch, ci) => ({ title: ch.title, acc: chapterAcc(modeId, ci) })).filter((x) => x.acc !== null).sort((a, b) => a.acc - b.acc) : []);
    main.innerHTML = `
      <div class="card center">
        <div class="badge">${esc(modeInfo(modeId) ? modeInfo(modeId).title : modeId)}</div>
        <div class="score-ring" style="--p:${score}"><div><div class="num">${score}%</div><div class="lbl">ถูก ${correct}/${total}</div></div></div>
        <h3 class="section-title">${msg}</h3>
        <div class="row" style="justify-content:center">
          <button class="btn primary" id="again">🔁 เล่นอีกรอบ (สุ่มใหม่)</button>
          <button class="btn" id="home">🏠 หน้าแรก</button>
          <button class="btn" id="stats">📊 ดูจุดอ่อน/จุดแข็ง</button>
        </div>
      </div>
      ${bars.length ? `<div class="card"><h3 class="section-title" style="font-size:18px">วิเคราะห์รายบท</h3>${bars.map((b) => barHTML(b.title, b.acc)).join("")}</div>` : ""}`;
    $("#again", main).onclick = () => route("quiz", { modeId, count: total });
    $("#home", main).onclick = () => route("home");
    $("#stats", main).onclick = () => route("stats");
  }

  /* ================= Stats ================= */
  function renderStats(main) {
    if (!hasData()) {
      main.innerHTML = `<div class="card center"><h2 class="section-title">ยังไม่มีสถิติ</h2><p class="section-sub">เริ่มทำควิซก่อน แล้วสถิติจุดอ่อน/จุดแข็งจะแสดงที่นี่</p><button class="btn primary" id="go">ไปเลือกโหมด</button></div>`;
      $("#go", main).onclick = () => route("home");
      return;
    }
    const bars = [];
    MODE_ORDER.forEach((mid) => {
      const m = DATA[mid]; if (!m) return;
      m.chapters.forEach((ch, ci) => { const a = chapterAcc(mid, ci); if (a !== null) bars.push({ title: ch.title, acc: a, mode: mid }); });
    });
    bars.sort((a, b) => a.acc - b.acc);
    const weakest = bars.slice(0, 5);
    const strongest = bars.slice(-5).reverse();

    let html = `<h2 class="section-title">สถิติของ ${esc(Store.user ? Store.user.name : "ผู้เล่น")}</h2>
      <p class="section-sub">วิเคราะห์จุดอ่อน-จุดแข็งจากทุกบทที่คุณเคยทำ</p>
      <div class="grid">
        <div class="card"><h3 class="section-title" style="font-size:16px">🔻 ควรทบทวนที่สุด</h3>${weakest.map((b) => barHTML(b.title, b.acc, DATA[b.mode].title)).join("")}</div>
        <div class="card"><h3 class="section-title" style="font-size:16px">🔺 จุดแข็งของคุณ</h3>${strongest.map((b) => barHTML(b.title, b.acc, DATA[b.mode].title)).join("")}</div>
      </div>
      <h3 class="section-title" style="margin-top:22px">ภาพรวมแต่ละโหมด</h3><div class="grid">`;
    MODE_ORDER.forEach((mid) => {
      const ms = Store.modes[mid]; if (!ms) return;
      html += `<div class="card"><div style="font-size:24px">${DATA[mid].icon || "📘"}</div><h4 style="margin:8px 0">${esc(DATA[mid].title)}</h4>
        <p class="muted" style="font-size:13px;margin:0">เล่น ${ms.plays} ครั้ง • ดีที่สุด ${ms.best}% • ความชำนาญ ${modeMastery(mid)}%</p></div>`;
    });
    html += `</div>`;
    const rq = weakQuestions();
    if (weakQuestions().length) html += `<div class="row" style="margin-top:20px"><button class="btn primary" id="review">🔁 ทบทวนข้อที่ตอบผิด (${weakQuestions().length})</button></div>`;
    html += `<div class="row" style="margin-top:22px"><button class="btn danger" id="reset">🗑 ล้างข้อมูลทั้งหมดในเครื่องนี้</button></div>`;
    main.innerHTML = html;
    if ($("#review", main)) $("#review", main).onclick = () => route("mode", "__review__");
    $("#reset", main).onclick = () => {
      if (confirm("ลบข้อมูลผู้ใช้ คะแนน และความคืบหน้าทั้งหมด? การกระทำนี้ย้อนกลับไม่ได้")) {
        Store = defaultStore(); save(); location.reload();
      }
    };
  }

  /* ================= Knowledge ================= */
  function renderKnowledge(main, focusMode) {
    if (!hasData()) { /* knowledge is public; no gate */ }
    const wrap = document.createElement("div");
    main.appendChild(wrap);
    const activeMode = (typeof focusMode === "string" && MODE_ORDER.includes(focusMode)) ? focusMode : (MODE_ORDER.find((m) => DATA[m] && DATA[m].chapters && DATA[m].chapters.length) || MODE_ORDER[0]);
    wrap.innerHTML = `<h2 class="section-title">📖 คลังความรู้</h2><p class="section-sub">สรุปเนื้อหาแต่ละบทแบบเข้าใจง่าย</p>
      <div class="tabs" id="kTabs"></div><div id="kBody"></div>`;
    const tabs = $("#kTabs", wrap);
    MODE_ORDER.forEach((mid) => {
      const b = document.createElement("button");
      b.className = "tab" + (mid === activeMode ? " active" : "");
      b.textContent = DATA[mid] ? DATA[mid].title : mid;
      b.onclick = () => { $$(".tab", tabs).forEach((t) => t.classList.remove("active")); b.classList.add("active"); renderKBody(mid); };
      tabs.appendChild(b);
    });
    renderKBody(activeMode);

    function renderKBody(mid) {
      const body = $("#kBody", wrap);
      const mode = DATA[mid];
      const rich = (KNOW[mid] && KNOW[mid].length) ? KNOW[mid] : (mode ? mode.chapters.map((ch) => ({ chapter: ch.title, sections: [{ h: "สรุปสาระสำคัญ", list: ch.notes || [] }] })) : []);
      if (!rich.length) { body.innerHTML = `<div class="card muted">ยังไม่มีสรุปสำหรับโหมดนี้</div>`; return; }
      const totalSections = rich.reduce((s, c) => s + (c.sections ? c.sections.length : 0), 0);
      body.innerHTML = `
        <div class="k-toolbar">
          <input class="text" id="kSearch" placeholder="🔍 ค้นหาเนื้อหา/คำศัพท์ในบทนี้..." />
          <span class="muted k-count">${rich.length} บท • ${totalSections} หัวข้อ</span>
        </div>
        <div id="kChapters">` +
        rich.map((chp, i) => `
          <div class="accordion kchap" data-i="${i}">
            <button><span>${esc(chp.chapter)}</span><span class="caret">▶</span></button>
            <div class="content">
              ${(chp.sections || []).map((sec) => `
                <div class="ksection" data-text="${esc(((sec.h || "") + " " + (sec.p || []).join(" ") + " " + (sec.list || []).join(" ")).toLowerCase())}">
                  <h4 class="ksection-h">${esc(sec.h)}</h4>
                  ${(sec.p || []).map((t) => `<p class="kpar">${esc(t)}</p>`).join("")}
                  ${sec.list ? `<ul class="klist">${sec.list.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
                </div>`).join("")}
              ${(chp.check && chp.check.length) ? `<div class="kcheck-wrap">
                <h4 class="kcheck-title">🧠 ลองเช็คความเข้าใจ</h4>
                ${chp.check.map((ck) => `
                  <div class="kcheck">
                    <div class="kcheck-q">${esc(ck.q)}</div>
                    <div class="choices">
                      ${ck.choices.map((c, ci) => `<button class="choice" data-i="${ci}"><span class="key">${LETTERS[ci]}</span><span>${esc(c)}</span></button>`).join("")}
                    </div>
                    <div class="kcheck-fb"></div>
                  </div>`).join("")}
              </div>` : ""}
            </div>
          </div>`).join("") + `</div>`;
      $$(".kchap", body).forEach((acc) => {
        $("button", acc).onclick = () => acc.classList.toggle("open");
      });
      const first = $(".kchap", body); if (first) first.classList.add("open");

      // ผูกปุ่มคำถามท้ายบท
      $$(".kchap", body).forEach((acc) => {
        const chp = rich[+acc.dataset.i] || {};
        const checks = chp.check || [];
        $$(".kcheck", acc).forEach((box, qi) => {
          const item = checks[qi]; if (!item) return;
          const btns = $$(".choice", box);
          btns.forEach((b, bi) => {
            b.onclick = () => {
              if (box.dataset.done) return;
              box.dataset.done = "1";
              btns.forEach((bb, k) => {
                bb.classList.add("locked");
                if (k === item.answer) bb.classList.add("correct");
                if (k === bi && bi !== item.answer) bb.classList.add("wrong");
              });
              const ok = bi === item.answer;
              $(".kcheck-fb", box).innerHTML = `<div class="feedback ${ok ? "ok" : "no"}">
                <h4>${ok ? "✅ ถูกต้อง!" : `❌ ยังไม่ถูก — คำตอบที่ถูกคือ "${esc(item.choices[item.answer])}"`}</h4>
                <p>${esc(item.explanation || "")}</p></div>`;
            };
          });
        });
      });

      const search = $("#kSearch", body);
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        $$(".kchap", body).forEach((acc) => {
          let visible = 0;
          $$(".ksection", acc).forEach((sec) => {
            const show = !q || (sec.dataset.text || "").includes(q);
            sec.style.display = show ? "" : "none";
            if (show) visible++;
          });
          acc.style.display = visible ? "" : "none";
          if (q && visible) acc.classList.add("open");
        });
      });
    }
  }

  /* ================= Flashcards ================= */
  function flashCardsFor(modeId) {
    if (modeId === "__special__") {
      const out = []; MODE_ORDER.forEach((m) => (DATA[m] && DATA[m].chapters || []).forEach((ch) => (ch.terms || []).forEach((t) => out.push({ ...t, chapter: ch.title, mode: m }))));
      return out;
    }
    const m = DATA[modeId]; if (!m) return [];
    const out = [];
    (m.chapters || []).forEach((ch) => (ch.terms || []).forEach((t) => out.push({ ...t, chapter: ch.title, mode: modeId })));
    return out;
  }

  function renderFlash(main, modeId) {
    const chosen = (typeof modeId === "string" && (MODE_ORDER.includes(modeId) || modeId.startsWith("__"))) ? modeId : MODE_ORDER.find((m) => flashCardsFor(m).length) || MODE_ORDER[0];
    let pool = shuffle(flashCardsFor(chosen));
    let i = 0, flipped = false;
    const wrap = document.createElement("div");
    main.appendChild(wrap);
    wrap.innerHTML = `<h2 class="section-title">🃏 แฟลชการ์ดทวนความจำ</h2><p class="section-sub">แตะการ์ดเพื่อดูคำตอบ</p>
      <div class="tabs" id="fTabs"></div><div id="fCard"></div>`;
    const tabs = $("#fTabs", wrap);
    const opts = MODE_ORDER.concat(["__special__"]);
    opts.forEach((m) => {
      const b = document.createElement("button");
      b.className = "tab" + (m === chosen ? " active" : "");
      b.textContent = m === "__special__" ? "🎲 รวมทุกเนื้อหา" : (DATA[m] ? DATA[m].title : m);
      b.onclick = () => route("flash", m);
      tabs.appendChild(b);
    });
    draw();

    function draw() {
      const box = $("#fCard", wrap);
      if (!pool.length) { box.innerHTML = `<div class="card muted">ยังไม่มีการ์ดในโหมดนี้</div>`; return; }
      const c = pool[i];
      box.innerHTML = `
        <div class="flashcard" id="fl">
          <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <span class="badge">${esc(c.chapter)}</span>
            <span class="muted">${i + 1}/${pool.length}</span>
          </div>
          <div class="flashcard">
            <div class="term-card" style="min-height:220px;border:1px solid var(--line);border-radius:16px;padding:26px;display:grid;place-items:center;text-align:center;cursor:pointer;background:var(--card-solid)">
              <div>
                <div class="q-topic">คำถาม/คำศัพท์</div>
                <div class="term" style="font-size:24px;font-weight:700;margin-top:8px">${esc(c.term)}</div>
                <div class="muted" style="margin-top:14px">— แตะเพื่อพลิก —</div>
              </div>
            </div>
          </div>
          <div id="defBox"></div>
          <div class="row" style="margin-top:16px;justify-content:center">
            <button class="btn" id="prev">← ก่อนหน้า</button>
            <button class="btn primary" id="flip">พลิกการ์ด</button>
            <button class="btn" id="next">ถัดไป →</button>
          </div>
        </div>`;
      let shown = false;
      const showDef = () => {
        shown = true;
        $("#defBox", box).innerHTML = `<div class="feedback" style="margin-top:14px"><h4 style="color:var(--accent)">คำตอบ</h4><p>${esc(c.def)}</p></div>`;
      };
      $(".term-card", box).onclick = () => (shown ? null : showDef());
      $("#flip", box).onclick = () => showDef();
      $("#prev", box).onclick = () => { i = (i - 1 + pool.length) % pool.length; draw(); };
      $("#next", box).onclick = () => { i = (i + 1) % pool.length; draw(); };
    }
  }

  /* ================= Boot ================= */
  document.addEventListener("DOMContentLoaded", () => {
    ensureIds();
    $("#brandHome").onclick = () => route("home");
    $$(".navbtn").forEach((b) => (b.onclick = () => route(b.dataset.nav)));
    renderProfileChip();
    ensureUser();
    route("home");
  });
})();
