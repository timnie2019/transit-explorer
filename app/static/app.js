/* transit-explorer — mobile-first station discovery app */

const IS_FILE = window.location.protocol === 'file:';
const DATA_BASE = IS_FILE
  ? window.location.href.replace(/\/[^/]+$/, '/') + '../../data/'
  : '/data/';

async function loadJSON(filename) {
  const r = await fetch(IS_FILE ? DATA_BASE + filename : `/data/${filename}`);
  return r.json();
}

// ── Scoring (mirrors recommender.py) ────────────────────────────────
const CAT_W = { restaurant:1.0, cafe:0.95, attraction:1.1, culture:1.05, park:0.9, shopping:0.85, wellness:0.8 };
function scorePoi(p) {
  if (p.distance_m > 800) return 0;
  const base = p.rating * Math.log10(p.review_count + 1);
  const df = Math.max(0, 1 - (p.distance_m / 800) * 0.4);
  return Math.round(base * df * (CAT_W[p.category] || 1.0) * 1000) / 1000;
}

// ── Category presentation ────────────────────────────────────────────
const CAT_EMOJI = { restaurant:"🍽", cafe:"☕", shopping:"🛍", culture:"🎭", attraction:"🏛", park:"🌿", wellness:"🧘" };
const PRICE_STR = { 0:"Free", 1:"$", 2:"$$", 3:"$$$", 4:"$$$$" };

const BUDGET_DESCS = {
  quick:   "Grab-and-go in under 5 minutes from the station.",
  explore: "Worth a 15–30 min stop. Grab a seat, browse, or take a break.",
  exp:     "Plan ahead — these need an hour or more to do properly.",
};

// ── App state ────────────────────────────────────────────────────────
let POIS = [], STATIONS = [], GO_DATA = {};
let activeStation = 'north_york_centre';
let activeBudget  = 'quick';
let activeGoTab   = 'discover';
let detourOpen    = false;
let savedItems    = new Set();

// ── Boot ─────────────────────────────────────────────────────────────
async function init() {
  try {
    let stData, poiData;
    if (IS_FILE) {
      [stData, poiData, GO_DATA] = await Promise.all([
        loadJSON('stations.json').then(d => d.stations),
        loadJSON('pois.json').then(d => d.pois),
        loadJSON('go_content.json'),
      ]);
    } else {
      [stData, poiData, GO_DATA] = await Promise.all([
        fetch('/api/stations').then(r=>r.json()),
        fetch('/api/pois').then(r=>r.json()).then(d=>d.pois||d),
        fetch('/api/go-content').then(r=>r.json()),
      ]);
    }
    STATIONS = stData;
    POIS = poiData.map(p => ({ ...p, score: scorePoi(p) }));
  } catch(e) {
    console.error('Data load failed:', e);
    STATIONS = FALLBACK_STATIONS;
    POIS = FALLBACK_POIS.map(p => ({ ...p, score: scorePoi(p) }));
    GO_DATA = FALLBACK_GO;
  }

  buildStationChips();
  renderNearby();
  bindNav();
  bindBudget();
  bindGoTabs();
  renderGoList();
  startWaitTimer();
}

// ── Navigation ────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.target;
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('screen-' + t).classList.add('active');
    });
  });
}

// ── Station chips ─────────────────────────────────────────────────────
function buildStationChips() {
  const wrap = document.getElementById('station-chips');
  wrap.innerHTML = STATIONS.map(s =>
    `<button class="s-chip${s.id === activeStation ? ' active' : ''}" data-id="${s.id}">${s.name}</button>`
  ).join('');
  wrap.querySelectorAll('.s-chip').forEach(c => {
    c.addEventListener('click', () => {
      activeStation = c.dataset.id;
      wrap.querySelectorAll('.s-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      updateNearbyHeader();
      renderNearby();
    });
  });
}

function updateNearbyHeader() {
  const st = STATIONS.find(s => s.id === activeStation);
  if (!st) return;
  document.getElementById('nearby-station-name').textContent = st.name;
  document.getElementById('nearby-station-char').textContent = st.character || st.description || '';
}

// ── Budget bar ────────────────────────────────────────────────────────
function bindBudget() {
  document.querySelectorAll('.bud-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBudget = btn.dataset.b;
      document.querySelectorAll('.bud-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderNearby();
    });
  });
}

