(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Problem categories — framed around defence/industry mission areas
  // (drawn from the Defence Brief) rather than raw academic cluster labels,
  // then matched against data.js records via keyword scoring.
  // ---------------------------------------------------------------------
  const CATEGORIES = [
    { id: 'maritime', label: 'Maritime & Naval / Shipbuilding',
      keywords: ['ship', 'naval', 'marine', 'vessel', 'submarine', 'offshore', 'hull', 'maritime', 'ocean engineering', 'fleet'] },
    { id: 'autonomous', label: 'Autonomous & Uncrewed Systems',
      keywords: ['autonom', 'uncrewed', 'unmanned', 'drone', 'auv', 'uuv', 'uav', 'robot', 'glider'] },
    { id: 'surveillance', label: 'Domain Awareness & Surveillance',
      keywords: ['surveillance', 'sonar', 'acoustic', 'radar', 'awareness', 'tracking', 'monitoring', 'sensor', 'detection', 'imaging'] },
    { id: 'arctic', label: 'Arctic Operations & Search and Rescue',
      keywords: ['arctic', 'ice', 'cold climate', 'search and rescue', 'northern', 'polar', 'winter'] },
    { id: 'cyber', label: 'Cybersecurity, Data & AI',
      keywords: ['cyber', 'security', 'data analytic', 'artificial intelligence', ' ai ', 'machine learning', 'information system', 'digital', 'software'] },
    { id: 'materials', label: 'Advanced Materials & Manufacturing',
      keywords: ['material', 'manufactur', 'composite', 'additive', '3d print', 'welding', 'automation', 'fabrication', 'prototyp'] },
    { id: 'energy', label: 'Energy Systems & Clean Technology',
      keywords: ['energy', 'nuclear', 'smr', 'power', 'renewable', 'clean tech', 'hydro', 'electric', 'sustainab'] },
    { id: 'health', label: 'Human Performance, Health & Wellness',
      keywords: ['health', 'wellness', 'nutrition', 'biomechanic', 'rehabilitation', 'human performance', 'psycholog', 'kinesiology'] },
    { id: 'policy', label: 'Policy, Security Studies & Training',
      keywords: ['polic', 'security stud', 'international security', 'defence stud', 'training', 'heritage', 'history', 'community'] },
    { id: 'testing', label: 'Testing & Prototype Products',
      keywords: ['test', 'prototyp', 'pilot', 'trial', 'demonstrat', 'validat', 'proof of concept'] },
    { id: 'rd', label: 'R&D Collaboration',
      keywords: ['collaborat', 'partnership', 'r&d', 'research and development', 'joint research', 'co-development'] },
    { id: 'ip', label: 'Intellectual Property',
      keywords: ['intellectual property', 'patent', 'licens', 'commercializ', 'technology transfer'] },
    { id: 'ops', label: 'Operations Optimization',
      keywords: ['operation', 'optimiz', 'efficiency', 'process improvement', 'productivity', 'supply chain', 'logistics'] },
    { id: 'other', label: 'Something else / Not sure yet', keywords: [] },
  ];

  const DATA = window.CAPABILITY_DATA || [];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    selectedCategories: new Set(),
    openText: '',
    lastResults: [],
    resultsShown: 6,
    contact: null,
  };

  const LEADS_KEY = 'sba_kiosk_leads_v1';

  // ---------------------------------------------------------------------
  // Screen navigation
  // ---------------------------------------------------------------------
  const screens = ['welcome', 'problem', 'results', 'contact', 'thankyou'];
  const progressEl = document.getElementById('progress');

  function showScreen(name) {
    screens.forEach(s => {
      document.getElementById('screen-' + s).classList.toggle('active', s === name);
    });
    if (name === 'welcome' || name === 'thankyou') {
      progressEl.hidden = true;
    } else {
      progressEl.hidden = false;
      const stepMap = { problem: 1, results: 2, contact: 3 };
      const step = stepMap[name] || 1;
      progressEl.querySelectorAll('.dot').forEach(d => {
        d.classList.toggle('active', Number(d.dataset.step) <= step);
      });
    }
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------------
  // Screen: Problem — render category chips
  // ---------------------------------------------------------------------
  const chipGrid = document.getElementById('category-chips');
  CATEGORIES.forEach(cat => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = cat.label;
    chip.dataset.id = cat.id;
    chip.addEventListener('click', () => {
      if (state.selectedCategories.has(cat.id)) {
        state.selectedCategories.delete(cat.id);
        chip.classList.remove('selected');
      } else {
        state.selectedCategories.add(cat.id);
        chip.classList.add('selected');
      }
    });
    chipGrid.appendChild(chip);
  });

  const openQuestionEl = document.getElementById('open-question');

  // ---------------------------------------------------------------------
  // Matching engine
  // ---------------------------------------------------------------------
  const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'have',
    'was', 'were', 'will', 'your', 'you', 'our', 'all', 'can', 'has', 'been', 'into', 'more',
    'than', 'when', 'what', 'who', 'why', 'how', 'not', 'but', 'use', 'using', 'based', 'need',
    'needs', 'want', 'looking', 'solve', 'problem', 'about', 'some', 'they', 'them', 'their',
    'there', 'these', 'those', 'would', 'could', 'should', 'also', 'just', 'like', 'help', 'way']);

  function tokenize(text) {
    return (text || '')
      .toLowerCase()
      .split(/[^a-z0-9&]+/)
      .filter(w => w.length > 3 && !STOPWORDS.has(w));
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Single-word keywords use a leading word-boundary so "ship" matches
  // "shipbuilding" but not "membership"/"leadership"; multi-word phrases
  // are matched as plain substrings.
  function keywordMatches(keyword, haystack) {
    const kw = keyword.trim();
    if (/\s/.test(kw)) return haystack.includes(kw.toLowerCase());
    return new RegExp('\\b' + escapeRegex(kw.toLowerCase())).test(haystack);
  }

  function scoreRecord(record, activeKeywords, freeTextTokens) {
    const haystack = [record.organization, record.cluster, record.program, record.description]
      .join(' ')
      .toLowerCase();
    let score = 0;
    activeKeywords.forEach(kw => {
      if (keywordMatches(kw, haystack)) score += 3;
    });
    freeTextTokens.forEach(tok => {
      if (keywordMatches(tok, haystack)) score += 1;
    });
    return score;
  }

  function computeResults() {
    const activeKeywords = [];
    state.selectedCategories.forEach(id => {
      const cat = CATEGORIES.find(c => c.id === id);
      if (cat) activeKeywords.push(...cat.keywords);
    });
    const freeTextTokens = tokenize(state.openText);

    let scored = DATA.map(r => ({ record: r, score: scoreRecord(r, activeKeywords, freeTextTokens) }));

    const noSignal = activeKeywords.length === 0 && freeTextTokens.length === 0;
    if (noSignal) {
      // no info given — just show a broad sample
      scored.sort(() => Math.random() - 0.5);
    } else {
      scored = scored.filter(s => s.score > 0);
      scored.sort((a, b) => b.score - a.score);
    }
    return scored.map(s => s.record);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function renderResults() {
    const grid = document.getElementById('results-grid');
    const hint = document.getElementById('results-hint');
    const moreBtn = document.getElementById('btn-more-results');
    grid.innerHTML = '';

    const results = state.lastResults;
    if (!results.length) {
      grid.innerHTML = '<p class="no-results">We couldn\'t find an exact match — but our team covers a huge range of labs and expertise across Atlantic Canada. Leave your info below and we\'ll follow up personally.</p>';
      hint.textContent = '';
      moreBtn.hidden = true;
      return;
    }

    hint.textContent = `Showing ${Math.min(state.resultsShown, results.length)} of ${results.length} matching capabilities.`;

    results.slice(0, state.resultsShown).forEach(r => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <span class="org">${escapeHTML(r.organization)}</span>
        <h4>${escapeHTML(r.program || r.cluster)}</h4>
        ${r.cluster ? `<span class="cluster-tag">${escapeHTML(r.cluster)}</span>` : ''}
        <p class="desc">${escapeHTML((r.description || '').slice(0, 220))}${r.description && r.description.length > 220 ? '…' : ''}</p>
        ${r.link ? `<a class="learn-more" href="${escapeHTML(r.link)}" target="_blank" rel="noopener">Learn more →</a>` : ''}
      `;
      grid.appendChild(card);
    });

    moreBtn.hidden = state.resultsShown >= results.length;
  }

  document.getElementById('btn-more-results').addEventListener('click', () => {
    state.resultsShown += 6;
    renderResults();
  });

  // ---------------------------------------------------------------------
  // Navigation wiring
  // ---------------------------------------------------------------------
  document.getElementById('btn-start').addEventListener('click', () => showScreen('problem'));

  document.getElementById('btn-back-to-welcome').addEventListener('click', () => showScreen('welcome'));

  document.getElementById('btn-to-results').addEventListener('click', () => {
    state.openText = openQuestionEl.value.trim();
    state.resultsShown = 6;
    state.lastResults = computeResults();
    renderResults();
    showScreen('results');
  });

  document.getElementById('btn-back-to-problem').addEventListener('click', () => showScreen('problem'));

  document.getElementById('btn-no-thanks').addEventListener('click', () => {
    resetKiosk();
  });

  document.getElementById('btn-yes-contact').addEventListener('click', () => showScreen('contact'));
  document.getElementById('btn-back-to-results').addEventListener('click', () => showScreen('results'));

  // ---------------------------------------------------------------------
  // Contact form + lead storage
  // ---------------------------------------------------------------------
  function getLeads() {
    try {
      return JSON.parse(localStorage.getItem(LEADS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function saveLeads(leads) {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  }

  document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('c-name').value.trim();
    const email = document.getElementById('c-email').value.trim();
    const org = document.getElementById('c-org').value.trim();
    const request = document.getElementById('c-request').value.trim();

    const lead = {
      timestamp: new Date().toISOString(),
      name, email, organization: org,
      problem_categories: [...state.selectedCategories].map(id => (CATEGORIES.find(c => c.id === id) || {}).label).join('; '),
      problem_details: state.openText,
      request,
      matched_programs: state.lastResults.slice(0, 6).map(r => `${r.organization} – ${r.program || r.cluster}`).join(' | '),
    };

    const leads = getLeads();
    leads.push(lead);
    saveLeads(leads);

    document.getElementById('thankyou-name').textContent = name.split(' ')[0] || 'friend';
    showScreen('thankyou');
  });

  document.getElementById('btn-restart').addEventListener('click', resetKiosk);

  function resetKiosk() {
    state.selectedCategories.clear();
    state.openText = '';
    state.lastResults = [];
    state.resultsShown = 6;
    document.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
    openQuestionEl.value = '';
    document.getElementById('contact-form').reset();
    showScreen('welcome');
  }

  // ---------------------------------------------------------------------
  // Idle timeout — auto-reset kiosk to welcome after inactivity
  // ---------------------------------------------------------------------
  const IDLE_WARN_MS = 45000; // show overlay after 45s idle (skip on welcome/thankyou)
  let idleTimer = null;
  const idleOverlay = document.getElementById('idle-overlay');

  function armIdleTimer() {
    clearTimeout(idleTimer);
    const activeScreen = screens.find(s => document.getElementById('screen-' + s).classList.contains('active'));
    if (activeScreen === 'welcome' || activeScreen === 'thankyou') return;
    idleTimer = setTimeout(() => { idleOverlay.hidden = false; }, IDLE_WARN_MS);
  }
  idleOverlay.addEventListener('click', () => {
    idleOverlay.hidden = true;
    resetKiosk();
  });
  ['click', 'keydown', 'touchstart', 'input'].forEach(evt => {
    document.addEventListener(evt, () => {
      if (!idleOverlay.hidden) return;
      armIdleTimer();
    });
  });
  armIdleTimer();

  // ---------------------------------------------------------------------
  // Admin panel — hidden lead export. Open with ?admin=1 in the URL,
  // or by tapping the footer text 5 times in a row.
  // ---------------------------------------------------------------------
  const adminPanel = document.getElementById('admin-panel');

  function csvEscape(val) {
    const s = String(val == null ? '' : val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function renderAdmin() {
    const leads = getLeads();
    document.getElementById('admin-count').textContent = `${leads.length} lead(s) captured on this device.`;
    const table = document.getElementById('admin-table');
    if (!leads.length) { table.innerHTML = ''; return; }
    const cols = ['timestamp', 'name', 'email', 'organization', 'problem_categories', 'problem_details', 'request', 'matched_programs'];
    let html = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
    leads.slice().reverse().forEach(l => {
      html += '<tr>' + cols.map(c => `<td>${escapeHTML((l[c] || '').toString().slice(0, 60))}</td>`).join('') + '</tr>';
    });
    table.innerHTML = html;
  }

  function openAdmin() {
    renderAdmin();
    adminPanel.hidden = false;
  }

  document.getElementById('btn-close-admin').addEventListener('click', () => { adminPanel.hidden = true; });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const leads = getLeads();
    const cols = ['timestamp', 'name', 'email', 'organization', 'problem_categories', 'problem_details', 'request', 'matched_programs'];
    const rows = [cols.join(',')].concat(
      leads.map(l => cols.map(c => csvEscape(l[c])).join(','))
    );
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `springboard-atlantic-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-clear-leads').addEventListener('click', () => {
    if (confirm('Delete all captured leads on this device? This cannot be undone.')) {
      localStorage.removeItem(LEADS_KEY);
      renderAdmin();
    }
  });

  if (new URLSearchParams(location.search).get('admin') === '1') {
    openAdmin();
  }

  let footerTapCount = 0;
  let footerTapTimer = null;
  document.getElementById('brand-footer').addEventListener('click', () => {
    footerTapCount += 1;
    clearTimeout(footerTapTimer);
    footerTapTimer = setTimeout(() => { footerTapCount = 0; }, 1200);
    if (footerTapCount >= 5) {
      footerTapCount = 0;
      openAdmin();
    }
  });

  showScreen('welcome');
})();
