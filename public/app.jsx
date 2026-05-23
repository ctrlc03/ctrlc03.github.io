const { useState, useEffect } = React;
const C = window.PORTFOLIO_CONTENT;
const SITE = window.SITE_META || {};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "ice",
  "scanlines": true,
  "vignette": true,
  "motion": "subtle"
}/*EDITMODE-END*/;

const PALETTE_LABELS = {
  "ice":          "ICE × ORCHID",
  "magenta-cyan": "MAGENTA × CYAN",
  "acid":         "MAGENTA × ACID",
  "amber":        "AMBER × TEAL",
  "violet":       "VIOLET × LIME",
  "crimson":      "CRIMSON × ICE",
};
const PALETTE_OPTIONS = [
  ["#06090f", "#6cf2ff", "#d3b8ff"],
  ["#0a0a12", "#ff2e88", "#00e5ff"],
  ["#0a0a12", "#ff2e88", "#b6ff00"],
  ["#0c0a08", "#ff8a3d", "#4dd6c1"],
  ["#0d0a14", "#c47bff", "#c8ff6b"],
  ["#0c0708", "#ff3a3a", "#8bd7ff"],
];
const PALETTE_KEYS = ["ice", "magenta-cyan", "acid", "amber", "violet", "crimson"];

function applyTweaks(t) {
  document.documentElement.setAttribute("data-theme", t.palette);
  document.documentElement.setAttribute("data-scanlines", t.scanlines ? "1" : "0");
  document.documentElement.setAttribute("data-vignette", t.vignette ? "1" : "0");
  document.documentElement.setAttribute("data-motion", t.motion);
}

function Nav({ route, setRoute, paletteLabel }) {
  const items = [
    ["home", "Index"],
    ["projects", "Work"],
    ["posts", "Notes"],
    ["about", "About"],
    ["resume", "CV"],
  ];
  const time = new Date().toUTCString().slice(17, 25);
  return (
    <nav className="nav">
      <div className="brand" onClick={() => setRoute({ name: "home" })}>
        <div className="brand-mark"></div>
        <div className="brand-name">{SITE.brand || "CTRLC03"}<b>.</b>DEV</div>
      </div>
      <div className="nav-links">
        {items.map(([id, label]) => (
          <div key={id}
               className={"nav-link" + (route.name === id ? " active" : "")}
               onClick={() => setRoute({ name: id })}>{label}</div>
        ))}
      </div>
      <div className="nav-meta"><span className="dot"></span>{paletteLabel} · {time} UTC</div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid">
        <div>
          <div className="hero-label">PROFILE — 014.A / FHE · ZK · MPC</div>
          <h1 className="hero-title">{SITE.name || "ctrlc03"}.<br/><span>{SITE.tagline}</span></h1>
          <p className="hero-sub">{SITE.bio || "Engineer working on zero-knowledge, cryptography, and the seams between humans and the machines they steer."}</p>
          <div className="hero-meta">
            <span><b>Focus</b> · {SITE.focus || "ZK · cryptography · security"}</span>
            <span><b>Based</b> · {SITE.location || "Ethereum"}</span>
          </div>
        </div>
        <aside className="hero-side">
          <div>STATUS<span className="v">// AVAILABLE</span></div>
          <div>STACK<span className="v">RUST · TS · SOLIDITY · NOIR</span></div>
          <div>SIGNAL<span className="v">SCROLL FOR INTEL ↓</span></div>
        </aside>
      </div>
    </section>
  );
}

