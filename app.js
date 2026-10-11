const KEY = { fav: "aiws.fav", hist: "aiws.hist", prm: "aiws.prompts" };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let fav = load(KEY.fav, null);
if (!fav) { fav = ["chatgpt", "claude", "gemini", "perplexity", "notebooklm"]; save(KEY.fav, fav); }
let hist = load(KEY.hist, []);
let myPrompts = load(KEY.prm, []);
myPrompts = (Array.isArray(myPrompts) ? myPrompts : [])
  .filter(p => p && p.id && typeof p.title === "string" && typeof p.body === "string")
  .map(p => ({ ...p, tags: Array.isArray(p.tags) ? p.tags : [] }));
const pf = { tag: "", editing: null, draft: null, err: "" };
let view = { name: "home" };
let q = "";

const $ = s => document.querySelector(s);
const ai = id => AIS.find(a => a.id === id);
const cat = id => CATS.find(c => c.id === id);
const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = t => { const m = Math.floor((Date.now() - t) / 6e4); return m < 1 ? "たった今" : m < 60 ? m + "分前" : m < 1440 ? Math.floor(m / 60) + "時間前" : Math.floor(m / 1440) + "日前"; };

const ic = a => `<span class="ic" style="--c:${a.color}">${a.name[0]}<img src="assets/logos/${a.id}.svg" alt="" onerror="logoFail(this)"></span>`;
// ロゴ画像は assets/logos/<AIのid>.svg（なければ .png）。どちらもなければ頭文字を表示します。
function logoFail(i) { if (i.src.endsWith(".svg")) i.src = i.src.replace(/\.svg$/, ".png"); else i.remove(); }
const card = a => `<div class="card" data-open="${a.id}">${ic(a)}<h3>${a.name}</h3><p>${a.desc}</p>
  <div class="cm"><span>${cat(a.cats[0]).name}</span>
  <button class="star${fav.includes(a.id) ? " on" : ""}" data-fav="${a.id}" aria-pressed="${fav.includes(a.id)}" aria-label="${a.name}をお気に入りに${fav.includes(a.id) ? "から外す" : "追加"}">★</button>
  <button class="go" data-open="${a.id}">起動</button></div></div>`;
const grid = list => `<div class="grid">${list.map(card).join("")}</div>`;
const empty = t => `<p class="empty">${t}</p>`;
const sec = (title, body, more) => `<section><div class="sh"><h2>${title}</h2>${more ? `<button class="more" data-nav="${more}">すべて見る</button>` : ""}</div>${body}</section>`;