// ── Nearby list ───────────────────────────────────────────────────────
function renderNearby() {
  updateNearbyHeader();
  document.getElementById('budget-desc-text').textContent = BUDGET_DESCS[activeBudget];

  const filtered = POIS
    .filter(p => p.station_id === activeStation && p.budget === activeBudget)
    .sort((a, b) => b.score - a.score);

  const list = document.getElementById('nearby-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">No spots here for this time budget. Try another tab.</div>`;
    return;
  }
  list.innerHTML = filtered.map(poiCard).join('');
  list.querySelectorAll('.poi-card').forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function poiCard(p) {
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  return `
<div class="poi-card" data-id="${p.id}">
  <div class="poi-icon">${CAT_EMOJI[p.category] || '📌'}</div>
  <div class="poi-body">
    <div class="poi-name">${p.name}</div>
    <div class="poi-meta">
      <span class="poi-rating">${p.rating.toFixed(1)}</span>
      <span class="poi-stars">${stars}</span>
      <span class="poi-reviews">(${p.review_count.toLocaleString()})</span>
      <span class="poi-walk">🚶 ${p.walk_minutes} min</span>
    </div>
    <div class="poi-highlight">${p.highlight || ''}</div>
    <div class="poi-score">Score ${p.score.toFixed(1)}</div>
  </div>
</div>`;
}

// ── Detail sheet ──────────────────────────────────────────────────────
function openDetail(poiId) {
  const p = POIS.find(x => x.id === poiId);
  if (!p) return;
  const stars = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-icon">${CAT_EMOJI[p.category] || '📌'}</div>
    <div class="detail-name">${p.name}</div>
    <div class="detail-sub">${p.subcategory || p.category} · ${PRICE_STR[p.price_level] || ''}</div>
    <div class="detail-rating-row">
      <span class="detail-stars">${stars}</span>
      <span class="detail-rnum">${p.rating.toFixed(1)}</span>
      <span class="detail-rct">${p.review_count.toLocaleString()} reviews</span>
    </div>
    <div class="detail-grid">
      <div class="detail-cell"><div class="detail-cell-label">Walk time</div><div class="detail-cell-val">🚶 ${p.walk_minutes} min</div></div>
      <div class="detail-cell"><div class="detail-cell-label">Distance</div><div class="detail-cell-val">${p.distance_m} m</div></div>
      <div class="detail-cell"><div class="detail-cell-label">Open today</div><div class="detail-cell-val" style="font-size:11px">${p.hours_today || '—'}</div></div>
      <div class="detail-cell"><div class="detail-cell-label">Score</div><div class="detail-cell-val" style="color:var(--ttc)">${p.score.toFixed(2)}</div></div>
    </div>
    ${p.tourist_tip ? `<div class="detail-tip">💡 ${p.tourist_tip}</div>` : ''}
    <div class="detail-tags">${(p.tags||[]).map(t=>`<span class="detail-tag">${t}</span>`).join('')}</div>
    <button class="detail-open-btn" onclick="window.open('${p.google_maps_url}','_blank')">Open in Google Maps ↗</button>
  `;
  document.getElementById('detail-sheet').classList.remove('hidden');
  document.getElementById('sheet-backdrop').classList.remove('hidden');
}

window.closeDetail = function() {
  document.getElementById('detail-sheet').classList.add('hidden');
  document.getElementById('sheet-backdrop').classList.add('hidden');
};

// ── Detour card ───────────────────────────────────────────────────────
window.toggleDetour = function() {
  detourOpen = !detourOpen;
  const expand = document.getElementById('detour-expand');
  const btn    = document.getElementById('dc-toggle-btn');
  if (detourOpen) {
    expand.classList.remove('hidden');
    btn.textContent = 'Hide details ↑';
  } else {
    expand.classList.add('hidden');
    btn.textContent = 'See detour details ↓';
  }
};

// ── GO Transit content ────────────────────────────────────────────────
function bindGoTabs() {
  document.getElementById('go-tabs').querySelectorAll('.go-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeGoTab = btn.dataset.go;
      document.querySelectorAll('.go-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGoList();
    });
  });
}

const GO_TAB_DESCS = {
  discover: 'Preview your destination while you wait.',
  eat:      'What to eat when you arrive at Barrie South GO.',
  shop:     'Support local Barrie businesses — save items for when you arrive.',
};

function renderGoList() {
  document.getElementById('go-tab-desc').textContent = GO_TAB_DESCS[activeGoTab] || '';
  const list = document.getElementById('go-list');
  const data = GO_DATA[activeGoTab] || [];
  if (!data.length) { list.innerHTML = `<div class="empty-state">No content yet.</div>`; return; }

  if (activeGoTab === 'discover') {
    list.innerHTML = data.map(contentCard).join('');
  } else if (activeGoTab === 'eat') {
    list.innerHTML = data.map(eatCard).join('');
  } else {
    list.innerHTML = data.map(shopCard).join('');
  }

  list.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (savedItems.has(id)) {
        savedItems.delete(id);
        btn.textContent = '♡ Save for later';
        btn.classList.remove('saved');
      } else {
        savedItems.add(id);
        btn.textContent = '♥ Saved';
        btn.classList.add('saved');
      }
    });
  });
}

function contentCard(c) {
  const saved = savedItems.has(c.id);
  const typeIcon = c.type === 'video' ? '▶' : '📰';
  return `
<div class="content-card">
  <div class="content-thumb" style="background:${c.accent}22">
    <span style="font-size:36px">${c.accent.startsWith('#1565') ? '🌊' : c.accent.startsWith('#2E7D') ? '🏙' : '🏘'}</span>
    <span class="content-type-badge">${typeIcon} ${c.type}</span>
    <span class="content-duration">${c.duration}</span>
  </div>
  <div class="content-body">
    <div class="content-title">${c.title}</div>
    <div class="content-source">${c.source}</div>
    <div class="content-desc">${c.description}</div>
    <div class="content-tags">${(c.tags||[]).map(t=>`<span class="content-tag">${t}</span>`).join('')}</div>
    <div class="save-row">
      <button class="save-btn${saved?' saved':''}" data-id="${c.id}">${saved?'♥ Saved':'♡ Save for later'}</button>
    </div>
  </div>
</div>`;
}

function eatCard(e) {
  const stars = '★'.repeat(Math.round(e.rating));
  const price = '$'.repeat(e.price);
  return `
<div class="eat-card">
  <div class="eat-icon" style="background:${e.accent}22">${e.cuisine.includes('pub')?'🍺':e.cuisine.includes('Waterfront')?'🐟':'🥐'}</div>
  <div class="eat-body">
    <div class="eat-name">${e.name}</div>
    <div class="eat-meta">
      <span>${stars} ${e.rating.toFixed(1)}</span>
      <span>(${e.reviews.toLocaleString()})</span>
      <span>${price}</span>
      <span class="eat-walk">🚶 ${e.walk_from_go}</span>
    </div>
    <div class="eat-highlight">${e.highlight}</div>
    <div class="eat-meta" style="margin-top:4px;color:var(--hint)">${e.hours}</div>
  </div>
</div>`;
}

function shopCard(s) {
  const saved = savedItems.has(s.id);
  return `
<div class="shop-card">
  <div class="shop-thumb" style="background:${s.accent}22">
    <span style="font-size:28px">${s.accent.startsWith('#4A1')? '🏺': s.accent.startsWith('#3E2')? '☕': '🌲'}</span>
    ${s.promoted ? `<span style="position:absolute;top:8px;right:8px;font-size:9px;background:${s.accent};color:#fff;padding:2px 7px;border-radius:8px;font-weight:700">Promoted</span>` : ''}
  </div>
  <div class="shop-body">
    <div class="shop-name">${s.name}</div>
    <div class="shop-type">${s.type}</div>
    <div class="shop-highlight">${s.highlight}</div>
    <div class="shop-footer">
      <span class="shop-price">${s.price_range}</span>
      <button class="save-btn${saved?' saved':''}" data-id="${s.id}">${saved?'♥ Saved':'♡ Save for later'}</button>
    </div>
  </div>
</div>`;
}

// ── Wait countdown ────────────────────────────────────────────────────
function startWaitTimer() {
  if (!GO_DATA.trip) return;
  let minutes = GO_DATA.trip.wait_minutes;
  const numEl  = document.getElementById('wait-num');
  const fillEl = document.getElementById('wait-fill');
  const total  = minutes;
  setInterval(() => {
    if (minutes > 0) minutes--;
    if (numEl)  numEl.textContent = minutes;
    if (fillEl) fillEl.style.width = Math.round((minutes / total) * 100) + '%';
  }, 60000);
}

// ── Fallback embedded data (if fetch fails) ───────────────────────────
const FALLBACK_STATIONS = [
  { id:'finch',              name:'Finch',              line:'Line 1', lat:43.7807, lng:-79.415,  character:'Korean corridor & multicultural hub',  description:'Dense Korean strip with H-Mart, boba, BBQ.' },
  { id:'north_york_centre',  name:'North York Centre',  line:'Line 1', lat:43.7664, lng:-79.4141, character:'Arts, culture & civic core',            description:'Library, Meridian Arts, Mel Lastman Square.' },
  { id:'sheppard_yonge',     name:'Sheppard-Yonge',     line:'Line 4', lat:43.7615, lng:-79.4099, character:'Subway interchange & commercial hub',  description:'Major interchange, mall, financial offices.' },
];
const FALLBACK_POIS = [
  { id:'p1', name:'Sul & Beans', category:'cafe', subcategory:'Korean Cafe', station_id:'finch', distance_m:65, walk_minutes:1, rating:4.6, review_count:412, price_level:2, hours_today:'8 AM–9 PM', tags:['coffee','bingsoo'], highlight:'Famous for shaved ice and smooth lattes.', tourist_tip:'Try the milk snow bingsoo.', google_maps_url:'https://maps.google.com/?q=Sul+%26+Beans+North+York', budget:'quick' },
  { id:'p2', name:'Chatime', category:'cafe', subcategory:'Bubble Tea', station_id:'finch', distance_m:55, walk_minutes:1, rating:4.1, review_count:389, price_level:1, hours_today:'10 AM–10:30 PM', tags:['bubble tea','boba'], highlight:'Most popular bubble tea in North York.', tourist_tip:'Brown sugar milk tea at 70% sweet.', google_maps_url:'https://maps.google.com/?q=Chatime+Yonge+Finch', budget:'quick' },
  { id:'p3', name:'Mel Lastman Square', category:'attraction', subcategory:'Public Square', station_id:'north_york_centre', distance_m:95, walk_minutes:1, rating:4.3, review_count:1567, price_level:0, hours_today:'Open 24h', tags:['outdoor','free','fountain'], highlight:'North York civic hub with fountain and public art.', tourist_tip:'Farmers market Tuesdays in summer.', google_maps_url:'https://maps.google.com/?q=Mel+Lastman+Square', budget:'quick' },
  { id:'p4', name:'North York Central Library', category:'culture', subcategory:'Library', station_id:'north_york_centre', distance_m:120, walk_minutes:2, rating:4.7, review_count:1893, price_level:0, hours_today:'9 AM–8:30 PM', tags:['library','free','wifi'], highlight:'Flagship branch with art exhibitions and event space.', tourist_tip:'Main floor art gallery is always free.', google_maps_url:'https://maps.google.com/?q=North+York+Central+Library', budget:'exp' },
  { id:'p5', name:'Meridian Arts Centre', category:'culture', subcategory:'Theatre', station_id:'north_york_centre', distance_m:190, walk_minutes:2, rating:4.5, review_count:934, price_level:3, hours_today:'Box office 10 AM–8 PM', tags:['theatre','arts','events'], highlight:'1600-seat theatre — biggest in North York.', tourist_tip:'Day-of rush tickets often half price.', google_maps_url:'https://maps.google.com/?q=Meridian+Arts+Centre+Toronto', budget:'exp' },
];
const FALLBACK_GO = { trip:{ wait_minutes:42, from:'Union Station GO', to:'Barrie South GO', line:'Barrie Line', departure:'3:47 PM', arrival:'5:02 PM', platform:'Platform 7' }, discover:[], eat:[], shop:[] };

init();