function ProjectsBlock({ setRoute, limit }) {
  const items = limit ? C.projects.slice(0, limit) : C.projects;
  return (
    <section className="page" style={{ paddingTop: 56 }}>
      <div className="sec-head">
        <span className="sec-num">/02</span>
        <h2 className="sec-title">Selected Work</h2>
        <span className="sec-meta">{items.length} entries</span>
      </div>
      <div className="proj-grid">
        {items.map((p, i) => (
          <div key={p.slug} className="proj" onClick={() => setRoute({ name: "project", slug: p.slug })}>
            <div className="proj-top">
              <span>P/{String(i + 1).padStart(3, "0")}</span>
              <span>{p.year}</span>
            </div>
            <h3 className="proj-name">{p.title}</h3>
            <p className="proj-tag">{p.tag}</p>
            <div className="proj-bottom">
              <div className="proj-tags">{p.tags.map(t => <span key={t}>{t}</span>)}</div>
              <span>OPEN →</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PostsBlock({ setRoute, limit }) {
  const items = limit ? C.posts.slice(0, limit) : C.posts;
  return (
    <section className="page" style={{ paddingTop: 56 }}>
      <div className="sec-head">
        <span className="sec-num">/03</span>
        <h2 className="sec-title">Field Notes</h2>
        <span className="sec-meta">recent first</span>
      </div>
      <div className="posts-list">
        {items.map(p => (
          <div key={p.slug} className="post-row" onClick={() => setRoute({ name: "post", slug: p.slug })}>
            <span className="post-date">{p.date}</span>
            <span className="post-title">{p.title}</span>
            <span className="post-cat">{p.cat}</span>
            <span className="post-read">{p.read}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="page">
      <div className="sec-head">
        <span className="sec-num">/04</span>
        <h2 className="sec-title">About / Now / Stack</h2>
        <span className="sec-meta">{SITE.updated || ""}</span>
      </div>
      <div className="about-grid">
        <div className="about-body" dangerouslySetInnerHTML={{ __html: C.about || "<p>Update <code>SITE_META.aboutHTML</code> in <code>layouts/index.html</code> to fill this in.</p>" }} />
        <aside className="about-side">
          {(C.sidebar || []).map(block => (
            <div className="block" key={block.label}>
              <h4>{block.label}</h4>
              <ul>
                {block.items.map((it, i) => (
                  <li key={i}><b>{it[0]}</b><span>{it[2] ? <a href={it[2]} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>{it[1]}</a> : it[1]}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

function ResumePage() {
  return (
    <section className="page">
      <div className="sec-head">
        <span className="sec-num">/05</span>
        <h2 className="sec-title">Curriculum Vitae</h2>
        <span className="sec-meta">printable</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 60, fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.7 }}>
        {C.cv.map(block => (
          <React.Fragment key={block.label}>
            <div style={{ color: "var(--mag)", letterSpacing: "0.2em", textTransform: "uppercase", fontSize: 10 }}>{block.label}</div>
            <div style={{ color: "var(--fg-2)" }}>
              {block.entries.map((e, i) => (
                <div key={i} style={{ marginBottom: 22, paddingBottom: 22, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--fg)", fontSize: 14, fontWeight: 500 }}>
                    <span>{e.title}</span><span style={{ color: "var(--fg-3)" }}>{e.when}</span>
                  </div>
                  {e.where && <div style={{ color: "var(--cyan)", fontSize: 12, marginTop: 4 }}>{e.where}</div>}
                  {e.body && (/^https?:\/\//.test(e.body)
                    ? <div style={{ marginTop: 8 }}><a href={e.body} target="_blank" rel="noopener" style={{ color: "var(--mag)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em", borderBottom: "1px solid rgba(var(--mag-rgb),0.4)" }}>→ {e.body.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></div>
                    : <div style={{ marginTop: 8, color: "var(--fg-2)" }}>{e.body}</div>)}
                </div>
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function ProjectDetail({ slug, setRoute }) {
  const p = C.projects.find(x => x.slug === slug) || C.projects[0];
  return (
    <article>
      <header className="detail-head">
        <div className="back-btn" onClick={() => setRoute({ name: "projects" })}>← back to work index</div>
        <h1 className="detail-title">{p.title}</h1>
        <p className="detail-tag">{p.tag}</p>
        <div className="detail-meta">
          <div><b>YEAR</b><span>{p.year}</span></div>
          <div><b>ROLE</b><span>{p.role || "—"}</span></div>
          <div><b>STACK</b><span>{p.tags.join(" · ")}</span></div>
          <div><b>STATUS</b><span>{p.status || "—"}</span></div>
        </div>
      </header>
      <div className="detail-body">
        <div>
          <h3>Notes</h3>
          <p>{p.body || "Placeholder — fill in projects in layouts/index.html."}</p>
          {p.link && <p><a href={p.link} target="_blank" rel="noopener" style={{ color: "var(--cyan)" }}>→ {p.link}</a></p>}
        </div>
        <aside style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-3)", borderLeft: "1px solid var(--line)", paddingLeft: 24 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: "var(--mag)", letterSpacing: "0.2em", fontSize: 10, marginBottom: 10 }}>RELATED</div>
            {C.projects.filter(x => x.slug !== p.slug).slice(0, 3).map(r => (
              <div key={r.slug} onClick={() => setRoute({ name: "project", slug: r.slug })}
                   style={{ padding: "10px 0", borderBottom: "1px dashed var(--line)", cursor: "pointer", color: "var(--fg-2)" }}>
                → {r.title}
              </div>
            ))}
          </div>
          <div style={{ color: "var(--cyan)", letterSpacing: "0.15em", fontSize: 10 }}>
            ARTIFACT — {p.slug.toUpperCase()}.{p.year}<br/>
            CLEARANCE — PUBLIC
          </div>
        </aside>
      </div>
    </article>
  );
}

function PostDetail({ slug, setRoute }) {
  const p = C.posts.find(x => x.slug === slug) || C.posts[0];
  if (!p) return <section className="page"><p>Post not found.</p></section>;
  return (
    <article>
      <header className="detail-head">
        <div className="back-btn" onClick={() => setRoute({ name: "posts" })}>← back to notes</div>
        <h1 className="detail-title" style={{ fontSize: 64 }}>{p.title}</h1>
        {p.summary && <p className="detail-tag">{p.summary}</p>}
        <div className="detail-meta">
          <div><b>DATE</b><span>{p.date}</span></div>
          <div><b>CATEGORY</b><span>{p.cat}</span></div>
          <div><b>READ</b><span>{p.read}</span></div>
        </div>
      </header>
      <div className="detail-body">
        <div className="post-body" dangerouslySetInnerHTML={{ __html: p.body || "<p>(empty)</p>" }} />
        <aside style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-3)", borderLeft: "1px solid var(--line)", paddingLeft: 24 }}>
          <div style={{ color: "var(--mag)", letterSpacing: "0.2em", fontSize: 10, marginBottom: 10 }}>OTHER NOTES</div>
          {C.posts.filter(x => x.slug !== p.slug).slice(0, 5).map(r => (
            <div key={r.slug} onClick={() => setRoute({ name: "post", slug: r.slug })}
                 style={{ padding: "10px 0", borderBottom: "1px dashed var(--line)", cursor: "pointer", color: "var(--fg-2)" }}>
              → {r.title}
            </div>
          ))}
        </aside>
      </div>
    </article>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div>© 2026 — {SITE.brand || "CTRLC03"} / NO RIGHTS RESERVED</div>
      <div className="foot-links">
        {(SITE.links || []).map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noopener">{label}</a>
        ))}
      </div>
      <div>BUILD · NEON-NOIR</div>
    </footer>
  );
}

function App() {
  const initial = window.INITIAL_ROUTE || { name: "home" };
  const [route, setRoute] = useState(initial);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  useEffect(() => { applyTweaks(t); }, [t]);

  const paletteIdx = (() => {
    if (typeof t.palette === "string") return PALETTE_KEYS.indexOf(t.palette);
    return -1;
  })();
  const paletteKey = paletteIdx >= 0 ? PALETTE_KEYS[paletteIdx] : (t.palette || "ice");

  return (
    <div className="app">
      <Nav route={route} setRoute={setRoute} paletteLabel={PALETTE_LABELS[paletteKey] || "CUSTOM"} />
      {route.name === "home" && (
        <>
          <Hero />
          <ProjectsBlock setRoute={setRoute} limit={4} />
          <PostsBlock setRoute={setRoute} limit={4} />
        </>
      )}
      {route.name === "projects" && <ProjectsBlock setRoute={setRoute} />}
      {route.name === "project" && <ProjectDetail slug={route.slug} setRoute={setRoute} />}
      {route.name === "posts" && <PostsBlock setRoute={setRoute} />}
      {route.name === "post" && <PostDetail slug={route.slug} setRoute={setRoute} />}
      {route.name === "about" && <About />}
      {route.name === "resume" && <ResumePage />}
      <Footer />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Palette">
          <TweakColor
            label="Accents"
            value={PALETTE_OPTIONS[Math.max(0, PALETTE_KEYS.indexOf(paletteKey))]}
            options={PALETTE_OPTIONS}
            onChange={(v) => {
              const idx = PALETTE_OPTIONS.findIndex(o => o[0] === v[0] && o[1] === v[1] && o[2] === v[2]);
              if (idx >= 0) setTweak("palette", PALETTE_KEYS[idx]);
            }}
          />
        </TweakSection>
        <TweakSection label="Effects">
          <TweakToggle label="Scanlines"   value={t.scanlines} onChange={(v) => setTweak("scanlines", v)} />
          <TweakToggle label="CRT vignette" value={t.vignette}  onChange={(v) => setTweak("vignette", v)} />
          <TweakRadio
            label="Motion"
            value={t.motion}
            options={[
              { value: "off",    label: "Off" },
              { value: "subtle", label: "Subtle" },
              { value: "heavy",  label: "Heavy" },
            ]}
            onChange={(v) => setTweak("motion", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