// ===== プロンプト集 =====
const allPrompts = () => [...myPrompts.map(p => ({ ...p, mine: true })), ...PROMPTS.map(p => ({ ...p, mine: false }))];
const findPrompt = id => allPrompts().find(p => p.id === id);
const parseTags = s => [...new Set(String(s).split(/[,、，\s]+/).map(t => t.replace(/^[#＃]/, "").trim()).filter(Boolean))].slice(0, 10);
const tagCounts = () => { const m = new Map(); allPrompts().forEach(p => p.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1))); return [...m]; };
const pMatch = (p, k) => [p.title, p.body, p.tags.join(" ")].join(" ").toLowerCase().includes(k);

const pCard = p => {
  const acts = p.mine
    ? `<button class="pbtn" data-pact="edit" data-id="${p.id}">編集</button><button class="pbtn del" data-pact="del" data-id="${p.id}">削除</button>`
    : `<button class="pbtn" data-pact="dup" data-id="${p.id}">複製して編集</button>`;
  return `<article class="pcard"><h3>${esc(p.title)}</h3>
    <div class="ptags">${p.tags.map(t => `<button class="tag${pf.tag === t ? " on" : ""}" data-pact="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div>
    <pre class="pbody">${esc(p.body)}</pre>
    <div class="pact"><button class="pbtn" data-pact="expand" data-id="${p.id}">全文を見る</button>${acts}<button class="go" data-pact="copy" data-id="${p.id}">コピー</button></div></article>`;
};
const pGrid = list => `<div class="pgrid">${list.map(pCard).join("")}</div>`;

const modalEl = document.createElement("div");
modalEl.className = "modal"; modalEl.hidden = true;
document.body.appendChild(modalEl);
let modalInit = "", modalMode = "", downOnOverlay = false;
const formVals = () => JSON.stringify([$("#pt").value.trim(), $("#pb").value.trim(), parseTags($("#pg").value)]);

function showModal() {
  const d = pf.draft;
  const chips = tagCounts().map(([t]) => `<button type="button" class="chip" data-pact="addtag" data-tag="${esc(t)}">#${esc(t)}</button>`).join("");
  modalEl.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mh">
    <div class="mhead"><h2 id="mh">${pf.editing === "new" ? "プロンプトを追加" : "プロンプトを編集"}</h2><button class="mx" data-pact="close" aria-label="閉じる">×</button></div>
    <div class="mbody">
      <label>タイトル<input id="pt" maxlength="60" value="${esc(d.title)}" placeholder="例：ブログ記事の導入文を作る"></label>
      <label>プロンプト本文<textarea id="pb" rows="10" placeholder="AIに渡す指示を書きます。【 】で囲んだ部分を、使うときに書き換える目印にできます。">${esc(d.body)}</textarea></label>
      <label>タグ（用件ごとに。カンマか空白で区切ります）<input id="pg" value="${esc(d.tags)}" placeholder="例：記事作成 要約"></label>
      ${chips ? `<div class="chips"><small>既存のタグから追加：</small>${chips}</div>` : ""}
    </div>
    <div class="mfoot"><p class="err" id="perr" role="alert"></p><button class="btn" data-pact="close">キャンセル</button><button class="btn primary" data-pact="save">保存</button></div>
  </div>`;
  modalMode = "form"; modalEl.hidden = false; document.body.style.overflow = "hidden";
  modalInit = formVals();
  $("#pt").focus();
}
function showView(p) {
  const acts = p.mine
    ? `<button class="btn" data-pact="edit" data-id="${p.id}">編集</button>`
    : `<button class="btn" data-pact="dup" data-id="${p.id}">複製して編集</button>`;
  modalEl.innerHTML = `<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mh">
    <div class="mhead"><h2 id="mh">${esc(p.title)}</h2><button class="mx" data-pact="close" aria-label="閉じる">×</button></div>
    <div class="mbody"><div class="ptags">${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join("")}</div><pre class="pfull">${esc(p.body)}</pre></div>
    <div class="mfoot"><button class="btn primary" data-pact="copy" data-id="${p.id}">コピー</button>${acts}<span class="sp"></span><button class="btn" data-pact="close">閉じる</button></div>
  </div>`;
  modalMode = "view"; modalEl.hidden = false; document.body.style.overflow = "hidden";
  modalEl.querySelector('[data-pact="copy"]').focus();
}
function closeModal() {
  modalMode = ""; modalEl.hidden = true; modalEl.innerHTML = ""; document.body.style.overflow = "";
  pf.editing = null; pf.draft = null;
  const b = $('[data-pact="new"]'); if (b) b.focus();
}
function requestClose() {
  if (modalEl.hidden) return;
  if (modalMode === "form" && formVals() !== modalInit && !confirm("入力中の内容は保存されません。閉じますか？")) return;
  closeModal();
}

function promptView() {
  const tags = tagCounts();
  if (pf.tag && !tags.some(([t]) => t === pf.tag)) pf.tag = "";
  const all = allPrompts().filter(p => !pf.tag || p.tags.includes(pf.tag));
  const mine = all.filter(p => p.mine), tpl = all.filter(p => !p.mine);
  const bar = `<div class="chips"><button class="chip${pf.tag ? "" : " on"}" data-pact="tag" data-tag="">すべて</button>${tags.map(([t, n]) => `<button class="chip${pf.tag === t ? " on" : ""}" data-pact="tag" data-tag="${esc(t)}">#${esc(t)} <small>${n}</small></button>`).join("")}</div>`;
  return `<section><div class="sh"><h2>プロンプト</h2><button class="btn primary" data-pact="new">＋ 新規作成</button></div>
    <p class="lead">用件ごとのタグで絞り込めます。コピーして、お好きなAIに貼り付けて使ってください。</p>${bar}</section>`
    + sec(`マイプロンプト（${mine.length}件）`, mine.length ? pGrid(mine) : empty(pf.tag ? "このタグのマイプロンプトはまだありません。" : "まだありません。「＋ 新規作成」から、自分用のプロンプトを保存できます。"))
    + sec(`テンプレート（${tpl.length}件）`, tpl.length ? pGrid(tpl) : empty("このタグのテンプレートはありません。"));
}

const NAV = [["home", "⌂", "ホーム"], ["ai", "▦", "AI一覧"], ["fav", "★", "お気に入り"], ["hist", "◷", "履歴"], ["prompt", "✦", "プロンプト"], ["settings", "⚙", "設定"]];

function renderNav() {
  const on = (n, c) => (view.name === n && (!c || view.cat === c)) ? " on" : "";
  $("#nav").innerHTML = NAV.map(([n, i, l]) => `<button class="${on(n)}" data-nav="${n}"><i>${i}</i>${l}</button>`).join("")
    + `<div class="nav-label">カテゴリ</div>`
    + CATS.map(c => `<button class="${on("cat", c.id)}" data-cat="${c.id}"><i>${c.icon}</i>${c.name}</button>`).join("");
}

function renderContent() {
  if (q) {
    const k = q.toLowerCase();
    const r = AIS.filter(a => [a.name, a.desc, a.tags, ...a.cats.map(c => cat(c).name + cat(c).desc)].join(" ").toLowerCase().includes(k));
    const pr = allPrompts().filter(p => pMatch(p, k));
    return sec(`「${esc(q)}」の検索結果（${r.length}件）`, r.length ? grid(r) : empty("一致するAIが見つかりません。別のキーワードで検索してください。"))
      + (pr.length ? sec(`プロンプトの検索結果（${pr.length}件）`, pGrid(pr)) : "");
  }
  switch (view.name) {
    case "prompt": return promptView();
    case "ai": return sec("AI一覧", grid(AIS));
    case "fav": { const l = fav.map(ai).filter(Boolean); return sec("お気に入り", l.length ? grid(l) : empty("お気に入りはまだありません。AIカードの★を押すと追加されます。")); }
    case "hist": { const l = hist.map(h => ({ a: ai(h.id), t: h.t })).filter(r => r.a);
      return sec("履歴", l.length ? `<div class="list">${l.map(r => `<button class="qa" data-open="${r.a.id}"><span>${r.a.name}<small class="blk">${r.a.desc}</small></span><time>${ago(r.t)}</time></button>`).join("")}</div>` : empty("履歴はまだありません。AIを開くと新しい順に表示されます。")); }
    case "cat": { const c = cat(view.cat); return sec(c.name, `<p class="lead">${c.desc}</p>` + grid(AIS.filter(a => a.cats.includes(c.id)))); }
    case "settings": return sec("設定", `<div class="panel"><p class="lead">お気に入り・履歴・追加したプロンプトは、このブラウザにだけ保存されています。</p>
      <div class="btns"><button class="btn" data-reset="fav">お気に入りをリセット</button><button class="btn" data-reset="hist">履歴を削除</button><button class="btn" data-reset="prm">追加したプロンプトを削除</button></div></div>`);
    default: {
      const l = fav.map(ai).filter(Boolean);
      return sec("★ お気に入り", l.length ? grid(l) : empty("お気に入りはまだありません。AIカードの★を押すと追加されます。"), "fav")
        + sec("カテゴリから探す", `<div class="tiles">${CATS.map(c => `<button class="tile" data-cat="${c.id}"><span class="ti">${c.icon}</span><span><b>${c.name}</b><small>${c.desc}</small></span><em>${AIS.filter(a => a.cats.includes(c.id)).length}</em></button>`).join("")}</div>`);
    }
  }
}

function render() {
  $("#hero").hidden = !(view.name === "home" || q);
  renderNav();
  $("#content").innerHTML = renderContent();
}

function go(v) { closeMenu(); view = v; q = ""; pf.editing = null; pf.draft = null; $("#q").value = ""; render(); scrollTo(0, 0); }

function launch(id) {
  const a = ai(id); if (!a) return;
  window.open(a.url, "_blank", "noopener");
  hist = [{ id, t: Date.now() }, ...hist.filter(h => h.id !== id)].slice(0, 50);
  save(KEY.hist, hist); render();
}

document.addEventListener("click", e => {
  const t = e.target;
  let el;
  if ((el = t.closest("[data-fav]"))) {
    const id = el.dataset.fav;
    fav = fav.includes(id) ? fav.filter(x => x !== id) : [...fav, id];
    save(KEY.fav, fav); render();
  } else if ((el = t.closest("[data-open]"))) launch(el.dataset.open);
  else if ((el = t.closest("[data-nav]"))) go({ name: el.dataset.nav });
  else if ((el = t.closest("[data-cat]"))) go({ name: "cat", cat: el.dataset.cat });
  else if ((el = t.closest("[data-reset]"))) {
    const k = el.dataset.reset;
    const msg = { fav: "お気に入りをすべて解除します。よろしいですか？", hist: "履歴をすべて削除します。よろしいですか？", prm: "追加したプロンプトをすべて削除します（テンプレートは残ります）。よろしいですか？" }[k];
    if (confirm(msg)) {
      if (k === "fav") { fav = []; save(KEY.fav, fav); } else if (k === "hist") { hist = []; save(KEY.hist, hist); } else { myPrompts = []; save(KEY.prm, myPrompts); pf.editing = null; pf.draft = null; }
      render();
    }
  }
});

$("#q").addEventListener("input", e => { q = e.target.value.trim(); render(); });
$("#searchForm").addEventListener("submit", e => e.preventDefault());

// ----- フッターの「ご意見はこちら」 -----
if (typeof FEEDBACK_URL === "string" && /^https?:\/\//.test(FEEDBACK_URL)) {
  const fb = $("#feedback"); fb.href = FEEDBACK_URL; fb.hidden = false;
}

// ----- スマホ向け：右上の3本線ボタンでメニューを開閉 -----
const appEl = $(".app"), menuBtn = $("#menuBtn");
function setMenu(on) {
  appEl.classList.toggle("menu-open", on);
  menuBtn.setAttribute("aria-expanded", String(on));
  menuBtn.setAttribute("aria-label", on ? "メニューを閉じる" : "メニューを開く");
}
const closeMenu = () => setMenu(false);
menuBtn.addEventListener("click", () => setMenu(!appEl.classList.contains("menu-open")));
if (window.matchMedia) matchMedia("(max-width:720px)").addEventListener("change", closeMenu);
document.addEventListener("keydown", e => { if (e.key === "Escape" && appEl.classList.contains("menu-open") && modalEl.hidden) closeMenu(); });

// ----- プロンプト集の操作 -----
const toastEl = document.createElement("div");
toastEl.id = "toast"; toastEl.setAttribute("role", "status");
document.body.appendChild(toastEl);
let toastTimer;
function toast(m) {
  toastEl.textContent = m; toastEl.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch {}
  try {
    const t = document.createElement("textarea");
    t.value = s; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch { return false; }
}
const toPrompt = () => { if (view.name !== "prompt" || q) { view = { name: "prompt" }; q = ""; $("#q").value = ""; } };
const openForm = (editing, draft) => { toPrompt(); pf.editing = editing; pf.draft = draft; render(); showModal(); };

function saveForm() {
  const title = $("#pt").value.trim(), body = $("#pb").value.trim(), tags = parseTags($("#pg").value);
  if (!title || !body) { $("#perr").textContent = "タイトルと本文は必須です。"; return; }
  if (!tags.length) tags.push("未分類");
  const editing = pf.editing;
  if (editing === "new") myPrompts = [{ id: "u-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, body, tags, t: Date.now() }, ...myPrompts];
  else myPrompts = myPrompts.map(x => x.id === editing ? { ...x, title, body, tags } : x);
  save(KEY.prm, myPrompts); closeModal(); render(); toast("保存しました");
}

modalEl.addEventListener("mousedown", e => { downOnOverlay = e.target === modalEl; });
document.addEventListener("keydown", e => {
  if (modalEl.hidden) return;
  if (e.key === "Escape") { e.preventDefault(); requestClose(); }
  else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && modalMode === "form") { e.preventDefault(); saveForm(); }
  else if (e.key === "Tab") {
    const f = [...modalEl.querySelectorAll("button,input,textarea")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

document.addEventListener("click", async e => {
  if (e.target === modalEl) { if (downOnOverlay) requestClose(); return; }
  const el = e.target.closest("[data-pact]"); if (!el) return;
  const a = el.dataset.pact, id = el.dataset.id, p = id ? findPrompt(id) : null;
  if (a === "copy") { if (p) toast((await copyText(p.body)) ? "コピーしました" : "コピーできませんでした"); }
  else if (a === "expand" && p) showView(p);
  else if (a === "tag") { toPrompt(); const t = el.dataset.tag; pf.tag = pf.tag === t ? "" : t; render(); }
  else if (a === "new") openForm("new", { title: "", body: "", tags: pf.tag });
  else if (a === "edit" && p) openForm(id, { title: p.title, body: p.body, tags: p.tags.join(" ") });
  else if (a === "dup" && p) openForm("new", { title: p.title, body: p.body, tags: p.tags.join(" ") });
  else if (a === "close") requestClose();
  else if (a === "addtag") {
    const input = $("#pg"); if (!input) return;
    const ts = parseTags(input.value); if (!ts.includes(el.dataset.tag)) ts.push(el.dataset.tag);
    input.value = ts.join(" ");
  }
  else if (a === "save") saveForm();
  else if (a === "del" && p) {
    if (!confirm(`「${p.title}」を削除します。よろしいですか？`)) return;
    myPrompts = myPrompts.filter(x => x.id !== id);
    if (pf.editing === id) { pf.editing = null; pf.draft = null; }
    save(KEY.prm, myPrompts); render(); toast("削除しました");
  }
});

render();
