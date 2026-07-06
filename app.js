(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Problem categories — defence/dual-use mission areas, matched against
  // data.js records (organization, cluster, program, description) via
  // keyword scoring.
  // ---------------------------------------------------------------------
  const CATEGORIES = [
    { id: 'materials', label: 'Advanced Materials',
      keywords: ['material', 'composite', 'additive', '3d print', 'alloy', 'coating', 'corrosion', 'polymer', 'ceramic', 'metallurg'] },
    { id: 'ai', label: 'AI',
      keywords: ['artificial intelligence', 'machine learning', 'data analytic', 'deep learning', 'neural network', 'computer vision', 'big data', 'algorithm'] },
    { id: 'clean', label: 'Clean Technology',
      keywords: ['clean energy', 'renewable', 'hydro power', 'solar', 'wind energy', 'sustainab', 'carbon', 'green technology', 'emission', 'climate technolog', 'smr'] },
    { id: 'cyber', label: 'Cyber Resilience',
      keywords: ['cyber', 'information security', 'network security', 'threat detection', 'resilien', 'encryption', 'information system'] },
    { id: 'autonomous', label: 'Remote & Autonomous Technologies',
      keywords: ['autonom', 'uncrewed', 'unmanned', 'drone', 'auv', 'uuv', 'uav', 'robot', 'remote sensing', 'remote operat', 'teleoperat', 'glider'] },
    { id: 'space', label: 'Space Systems',
      keywords: ['space', 'satellite', 'orbital', 'ionospher'] },
    { id: 'aerospace', label: 'Aerospace',
      keywords: ['aerospace', 'aircraft', 'aviation', 'flight', 'aerodynamic', 'avionics'] },
    { id: 'eoir', label: 'EO/IR Sensors',
      keywords: ['electro-optic', 'infrared', 'imaging', 'sensor', 'optical sensor', 'thermal imaging', 'camera system'] },
    { id: 'shipborne', label: 'Marine Ship-Borne Mission',
      keywords: ['shipborne', 'mission system', 'naval mission', 'onboard system', 'vessel-based', 'marine operations', 'offshore platform'] },
    { id: 'shipbuilding', label: 'Shipbuilding & Engineering',
      keywords: ['shipbuild', 'naval architecture', 'hull', 'vessel design', 'marine engineering', 'welding', 'fabrication', 'offshore engineering'] },
    { id: 'sonar', label: 'Sonar & Acoustic Systems',
      keywords: ['sonar', 'acoustic', 'hydroacoustic', 'underwater acoustic', 'hydrophone', 'signal processing'] },
    { id: 'training', label: 'Training & Simulation',
      keywords: ['training', 'simulation', 'simulator', 'virtual reality', 'synthetic environment', 'serious game'] },
    { id: 'other', label: 'Other', keywords: [] },
  ];

  const DATA = window.CAPABILITY_DATA || [];
  const MAX_RESULTS_SHOWN = 20;

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    selectedCategories: new Set(),
    openText: '',
    lastResults: [],
    selectedResultIndices: new Set(),
    idlePopupTrigger: false,
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
    if (name === 'results') armResultsIdleTimer(); else disarmResultsIdleTimer();
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

  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const scrollArrowLeft = document.getElementById('scroll-arrow-left');
  const scrollArrowRight = document.getElementById('scroll-arrow-right');

  function updateSelectAllState() {
    const boxes = [...document.querySelectorAll('.result-card input[type="checkbox"]')];
    selectAllCheckbox.checked = boxes.length > 0 && boxes.every(b => b.checked);
  }

  function updateScrollArrows() {
    const list = document.getElementById('results-list');
    const maxScroll = list.scrollWidth - list.clientWidth;
    scrollArrowLeft.hidden = list.scrollLeft <= 4;
    scrollArrowRight.hidden = list.scrollLeft >= maxScroll - 4;
  }

  function renderResults() {
    const list = document.getElementById('results-list');
    const hint = document.getElementById('results-hint');
    list.innerHTML = '';
    list.scrollLeft = 0;
    state.selectedResultIndices.clear();
    selectAllCheckbox.checked = false;
    scrollArrowLeft.hidden = true;
    scrollArrowRight.hidden = true;

    const results = state.lastResults;
    if (!results.length) {
      list.innerHTML = '<p class="no-results">We couldn\'t find an exact match — but our team covers a huge range of labs and expertise across Atlantic Canada. Leave your info below and we\'ll follow up personally.</p>';
      hint.textContent = '';
      return;
    }

    const shown = results.slice(0, MAX_RESULTS_SHOWN);
    hint.textContent = `Showing ${shown.length} of ${results.length} matching capabilities — swipe right for more, tick any you'd like more on.`;

    shown.forEach((r, i) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <input type="checkbox" data-index="${i}" />
        <span class="org">${escapeHTML(r.organization)}</span>
        <h4>${escapeHTML(r.program || r.cluster)}</h4>
        <p class="desc">${escapeHTML((r.description || '').slice(0, 130))}${r.description && r.description.length > 130 ? '…' : ''}</p>
      `;
      const checkbox = card.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedResultIndices.add(i);
        else state.selectedResultIndices.delete(i);
        updateSelectAllState();
      });
      list.appendChild(card);
    });

    // Defer overflow measurement until layout has settled.
    requestAnimationFrame(updateScrollArrows);
  }

  selectAllCheckbox.addEventListener('change', () => {
    const checked = selectAllCheckbox.checked;
    document.querySelectorAll('.result-card input[type="checkbox"]').forEach((box, i) => {
      box.checked = checked;
      if (checked) state.selectedResultIndices.add(i); else state.selectedResultIndices.delete(i);
    });
  });

  const CARD_SCROLL_STEP = 210; // card width (190px) + gap (10px), plus a little extra
  document.getElementById('results-list').addEventListener('scroll', updateScrollArrows, { passive: true });
  scrollArrowLeft.addEventListener('click', () => {
    document.getElementById('results-list').scrollBy({ left: -CARD_SCROLL_STEP, behavior: 'smooth' });
  });
  scrollArrowRight.addEventListener('click', () => {
    document.getElementById('results-list').scrollBy({ left: CARD_SCROLL_STEP, behavior: 'smooth' });
  });

  // ---------------------------------------------------------------------
  // Navigation wiring
  // ---------------------------------------------------------------------
  document.getElementById('btn-start').addEventListener('click', () => showScreen('problem'));

  document.getElementById('btn-back-to-welcome').addEventListener('click', () => showScreen('welcome'));

  document.getElementById('btn-to-results').addEventListener('click', () => {
    state.openText = openQuestionEl.value.trim();
    state.lastResults = computeResults();
    renderResults();
    showScreen('results');
  });

  document.getElementById('btn-back-to-problem').addEventListener('click', () => showScreen('problem'));
  document.getElementById('btn-yes-contact').addEventListener('click', () => {
    state.idlePopupTrigger = false;
    showScreen('contact');
  });
  document.getElementById('btn-back-to-results').addEventListener('click', () => showScreen('results'));

  document.getElementById('btn-home').addEventListener('click', resetKiosk);
  document.getElementById('btn-restart').addEventListener('click', resetKiosk);

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

    const selectedPrograms = [...state.selectedResultIndices]
      .sort((a, b) => a - b)
      .map(i => state.lastResults[i])
      .filter(Boolean)
      .map(r => `${r.organization} – ${r.program || r.cluster}`)
      .join(' | ');

    const lead = {
      timestamp: new Date().toISOString(),
      name, email, organization: org,
      problem_categories: [...state.selectedCategories].map(id => (CATEGORIES.find(c => c.id === id) || {}).label).join('; '),
      problem_details: state.openText,
      request,
      selected_programs: selectedPrograms,
      matched_programs: state.lastResults.slice(0, MAX_RESULTS_SHOWN).map(r => `${r.organization} – ${r.program || r.cluster}`).join(' | '),
      follow_up_trigger: state.idlePopupTrigger ? 'idle_popup' : 'manual',
    };

    const leads = getLeads();
    leads.push(lead);
    saveLeads(leads);

    document.getElementById('thankyou-name').textContent = name.split(' ')[0] || 'friend';
    state.idlePopupTrigger = false;
    showScreen('thankyou');
  });

  function resetKiosk() {
    state.selectedCategories.clear();
    state.openText = '';
    state.lastResults = [];
    state.selectedResultIndices.clear();
    state.idlePopupTrigger = false;
    document.querySelectorAll('.chip.selected').forEach(c => c.classList.remove('selected'));
    openQuestionEl.value = '';
    document.getElementById('contact-form').reset();
    idlePopup.hidden = true;
    showScreen('welcome');
  }

  // ---------------------------------------------------------------------
  // Idle popup — scoped to the recommendations screen only. After ~20s of
  // inactivity while viewing results, offer the full-list/expert-connection
  // CTA. This is a helpful nudge, not a kiosk reset — dismissing just
  // continues browsing.
  // ---------------------------------------------------------------------
  const RESULTS_IDLE_MS = 15000;
  const idlePopup = document.getElementById('idle-popup');
  let resultsIdleTimer = null;

  function armResultsIdleTimer() {
    clearTimeout(resultsIdleTimer);
    resultsIdleTimer = setTimeout(() => {
      if (document.getElementById('screen-results').classList.contains('active')) {
        idlePopup.hidden = false;
      }
    }, RESULTS_IDLE_MS);
  }
  function disarmResultsIdleTimer() {
    clearTimeout(resultsIdleTimer);
    idlePopup.hidden = true;
  }
  document.getElementById('screen-results').addEventListener('click', () => {
    if (idlePopup.hidden) armResultsIdleTimer();
  });

  document.getElementById('btn-idle-dismiss').addEventListener('click', () => {
    idlePopup.hidden = true;
    armResultsIdleTimer();
  });
  document.getElementById('btn-idle-yes').addEventListener('click', () => {
    idlePopup.hidden = true;
    state.idlePopupTrigger = true;
    showScreen('contact');
  });

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
    const cols = ['timestamp', 'name', 'email', 'organization', 'problem_categories', 'problem_details', 'request', 'selected_programs', 'matched_programs', 'follow_up_trigger'];
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
    const cols = ['timestamp', 'name', 'email', 'organization', 'problem_categories', 'problem_details', 'request', 'selected_programs', 'matched_programs', 'follow_up_trigger'];
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
