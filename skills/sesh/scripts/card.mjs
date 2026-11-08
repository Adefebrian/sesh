// Story card (1080x1920) as a self-contained HTML string.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function compact(n) {
  if (n >= 1e9) return [(n / 1e9).toFixed(n >= 1e11 ? 0 : 1), "B"];
  if (n >= 1e6) return [(n / 1e6).toFixed(n >= 1e8 ? 0 : 1), "M"];
  if (n >= 1e3) return [(n / 1e3).toFixed(n >= 1e5 ? 0 : 1), "K"];
  return [String(n), ""];
}
export const clock = (ms) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
export function money(s) {
  if (s.usd == null) return "—";
  const v = s.usd;
  const txt = v >= 1e4 ? `$${(v / 1e3).toFixed(0)}K` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;
  return s.unpricedTokens > 0 ? txt + "+" : txt;
}
const two = (n) => String(n).padStart(2, "0");

function chart(series, W = 920, H = 200) {
  const s = series.length ? series : [0];
  const max = Math.max(1, ...s);
  const gap = s.length > 60 ? 3 : 6;
  const bw = Math.max(2, (W - gap * (s.length - 1)) / s.length);
  return s.map((v, i) => {
    if (!v) return ""; // idle bucket: leave empty, no stub
    const h = Math.max(4, (v / max) * H);
    const fill = v === max ? "var(--y)" : "rgba(255,255,255,.85)";
    return `<rect x="${(i * (bw + gap)).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"/>`;
  }).join("");
}

export function renderCard(s, { photo } = {}) {
  const d = s.start;
  const [tokV, tokU] = compact(s.tokens.total);
  const [outV, outU] = compact(s.tokens.output);
  const [peakV, peakU] = compact(Math.max(0, ...s.series));
  const where = [s.project, s.branch].filter(Boolean).join(" / ");
  const shortId = s.id.replace(/^rollout-/, "").slice(0, 8);

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--y:#f3e600;--ink:#08080a;--mute:rgba(255,255,255,.55);--line:rgba(255,255,255,.14)}
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1920px;background:var(--ink);color:#fff;font-family:"Rajdhani",system-ui,sans-serif;overflow:hidden}
.wrap{position:relative;width:1080px;height:1920px}
.photo{position:absolute;left:0;right:0;top:0;height:1120px;background:${photo ? `url("${photo}") center 35%/cover` : "none"}}
.shade{position:absolute;left:0;right:0;top:0;height:1120px;background:${photo
    ? "linear-gradient(180deg,rgba(8,8,10,.55) 0%,rgba(8,8,10,0) 12%,rgba(8,8,10,0) 58%,rgba(8,8,10,.75) 82%,var(--ink) 100%)"
    : "none"}}
.in{position:relative;height:100%;display:flex;flex-direction:column;padding:88px 80px}
.mono{font-family:"JetBrains Mono",ui-monospace,monospace}
.bar{display:flex;justify-content:space-between;font-size:22px;color:rgba(255,255,255,.8);letter-spacing:2px}
.hero{margin-top:180px;display:flex;flex-direction:column;gap:8px}
.hero .v{font-size:240px;font-weight:700;line-height:.9;color:var(--y);letter-spacing:-4px}
.hero .v small{font-size:96px;color:var(--y);opacity:.7}
.bottom{margin-top:auto;display:flex;flex-direction:column;gap:72px}
.group{display:flex;flex-direction:column;gap:44px}
.k{font-size:20px;letter-spacing:3px;color:var(--mute)}
.title{font-size:88px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:1px;margin-top:16px;overflow-wrap:anywhere}
.title b{color:var(--y)}
.chart{display:flex;flex-direction:column;gap:16px}
.row{display:flex;justify-content:space-between;font-size:20px;letter-spacing:2px;color:var(--mute)}
.row em{font-style:normal;color:var(--y)}
.stats{display:grid;grid-template-columns:repeat(3,auto);justify-content:space-between;column-gap:32px;border-top:1px solid var(--line)}
.rule{grid-column:1/-1;height:1px;background:var(--line);margin-top:44px}
.cell{padding-top:28px;display:flex;flex-direction:column;gap:6px}
.v{font-size:84px;font-weight:600;line-height:1}
.v small{font-size:32px;color:var(--mute);margin-left:4px}
.hl .v{color:var(--y)}
.cell.mini .v{font-size:52px}
.foot{display:flex;justify-content:space-between;align-items:baseline;font-size:20px;letter-spacing:2px;color:var(--mute);border-top:1px solid var(--line);padding-top:28px;margin-top:-24px}
.logo{font-size:30px;color:var(--y);font-weight:500}
</style></head><body>
<div class="wrap">
 <div class="photo"></div><div class="shade"></div>
 <div class="in">
  <div class="bar mono"><span>ID ${esc(shortId.toUpperCase())}</span><span>${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}</span></div>
  ${photo ? "" : `<div class="hero"><div class="k mono">TOKENS BURNED</div><div class="v">${tokV}<small>${tokU}</small></div></div>`}
  <div class="bottom">
   <div class="group">
    <div>
     ${where ? `<div class="k mono">${esc(where.toUpperCase())}</div>` : ""}
     <div class="title">${esc(s.title)}<b>.</b></div>
    </div>
    <div class="chart">
     <div class="row mono"><span>TOKENS / ${s.bucketMin} MIN</span><span>PEAK <em>${peakV}${peakU}</em></span></div>
     <svg width="920" height="200" viewBox="0 0 920 200">${chart(s.series)}</svg>
     <div class="row mono"><span>0:00</span><span>${clock(s.movingMs)}</span></div>
    </div>
   </div>
   <div>
    <div class="stats">
     ${photo ? `<div class="cell hl"><div class="k mono">TOKENS</div><div class="v">${tokV}<small>${tokU}</small>` : `<div class="cell"><div class="k mono">ELAPSED</div><div class="v">${clock(s.elapsedMs)}<small>H</small>`}</div></div>
     <div class="cell"><div class="k mono">MOVING</div><div class="v">${clock(s.movingMs)}<small>H</small></div></div>
     <div class="cell"><div class="k mono">OUTPUT</div><div class="v">${outV}<small>${outU}</small></div></div>
     <div class="rule"></div>
     <div class="cell mini"><div class="k mono">PROMPTS</div><div class="v">${s.prompts}</div></div>
     <div class="cell mini"><div class="k mono">TOOL CALLS</div><div class="v">${s.toolCalls}</div></div>
     <div class="cell mini"><div class="k mono">API EQUIV</div><div class="v">${money(s)}</div></div>
    </div>
   </div>
   <div class="foot mono"><span class="logo">SESH_</span><span>${esc(s.model.toUpperCase())}</span></div>
  </div>
 </div>
</div>
</body></html>`;
}
