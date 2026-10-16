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
  const EXAM_ORDER = ["exam-posn", "exam-tbo"];
  const ALL_MODES = MODE_ORDER.concat(EXAM_ORDER);

  /* ================= Data ================= */
  const DATA = window.BIO_DATA || {};
  const KNOW = window.BIO_KNOWLEDGE || {};
  const QOVERRIDE = window.BIO_QUESTIONS || {};

  function ensureIds() {
    MODE_ORDER.concat(EXAM_ORDER).forEach((mid) => {
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
  const everyQuestion = () => {
    const out = [];
    ALL_MODES.forEach((mid) => {
      const m = DATA[mid]; if (!m) return;
      (m.chapters || []).forEach((ch) => (ch.questions || []).forEach((q) => out.push(q)));
    });
    return out;
  };
  const modeCount = (mid) => (DATA[mid] ? DATA[mid].chapters.reduce((s, c) => s + c.questions.length, 0) : 0);
  const chapterTitle = (q) => (DATA[q._mode] ? DATA[q._mode].chapters[q._ci].title : "");

  /* ================= โจทย์คำนวณ (filter) ================= */
  const CALC_UNIT = /(mol|molar|mM|µM|μM|%|กรัม|\bkg\b|\bmg\b|µg|ng|มิลลิลิตร|ลิตร|mL|ml|µl|µL|\bcm\b|\bmm\b|µm|μm|\bnm\b|\bbp\b|kDa|kcal|kJ|นาโน|ไมโคร|มิลลิ)/i;
  const CALC_WORD = /(คำนวณ|คำนวน|จงหา|กี่|เท่าไหร่|เท่าไร|เท่าใด|อัตราส่วน|อัตรา|ความเข้มข้น|เจือจาง|ร้อยละ|เปอร์เซ็นต์|ความน่าจะเป็น|ปริมาณ|สัดส่วน|ผลคูณ|เท่าตัว)/;
  function isCalc(q) {
    const qtext = String(q.q || "");
    if (!/\d/.test(qtext)) return false;
    return CALC_WORD.test(qtext) || CALC_UNIT.test(qtext);
  }
  function buildCalcMode() {
    const groups = [];
    ALL_MODES.forEach((mid) => {
      const m = DATA[mid]; if (!m) return;
      m.chapters.forEach((ch) => {
        const qs = (ch.questions || []).filter(isCalc);
        if (qs.length) groups.push({ title: m.title + " · " + ch.title, questions: qs });
      });
    });
    DATA["__calc__"] = { title: "โจทย์คำนวณ", icon: "🧮", chapters: groups };
  }

  /* ================= Storage ================= */
  const KEY = "bio_quiz_v1";
  let Store = loadStore();
  function defaultStore() { return { version: 1, user: null, modes: {}, flash: {}, session: null, last: null, xp: 0, streak: { last: "", days: 0 }, badges: {} }; }
  function loadStore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultStore();
      const s = JSON.parse(raw);
      s.user = s.user || null; s.modes = s.modes || {}; s.flash = s.flash || {};
      s.session = s.session || null; s.last = s.last || null;
      if (typeof s.xp !== "number") s.xp = 0;
      if (!s.streak || typeof s.streak !== "object") s.streak = { last: "", days: 0 };
      if (!s.badges || typeof s.badges !== "object") s.badges = {};
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
    return { modeId: saved.modeId, count: saved.count, chapter: saved.chapter, items, idx, correct, restored: true, combo: 0, bestCombo: 0 };
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
      if (r && r.wrong > 0 && r.correct < r.wrong) out.push(q);
    });
    return out;
  }
  function resetWeak() {
    MODE_ORDER.forEach((mid) => { if (Store.modes[mid]) Store.modes[mid].questions = {}; });
    save();
  }
  function avgMastery() {
    const v = MODE_ORDER.map(modeMastery).filter((x) => x > 0);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  }
  const hasData = () => MODE_ORDER.some((mid) => Store.modes[mid] && Store.modes[mid].plays > 0);
  const accColor = (a) => (a >= 0.7 ? "var(--ok)" : a >= 0.4 ? "var(--warn)" : "var(--danger)");

  /* ================= Engagement: XP / Level / Streak / Badges / FX =================
     ออกแบบเพื่อกระตุ้นโดปามีน: รางวัลทันที, เลเวล, คอมโบ, เป้าหมายเล็ก ๆ, ความหลากหลาย
     เพื่อลดความเบื่อสำหรับผู้ใช้ที่สมาธิสั้น (ADHD) */
  const PRAISE = ["เยี่ยม! 🔥", "เก่งมาก ⚡", "แม่นสุด ๆ 🌟", "โดนเลย 🎯", "สมองแล่น 🧠", "สุดยอด ✨", "เป๊ะ! 💚", "ลื่นไหล 🚀", "โอ้โห! 💥"];
  const SUPPORT = ["ไม่เป็นไร ลองอีกนิด 💪", "เกือบแล้ว! 🌱", "ข้อนี้หลอกนิดนึง 🙂", "เก็บไว้ทบทวนนะ 📌", "ผิดก็ได้เรียน 🌿", "สู้ ๆ ข้อต่อไป 🌈"];
  const pick1 = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function levelInfo(xp) {
    let level = 1, cur = xp || 0, need = 80;
    while (cur >= need) { cur -= need; level++; need = Math.round(need * 1.25); }
    return { level, cur, need };
  }
  function todayStr() { const d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function yesterdayStr() { const y = new Date(); y.setDate(y.getDate() - 1); return y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate(); }

  function renderXpChip(animate) {
    const el = document.getElementById("xpChip");
    if (!el) return;
    const li = levelInfo(Store.xp || 0);
    const pct = Math.round((li.cur / li.need) * 100);
    el.innerHTML = `<span class="xp-lv">Lv.${li.level}</span>` +
      `<span class="xp-bar" title="${li.cur}/${li.need} XP"><i style="width:${pct}%"></i></span>` +
      `<span class="xp-fire" title="เล่นต่อเนื่อง ${Store.streak.days} วัน">🔥 ${Store.streak.days}</span>`;
    el.onclick = () => route("stats");
    if (animate) { el.classList.remove("pump"); void el.offsetWidth; el.classList.add("pump"); }
  }

  function touchStreak() {
    const t = todayStr();
    const s = Store.streak;
    if (s.last === t) return false;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const ys = y.getFullYear() + "-" + (y.getMonth() + 1) + "-" + y.getDate();
    s.days = s.last === ys ? (s.days + 1) : 1;
    s.last = t;
    save();
    return true;
  }

  function xpFloat(n) {
    const chip = document.getElementById("xpChip");
    if (!chip) return;
    const f = document.createElement("span");
    f.className = "xp-float";
    f.textContent = (n > 0 ? "+" : "") + n + " XP";
    chip.appendChild(f);
    setTimeout(() => f.remove(), 950);
  }

  function addXP(n) {
    if (!n) return;
    const before = levelInfo(Store.xp || 0).level;
    Store.xp = Math.max(0, (Store.xp || 0) + n);
    save();
    renderXpChip(true);
    xpFloat(n);
    if (levelInfo(Store.xp).level > before) levelUp(levelInfo(Store.xp).level);
  }

  function levelUp(level) {
    badgeToast("⭐", "เลเวลอัป!", "ถึงเลเวล " + level + " แล้ว เก่งมาก!");
    celebrate(55);
    if (level >= 5) unlockBadge("level5");
  }

  const BADGES = [
    { id: "first", icon: "🎬", name: "ก้าวแรก", desc: "ทำควิซจบครั้งแรก" },
    { id: "combo5", icon: "🔥", name: "ไฟลุก", desc: "ตอบถูกติดกัน 5 ข้อ" },
    { id: "combo10", icon: "⚡", name: "สายฟ้าฟาด", desc: "ตอบถูกติดกัน 10 ข้อ" },
    { id: "perfect", icon: "💯", name: "เพอร์เฟกต์", desc: "ทำได้ 100% ในหนึ่งรอบ" },
    { id: "streak3", icon: "📅", name: "ขยันจริง", desc: "เล่นต่อเนื่อง 3 วัน" },
    { id: "streak7", icon: "🗓️", name: "เจ็ดวันไม่มีหยุด", desc: "เล่นต่อเนื่อง 7 วัน" },
    { id: "explorer", icon: "🧭", name: "นักสำรวจ", desc: "เล่นครบทั้ง 6 โหมด" },
    { id: "aifriend", icon: "🤖", name: "คู่หู AI", desc: "ใช้ผู้ช่วย AI อธิบาย" },
    { id: "level5", icon: "🏅", name: "ตัวท็อป", desc: "ถึงเลเวล 5" },
  ];
  function unlockBadge(id) {
    if (!Store.badges || Store.badges[id]) return false;
    Store.badges[id] = true; save();
    const b = BADGES.find((x) => x.id === id);
    if (b) badgeToast(b.icon, "ปลดล็อก: " + b.name, b.desc);
    celebrate(45);
    return true;
  }
  function checkBadges() {
    if (Store.streak.days >= 3) unlockBadge("streak3");
    if (Store.streak.days >= 7) unlockBadge("streak7");
    const played = MODE_ORDER.filter((mid) => Store.modes[mid] && Store.modes[mid].plays > 0);
    if (played.length >= MODE_ORDER.length) unlockBadge("explorer");
  }

  function badgeToast(icon, title, desc) {
    let host = document.getElementById("toastHost");
    if (!host) { host = document.createElement("div"); host.id = "toastHost"; host.className = "toast-host"; document.body.appendChild(host); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<span class="toast-ic">${icon}</span><div><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</div>`;
    host.appendChild(t);
    raf(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 320); }, 3400);
  }

  function celebrate(power) {
    const glyphs = ["🧬", "⚡", "🌟", "💚", "✨", "🔬", "🧪", "💫", "🎉"];
    let host = document.getElementById("fxHost");
    if (!host) { host = document.createElement("div"); host.id = "fxHost"; host.className = "fx-host"; document.body.appendChild(host); }
    const n = Math.min(power || 24, 44);
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "fx";
      p.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      const ang = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 240;
      p.style.left = "50%"; p.style.top = "46%";
      p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--dy", (Math.sin(ang) * dist - 140) + "px");
      p.style.fontSize = (14 + Math.random() * 20) + "px";
      p.style.animationDelay = (Math.random() * 0.16) + "s";
      host.appendChild(p);
      setTimeout(() => p.remove(), 1500);
    }
  }
  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const raf = (fn) => { try { return (window.requestAnimationFrame || ((cb) => setTimeout(cb, 16)))(fn); } catch (e) { return setTimeout(fn, 16); } };

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
  let reelTimer = null;
  function route(view, params) {
    current = view;
    if (reelTimer) { clearInterval(reelTimer); reelTimer = null; }
    if (quizKeyHandler) { document.removeEventListener("keydown", quizKeyHandler); quizKeyHandler = null; }
    $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.nav === view));
    window.scrollTo(0, 0);
    const main = $("#app");
    main.innerHTML = "";
    ({ home: renderHome, mode: renderMode, quiz: renderQuiz, result: renderResult,
       knowledge: renderKnowledge, stats: renderStats, flash: renderFlash,
       reels: renderReels, write: renderWrite }[view] || renderHome)(main, params);
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
    const li = levelInfo(Store.xp || 0);
    const lvlPct = Math.round((li.cur / li.need) * 100);
    const badgeCount = BADGES.filter((b) => Store.badges[b.id]).length;
    const weakN = weakQuestions().length;
    const hero = `
      <div class="card hero">
        <div class="hero-top">
          <div class="lvl-ring" style="--p:${lvlPct}"><div><div class="lvl-num">Lv.${li.level}</div><div class="lvl-xp">${li.cur}/${li.need}</div></div></div>
          <div class="hero-meta">
            <h2 class="section-title" style="margin:0">${greet}</h2>
            <p class="section-sub" style="margin:6px 0 10px">เก็บ XP ให้ครบเพื่ออัปเลเวล แล้วเล่นต่อเนื่องเพื่อรักษาไฟ 🔥 ไว้</p>
            <div class="hero-chips">
              <span class="chip">⭐ ${Store.xp || 0} XP</span>
              <span class="chip">🔥 ${Store.streak.days} วันติด</span>
              <span class="chip">🥇 ${badgeCount}/${BADGES.length} เหรียญ</span>
            </div>
          </div>
        </div>
        <div class="hero-actions">
          <button class="btn primary" id="quick10">⚡ เล่นเร็ว 10 ข้อ</button>
          <button class="btn" id="daily">🔥 ท้าทายวันนี้</button>
          <button class="btn" id="quickWeak">🧠 ทบทวนข้อที่ผิด${weakN ? ` (${weakN})` : ""}</button>
        </div>
      </div>`;
    wrap.innerHTML = `${hero}${banner}
      <div class="card" style="margin-bottom:20px">
        <h3 class="section-title" style="font-size:16px">📊 ภาพรวมของคุณ</h3>
        <p class="section-sub">เลือกโหมดที่ต้องการ ระบบจะสุ่มข้อและสลับตัวเลือกใหม่ทุกครั้ง และจดจำความคืบหน้าของคุณไว้</p>
        <div class="row">
          <div class="stat-pill"><span>📚</span><div><b>${allQuestions().length}</b><div class="muted" style="font-size:12px">ข้อสอบทั้งหมด</div></div></div>
          <div class="stat-pill"><span>🧩</span><div><b>${MODE_ORDER.length}</b><div class="muted" style="font-size:12px">โหมดการเรียน</div></div></div>
          <div class="stat-pill"><span>🎯</span><div><b>${avgMastery()}%</b><div class="muted" style="font-size:12px">ความชำนาญเฉลี่ย</div></div></div>
          <div class="stat-pill"><span>🔁</span><div><b>${weakQuestions().length}</b><div class="muted" style="font-size:12px">ข้อที่ต้องทบทวน</div></div></div>
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

    const startFresh = (modeId, count) => {
      if (Store.session && Store.session.items && Store.session.items.length) {
        if (!confirm("มีควิซค้างอยู่ ต้องการเริ่มใหม่ทับของเดิมหรือไม่?")) { route("quiz", { modeId: Store.session.modeId, count: Store.session.count || 0, resume: true }); return; }
        clearSession();
      }
      route("quiz", { modeId, count });
    };
    const q10 = $("#quick10", wrap);
    if (q10) q10.onclick = () => startFresh("__special__", 10);
    const qd = $("#daily", wrap);
    if (qd) qd.onclick = () => startFresh("__special__", 15);
    const qw = $("#quickWeak", wrap);
    if (qw) qw.onclick = () => { if (weakQuestions().length) startFresh("__review__", 0); else route("home"); };

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
      { id: "__special__", icon: "🎲", title: "รวมทุกเนื้อหา (สุ่ม)", desc: `สุ่มจากทุกบท รวม ${allQuestions().length} ข้อ`, go: "mode" },
      { id: "__review__", icon: "🔁", title: "ทบทวนข้อที่ต้องทบทวน", desc: `มี ${weakQuestions().length} ข้อ • ตอบถูกจะหลุดจากรายการ`, go: "mode" },
      { id: "__calc__", icon: "🧮", title: "โจทย์คำนวณ", desc: `เน้นคำนวณ แยกตามระดับชั้น/บท • ${modeCount("__calc__")} ข้อ`, go: "mode" },
      { id: "__write__", icon: "✍️", title: "เขียนตอบ (AI ตรวจ)", desc: "เขียนคำตอบเอง ให้ AI ประเมินและให้คะแนน", go: "write" },
    ].forEach((s) => {
      const c = document.createElement("div");
      c.className = "mode-card special";
      c.innerHTML = `<div class="icon">${s.icon}</div><h3>${esc(s.title)}</h3><p>${esc(s.desc)}</p>`;
      c.onclick = () => route(s.go, s.id === "__write__" ? null : s.id);
      sg.appendChild(c);
    });

    const examIds = EXAM_ORDER.filter((id) => DATA[id]);
    if (examIds.length) {
      const title = document.createElement("h3");
      title.className = "section-title";
      title.style.marginTop = "26px";
      title.textContent = "🏆 สนามแข่งขัน";
      wrap.appendChild(title);
      const eg = document.createElement("div");
      eg.className = "grid";
      examIds.forEach((id) => {
        const m = DATA[id];
        const card = document.createElement("div");
        card.className = "mode-card";
        card.innerHTML = `<div class="icon">${m.icon || "🏆"}</div><h3>${esc(m.title)}</h3>
          <p>${m.chapters.length} ชุด • ${modeCount(id)} ข้อ</p>
          ${m.sub ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(m.sub)}</div>` : ""}`;
        card.onclick = () => route("mode", id);
        eg.appendChild(card);
      });
      wrap.appendChild(eg);
    }
  }

  /* ================= Mode intro ================= */
  function modeInfo(id) {
    if (id === "__special__") return { id, title: "รวมทุกเนื้อหา (สุ่ม)", icon: "🎲", chapters: null, count: allQuestions().length };
    if (id === "__review__") return { id, title: "ทบทวนข้อที่ต้องทบทวน", icon: "🔁", chapters: null, count: weakQuestions().length };
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
             ${(id.startsWith("__") || EXAM_ORDER.includes(id)) ? "" : `<button class="btn" id="flash">🃏 แฟลชการ์ด</button><button class="btn" id="know">📖 คลังความรู้</button>`}
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
      const order = q.fixed ? q.choices.map((_, i) => i) : shuffle(q.choices.map((_, i) => i));
      return { id: q.id, q, order, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer), picked: null, correct: null };
    });
    return { modeId, count, chapter: chapter == null ? null : chapter, items, idx: 0, correct: 0, combo: 0, bestCombo: 0 };
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
        <span class="combo-badge${(S.combo || 0) >= 2 ? " on" : ""}" id="comboBadge">🔥 x${S.combo || 0}</span>
        <span class="badge">✅ ${S.correct}</span>
      </div>
      <div class="qbar"><i style="width:${pct}%"></i></div>
      <div class="card">
        <div class="q-topic">${esc(it.q.concept || "")}</div>
        ${(it.q.stem || (it.q.imgs && it.q.imgs.length)) ? `<div class="q-stem"><div class="q-stem-head">📋 โจทย์/ข้อมูลประกอบ</div>${it.q.stem ? `<div class="q-stem-body">${esc(it.q.stem)}</div>` : ""}${(it.q.imgs || []).map((s) => `<img class="q-img" src="${esc(s)}" alt="ประกอบโจทย์" loading="lazy" />`).join("")}</div>` : ""}
        <div class="question">${esc(it.q.q)}</div>
        ${it.q.img ? `<img class="q-img" src="${esc(it.q.img)}" alt="ประกอบโจทย์" loading="lazy" />` : ""}
        <div class="choices" id="choices"></div>
        <div class="kbd-hint muted">⌨️ ${it.q.fixed ? "กด ก/1 = ถูก • ข/2 = ผิด" : "กดคีย์ ก ข ค ง หรือ 1 2 3 4 เพื่อตอบ"} • Enter เพื่อไปข้อต่อไป</div>
        <div id="fb"></div>
      </div>`;
    $("#quit", main).onclick = () => {
      if (confirm("ออกจากการทำควิซ? ความคืบหน้าจะถูกบันทึกไว้ ทำต่อได้ภายหลัง")) {
        persistSession(); S = null; route("home");
      }
    };

    const cbox = $("#choices", main);
    const imgc = it.q.imgChoices || [];
    it.choices.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = `<span class="key">${LETTERS[i]}</span><span>${esc(t)}${imgc[i] ? `<img class="c-img" src="${esc(imgc[i])}" alt="" loading="lazy">` : ""}</span>`;
      b.onclick = () => pick(i);
      cbox.appendChild(b);
    });

    if (it.picked !== null) showResult();

    function pick(i) {
      if (it.picked !== null) return;
      it.picked = i;
      it.correct = i === it.answer;
      if (it.correct) { S.correct++; S.combo = (S.combo || 0) + 1; S.bestCombo = Math.max(S.bestCombo || 0, S.combo); }
      else { S.lastCombo = S.combo || 0; S.combo = 0; }
      const gain = it.correct ? 10 + Math.min((S.combo - 1) * 3, 15) : 2;
      S.lastGain = gain;
      addXP(gain);
      if (it.correct && S.combo >= 3) celebrate(10 + Math.min(S.combo, 8) * 3);
      recordAnswer(it.q, it.correct); persistSession();
      showResult();
    }

    function showResult() {
      $$(".choice", cbox).forEach((b, bi) => {
        b.classList.add("locked");
        if (bi === it.answer) b.classList.add("correct");
        if (bi === it.picked && !it.correct) b.classList.add("wrong");
      });
      const praise = it.correct ? pickRandom(PRAISE) : pickRandom(SUPPORT);
      const comboLine = it.correct && (S.combo || 0) >= 2 ? `<div class="combo-line">🔥 คอมโบ x${S.combo}! ชุดนี้เก็บเพิ่ม +${S.lastGain || 0} XP</div>` : "";
      const fb = $("#fb", main);
      fb.innerHTML = `
        <div class="feedback ${it.correct ? "ok" : "no"}">
          <h4>${it.correct ? "✅ ถูกต้อง! " + praise : `❌ ยังไม่ใช่ — คำตอบที่ถูกคือ "${esc(it.choices[it.answer])}"`}</h4>
          ${comboLine}
          <p><span class="explain-label">คำอธิบาย: </span>${esc(it.q.explanation || "—")}</p>
          ${it.q.explanationImg ? `<img class="q-img" src="${esc(it.q.explanationImg)}" alt="" loading="lazy">` : ""}
        </div>
        <div class="row" style="margin-top:16px">
          <button class="btn primary" id="next">${S.idx + 1 < total ? "ข้อต่อไป →" : "ดูสรุปผล 🏁"}</button>
          ${window.AITutor ? `<button class="btn ai-explain" id="aiExplain">🤖 ให้ AI อธิบายข้อนี้</button>` : ""}
        </div>`;
      const cb = $("#comboBadge", main);
      if (cb) { cb.textContent = "🔥 x" + (S.combo || 0); cb.classList.toggle("on", (S.combo || 0) >= 2); cb.classList.remove("pump"); void cb.offsetWidth; if (it.correct && S.combo >= 2) cb.classList.add("pump"); }
      if (it.correct && S.combo >= 5) unlockBadge("combo5");
      if (it.correct && S.combo >= 10) unlockBadge("combo10");
      $("#next", main).onclick = () => {
        S.idx++;
        if (S.idx >= S.items.length) finish();
        else { persistSession(); renderQ($("#app")); }
      };
      const aiBtn = $("#aiExplain", main);
      if (aiBtn && window.AITutor) aiBtn.onclick = () => {
        unlockBadge("aifriend");
        window.AITutor.explainQuestion({
          concept: it.q.concept, stem: it.q.stem, question: it.q.q,
          choices: it.choices, answerIndex: it.answer, picked: it.picked, explanation: it.q.explanation,
        });
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
    const bestCombo = S.bestCombo || 0;
    const modeId = S.modeId;
    const ms = modeStat(modeId);
    ms.plays++; ms.best = Math.max(ms.best, score); ms.last = score; ms.lastAt = Date.now();
    Store.session = null;
    Store.last = { modeId, at: Date.now() };
    save();

    let bonus = Math.round(score / 2);
    if (score === 100) bonus += 50;
    if (bestCombo >= 5) bonus += 15;
    if (bonus) addXP(bonus);
    unlockBadge("first");
    if (score === 100) unlockBadge("perfect");
    checkBadges();

    S = null;
    route("result", { modeId, correct, total, score, bestCombo, bonus });
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
    const { modeId, correct, total, score, bestCombo, bonus } = p;
    const msg = score >= 80 ? "ยอดเยี่ยมมาก! 🎉" : score >= 60 ? "ดีมาก เกือบสมบูรณ์ ✨" : score >= 40 ? "พอใช้ได้ ลองทบทวนอีกนิด 💪" : "ไม่เป็นไร ค่อย ๆ ทบทวนนะ 🌱";
    if (score >= 80) setTimeout(() => celebrate(50), 250);
    const bars = (DATA[modeId] ? DATA[modeId].chapters.map((ch, ci) => ({ title: ch.title, acc: chapterAcc(modeId, ci) })).filter((x) => x.acc !== null).sort((a, b) => a.acc - b.acc) : []);
    main.innerHTML = `
      <div class="card center">
        <div class="badge">${esc(modeInfo(modeId) ? modeInfo(modeId).title : modeId)}</div>
        <div class="score-ring" style="--p:${score}"><div><div class="num">${score}%</div><div class="lbl">ถูก ${correct}/${total}</div></div></div>
        <div class="reward-row">
          ${bonus ? `<span class="reward-pill">＋${bonus} XP</span>` : ""}
          ${bestCombo >= 2 ? `<span class="reward-pill hot">🔥 คอมโบสูงสุด x${bestCombo}</span>` : ""}
          ${Store.streak.days >= 2 ? `<span class="reward-pill">🔥 ต่อเนื่อง ${Store.streak.days} วัน</span>` : ""}
        </div>
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
  function statsProgressCard() {
    const li = levelInfo(Store.xp || 0);
    const lvlPct = Math.round((li.cur / li.need) * 100);
    const badgeCards = BADGES.map((b) => {
      const on = !!Store.badges[b.id];
      return `<div class="badge-card${on ? " on" : ""}" title="${esc(b.desc)}"><div class="bc-ic">${on ? b.icon : "🔒"}</div><div class="bc-name">${esc(b.name)}</div></div>`;
    }).join("");
    return `<div class="card" style="margin-bottom:20px">
        <div class="hero-top">
          <div class="lvl-ring" style="--p:${lvlPct}"><div><div class="lvl-num">Lv.${li.level}</div><div class="lvl-xp">${li.cur}/${li.need}</div></div></div>
          <div class="hero-meta">
            <h3 class="section-title" style="margin:0;font-size:18px">ความก้าวหน้า</h3>
            <div class="hero-chips" style="margin-top:10px">
              <span class="chip">⭐ ${Store.xp || 0} XP</span>
              <span class="chip">🔥 ${Store.streak.days} วันติด</span>
              <span class="chip">🥇 ${BADGES.filter((b) => Store.badges[b.id]).length}/${BADGES.length} เหรียญ</span>
            </div>
          </div>
        </div>
        <div class="badge-grid" style="margin-top:16px">${badgeCards}</div>
      </div>`;
  }

  function renderStats(main) {
    const progress = statsProgressCard();
    if (!hasData()) {
      main.innerHTML = `<h2 class="section-title">สถิติของ ${esc(Store.user ? Store.user.name : "ผู้เล่น")}</h2>${progress}<div class="card center"><h3 class="section-title">ยังไม่มีสถิติจากโหมดการเรียน</h3><p class="section-sub">เริ่มทำควิซใน "โหมดการเรียน" ก่อน แล้วสถิติจุดอ่อน/จุดแข็งจะแสดงที่นี่ (แถบความก้าวหน้าด้านบนอัปเดตทุกครั้งที่ทำควิซ)</p><button class="btn primary" id="go">ไปเลือกโหมด</button></div>`;
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
      ${progress}
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
    if (rq.length) html += `<div class="row" style="margin-top:20px"><button class="btn primary" id="review">🔁 ทบทวนข้อที่ตอบผิด (${rq.length})</button></div>`;
    html += `<div class="row" style="margin-top:22px"><button class="btn" id="resetWeak">♻️ ล้างรายการข้อที่ต้องทบทวน</button><button class="btn danger" id="reset">🗑 ล้างข้อมูลทั้งหมดในเครื่องนี้</button></div>`;
    main.innerHTML = html;
    if ($("#review", main)) $("#review", main).onclick = () => route("mode", "__review__");
    if ($("#resetWeak", main)) $("#resetWeak", main).onclick = () => {
      if (confirm("ล้างรายการข้อที่ต้องทบทวน? (คะแนนและประวัติบทจะยังอยู่)")) { resetWeak(); route("stats"); }
    };
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

  /* ================= ชีวะฟีด (reels) ================= */
  const REEL_TONES = [
    ["#12b886", "#0a3d5c"], ["#7048e8", "#241a4d"], ["#f06595", "#3a0b2e"],
    ["#f59f00", "#3a2405"], ["#22b8cf", "#06333f"], ["#4dabf7", "#0b2440"],
    ["#cc5de8", "#2a0b3d"], ["#51cf66", "#0b3a1c"],
  ];
  function toneFor(c) {
    const s = String(c.chapter || "") + c.title;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return REEL_TONES[h % REEL_TONES.length];
  }
  function burstHeart(card) {
    const b = card.querySelector(".reel-burst");
    if (!b) return;
    b.classList.remove("go");
    void b.offsetWidth;
    b.classList.add("go");
  }
  function toast(host, msg) {
    const t = document.createElement("div");
    t.className = "reel-tip";
    t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 16px;border-radius:999px;z-index:9999";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1400);
  }
  function reelCards(modeId) {
    const cards = [];
    const mids = (modeId && ALL_MODES.includes(modeId)) ? [modeId] : ALL_MODES;
    mids.forEach((m) => {
      const know = (KNOW[m] && KNOW[m].length) ? KNOW[m] : [];
      know.forEach((chp) => {
        (chp.sections || []).forEach((sec) => {
          const body = [(sec.p || []).join("\n\n"), (sec.list || []).map((x) => "• " + x).join("\n")].filter(Boolean).join("\n\n");
          if (String(body).trim()) cards.push({ mode: m, chapter: chp.chapter, title: sec.h || "สรุป", body, kind: "note" });
        });
      });
      const mode = DATA[m];
      (mode && mode.chapters || []).forEach((ch) => {
        (ch.terms || []).forEach((t) => cards.push({ mode: m, chapter: ch.title, title: t.term, body: t.def, kind: "term" }));
      });
    });
    return cards;
  }

  function renderReels(main, focusMode) {
    const chosen = (typeof focusMode === "string" && ALL_MODES.includes(focusMode)) ? focusMode : "__all__";
    const cards = reelCards(chosen === "__all__" ? null : chosen);
    const wrap = document.createElement("div");
    main.appendChild(wrap);
    wrap.innerHTML = `<h2 class="section-title">🎬 ชีวะฟีด</h2>
      <p class="section-sub">ปัด/เลื่อนขึ้น-ลง ดูทีละการ์ด เหมือนดูคลิป — สรุปเนื้อหาและคำศัพท์ครบทุกบท</p>
      <div class="tabs" id="rTabs"></div>
      <div class="reel-frame">
        <div class="reel-progress"><i id="rProg"></i></div>
        <div class="reel-viewport" id="rView"></div>
        <div class="reel-bar">
          <button class="reel-round" id="rPlay" title="เล่นอัตโนมัติ">▶</button>
          <button class="reel-round" id="rUp" title="ก่อนหน้า">▲</button>
          <span class="badge" id="rCounter">1 / ${cards.length}</span>
          <button class="reel-round" id="rDown" title="ถัดไป">▼</button>
          <button class="reel-round" id="rShuffle" title="สุ่มการ์ด">🔀</button>
        </div>
        <p class="reel-tip">💡 ดับเบิลแตะเพื่อกดหัวใจ • กด 🤖 ให้ AI อธิบายการ์ดนี้</p>
      </div>`;
    const tabs = $("#rTabs", wrap);
    [{ id: "__all__", label: "🎲 ทั้งหมด" }].concat(ALL_MODES.map((m) => ({ id: m, label: DATA[m] ? DATA[m].title : m })))
      .forEach((t) => {
        const b = document.createElement("button");
        b.className = "tab" + (t.id === chosen ? " active" : "");
        b.textContent = t.label;
        b.onclick = () => route("reels", t.id === "__all__" ? null : t.id);
        tabs.appendChild(b);
      });
    const view = $("#rView", wrap);
    if (!cards.length) { view.innerHTML = `<div class="card muted">ยังไม่มีการ์ดในโหมดนี้</div>`; return; }

    cards.forEach((c) => {
      const el = document.createElement("div");
      el.className = "reel-card" + (c.kind === "term" ? " term" : "");
      const tone = toneFor(c);
      el.style.setProperty("--t1", tone[0]);
      el.style.setProperty("--t2", tone[1]);
      const emoji = (DATA[c.mode] && DATA[c.mode].icon) || "🧬";
      el.innerHTML = `<div class="reel-bg"></div>
        <div class="reel-inner">
          <div class="reel-meta">
            <span class="reel-chip">${emoji} ${esc(DATA[c.mode] ? DATA[c.mode].title : c.mode)}</span>
            <span class="reel-chip alt">${esc(c.chapter)}</span>
            ${c.kind === "term" ? '<span class="reel-chip hot">คำศัพท์</span>' : ""}
          </div>
          <div class="reel-hero">
            <div class="reel-emoji">${emoji}</div>
            <div class="reel-title">${esc(c.title)}</div>
            <div class="reel-body">${esc(c.body)}</div>
          </div>
          <div class="reel-actions">
            <button class="reel-act" data-act="like">🤍<b>0</b></button>
            <button class="reel-act" data-act="ai">🤖 อธิบาย</button>
            <button class="reel-act" data-act="share">⤴️ แชร์</button>
          </div>
          <div class="reel-hint">ปัดขึ้น ▲</div>
        </div>
        <div class="reel-burst">❤️</div>`;

      el.querySelector('[data-act="like"]').onclick = (e) => {
        e.stopPropagation();
        const b = e.currentTarget;
        const liked = b.classList.toggle("liked");
        b.firstChild.textContent = liked ? "❤️" : "🤍";
        const num = b.querySelector("b");
        num.textContent = liked ? (+num.textContent || 0) + 1 : Math.max(0, (+num.textContent || 1) - 1);
        if (liked) burstHeart(el);
      };
      el.querySelector('[data-act="ai"]').onclick = (e) => {
        e.stopPropagation();
        if (window.AITutor) window.AITutor.ask("อธิบายและสรุปเนื้อหาชีววิทยาเรื่อง \"" + c.title + "\" (บท " + c.chapter + ") ให้เข้าใจง่าย ๆ พร้อมยกตัวอย่างหรือเชื่อมโยงให้เห็นภาพ\n\nเนื้อหา: " + c.body);
      };
      el.querySelector('[data-act="share"]').onclick = (e) => {
        e.stopPropagation();
        const text = c.title + " — " + c.body;
        if (navigator.share) { navigator.share({ title: c.title, text }).catch(() => {}); }
        else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => toast(wrap, "คัดลอกแล้ว ✅")).catch(() => {}); }
      };
      el.ondblclick = () => burstHeart(el);
      view.appendChild(el);
    });

    const progress = $("#rProg", wrap);
    const counter = $("#rCounter", wrap);
    let cur = 0;
    const pageH = () => (view.clientHeight || 1);
    const setCur = () => {
      const i = Math.round(view.scrollTop / pageH());
      if (i !== cur && i >= 0 && i < cards.length) {
        cur = i;
        counter.textContent = (cur + 1) + " / " + cards.length;
      }
      progress.style.width = Math.max(2, ((cur + 1) / cards.length) * 100) + "%";
    };
    view.addEventListener("scroll", setCur);
    progress.style.width = Math.max(2, (1 / cards.length) * 100) + "%";
    const goTo = (i) => {
      cur = Math.max(0, Math.min(cards.length - 1, i));
      if (typeof view.scrollTo === "function") view.scrollTo({ top: cur * pageH(), behavior: "smooth" });
      else view.scrollTop = cur * pageH();
      counter.textContent = (cur + 1) + " / " + cards.length;
      progress.style.width = ((cur + 1) / cards.length * 100) + "%";
    };
    $("#rUp", wrap).onclick = () => goTo(cur - 1);
    $("#rDown", wrap).onclick = () => goTo(cur + 1);
    $("#rShuffle", wrap).onclick = () => goTo(Math.floor(Math.random() * cards.length));

    const playBtn = $("#rPlay", wrap);
    let playing = false;
    const stopPlay = () => { playing = false; playBtn.textContent = "▶"; playBtn.classList.remove("on"); if (reelTimer) { clearInterval(reelTimer); reelTimer = null; } };
    $("#rPlay", wrap).onclick = () => {
      if (playing) { stopPlay(); return; }
      playing = true;
      playBtn.textContent = "⏸";
      playBtn.classList.add("on");
      reelTimer = setInterval(() => goTo(cur + 1 >= cards.length ? 0 : cur + 1), 3500);
    };
    view.addEventListener("wheel", stopPlay, { passive: true });
    view.addEventListener("touchstart", stopPlay, { passive: true });
  }

  /* ================= เขียนตอบ (AI ตรวจ) ================= */
  function renderWrite(main, focusMode) {
    const chosen = (typeof focusMode === "string" && ALL_MODES.includes(focusMode)) ? focusMode : "__all__";
    const pool = everyQuestion().filter((q) => chosen === "__all__" || q._mode === chosen);
    const wrap = document.createElement("div");
    main.appendChild(wrap);
    wrap.innerHTML = `<h2 class="section-title">✍️ เขียนตอบ (AI ตรวจ)</h2>
      <p class="section-sub">เขียนคำตอบด้วยคำของคุณเอง แล้วให้ AI ประเมินว่าตรงกับเฉลยแค่ไหน</p>
      <div class="tabs" id="wTabs"></div><div id="wBody"></div>`;
    const tabs = $("#wTabs", wrap);
    [{ id: "__all__", label: "🎲 ทั้งหมด" }].concat(ALL_MODES.map((m) => ({ id: m, label: DATA[m] ? DATA[m].title : m })))
      .forEach((t) => {
        const b = document.createElement("button");
        b.className = "tab" + (t.id === chosen ? " active" : "");
        b.textContent = t.label;
        b.onclick = () => route("write", t.id === "__all__" ? null : t.id);
        tabs.appendChild(b);
      });
    if (!pool.length) { $("#wBody", wrap).innerHTML = `<div class="card muted">ไม่มีข้อในโหมดนี้</div>`; return; }
    let cur = pool[Math.floor(Math.random() * pool.length)];
    const pick = () => { cur = pool[Math.floor(Math.random() * pool.length)]; draw(); };

    function draw() {
      const box = $("#wBody", wrap);
      const minfo = modeInfo(cur._mode);
      box.innerHTML = `<div class="card">
        <div class="q-topic">${esc(cur.concept || "")} • ${esc(minfo ? minfo.title : cur._mode)}</div>
        ${cur.stem ? `<div class="q-stem"><div class="q-stem-head">📋 ข้อมูลประกอบ</div><div class="q-stem-body">${esc(cur.stem)}</div></div>` : ""}
        <div class="question">${esc(cur.q)}</div>
        <label class="muted">คำตอบของคุณ (อธิบายสั้น ๆ):</label>
        <textarea class="write-area" id="wAns" rows="5" placeholder="พิมพ์คำตอบ/คำอธิบายของคุณ..."></textarea>
        <div class="row" style="margin-top:14px">
          <button class="btn primary" id="wCheck">🤖 ตรวจด้วย AI</button>
          <button class="btn" id="wReveal">ดูเฉลย</button>
          <button class="btn" id="wNext">ข้อต่อไป →</button>
        </div>
        <div id="wFb"></div>
      </div>`;
      $("#wNext", box).onclick = pick;
      $("#wReveal", box).onclick = () => {
        $("#wFb", box).innerHTML = `<div class="feedback"><h4>เฉลย: ${esc(cur.choices[cur.answer])}</h4><p>${esc(cur.explanation || "—")}</p></div>`;
      };
      $("#wCheck", box).onclick = async () => {
        const ans = $("#wAns", box).value.trim();
        if (!ans) { alert("พิมพ์คำตอบก่อนนะครับ"); return; }
        if (!window.AITutor) { alert("โหลดตัวช่วย AI ไม่สำเร็จ"); return; }
        const fb = $("#wFb", box);
        fb.innerHTML = `<div class="feedback"><p>⏳ กำลังให้ AI ตรวจคำตอบ...</p></div>`;
        try {
          const res = await window.AITutor.grade({
            concept: cur.concept, stem: cur.stem, question: cur.q,
            choices: cur.choices, answerText: cur.choices[cur.answer],
            explanation: cur.explanation, studentAnswer: ans,
          });
          const score = (res && typeof res.score === "number") ? res.score : null;
          fb.innerHTML = `<div class="feedback ${score != null && score >= 60 ? "ok" : "no"}">
            <h4>${score != null ? "คะแนนจาก AI: " + score + "/100" : "ผลตรวจ"}${res.verdict ? " — " + esc(res.verdict) : ""}</h4>
            <p>${esc(res.feedback || "")}</p>
            ${(res.missing && res.missing.length) ? `<p style="margin-top:8px"><b>ควรเพิ่ม/ปรับ:</b></p><ul>${res.missing.map((x) => "<li>" + esc(x) + "</li>").join("")}</ul>` : ""}
            <hr style="border-color:var(--line)"><h4 style="font-size:14px">เฉลย</h4>
            <p><b>${esc(cur.choices[cur.answer])}</b> — ${esc(cur.explanation || "")}</p></div>`;
        } catch (e) {
          fb.innerHTML = `<div class="feedback no"><p>${esc(e && e.code === "NO_KEY" ? "ต้องใส่คีย์ Groq ก่อน — กดปุ่ม 🤖 มุมขวาล่าง แล้วกด ⚙️" : ((e && e.message) || "ตรวจไม่สำเร็จ"))}</p></div>`;
          if (e && e.code === "NO_KEY" && window.AITutor) window.AITutor.showKeyPrompt();
        }
      };
    }
    draw();
  }

  /* ================= Boot ================= */
  document.addEventListener("DOMContentLoaded", () => {
    ensureIds();
    buildCalcMode();
    $("#brandHome").onclick = () => route("home");
    $$(".navbtn").forEach((b) => (b.onclick = () => route(b.dataset.nav)));
    renderProfileChip();
    ensureUser();
    touchStreak();
    renderXpChip();
    route("home");
  });
})();
