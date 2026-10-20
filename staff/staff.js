/* Billy staff dashboard.
 *
 * Signs in with the same Discord session as the Control Room (same site, same
 * stored token), then asks Billy who is looking. Every tab is also checked by
 * Billy on every request: hiding a tab here is a convenience, never the lock.
 * Everything Billy sends back is shown with textContent, never as HTML.
 */
(function () {
  'use strict';

  const apiBase = String(window.BILLY_DASHBOARD_API_URL || '').replace(/\/$/, '');
  const TOKEN_KEY = 'billy_dashboard_token';
  const TABS = ['servers', 'reports', 'applications', 'plans', 'global', 'staff', 'announce'];
  const state = { me: null, can: {}, servers: [], serverId: '', reports: {}, reportKind: 'errors',
                  applications: [], loaded: {}, loadedAt: {} };

  /* ---- Session ------------------------------------------------------------- */
  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }
  function storeToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) {}
  }
  function forgetToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    token = '';
  }
  let token = readToken();
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.get('auth_token')) {
    token = fragment.get('auth_token');
    storeToken(token);
    history.replaceState(null, '', location.pathname + location.search + '#servers');
  }

  async function api(path, options) {
    options = options || {};
    if (!apiBase) throw Object.assign(new Error('Billy’s API address is not set.'), { status: 0 });
    const request = { method: options.method || 'GET', headers: { Authorization: 'Bearer ' + token } };
    if (options.body !== undefined) {
      request.headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }
    let response;
    try { response = await fetch(apiBase + path, request); }
    catch (e) { throw Object.assign(new Error('Could not reach Billy. He may be restarting.'), { status: 0 }); }
    const renewed = response.headers.get('X-Billy-Session');
    if (renewed && renewed !== token) { token = renewed; storeToken(renewed); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || ('Billy answered HTTP ' + response.status + '.'));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function explain(error) {
    const status = error && error.status;
    if (status === 401) return 'Your sign-in expired. Sign in with Discord again.';
    if (status === 403) return error.message || 'Your staff rank does not allow that.';
    if (status === 404) return error.message || 'Billy does not have that (he may be running an older version).';
    if (status >= 500) return 'Billy hit an error (HTTP ' + status + '). It is in his log.';
    return (error && error.message) || 'Something went wrong.';
  }

  /* ---- Small helpers ------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key === 'on') Object.entries(value).forEach(([ev, fn]) => node.addEventListener(ev, fn));
      else node.setAttribute(key, value === true ? '' : value);
    });
    (children || []).forEach((child) => { if (child) node.append(child); });
    return node;
  }
  function fmtNumber(value) { return Number(value || 0).toLocaleString(); }
  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return isNaN(date) ? String(value).slice(0, 10) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtWhen(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date)) return String(value).slice(0, 16);
    const seconds = (Date.now() - date.getTime()) / 1000;
    if (seconds < 90) return 'just now';
    if (seconds < 3600) return Math.round(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.round(seconds / 3600) + ' h ago';
    const days = Math.round(seconds / 86400);
    if (days < 14) return days + (days === 1 ? ' day ago' : ' days ago');
    return fmtDate(value);
  }
  function initial(name) {
    return el('span', { class: 'staff-initial', 'aria-hidden': 'true', text: (String(name || '?').trim()[0] || '?').toUpperCase() });
  }
  function chip(text, tone) { return el('span', { class: 'chip' + (tone ? ' ' + tone : ''), text: text }); }
  function planLabel(tier) {
    return { free: 'Free', premium: 'Premium', ultimate: 'Ultimate', infinity: 'Infinity' }[tier] || (tier || 'Free');
  }
  function panel(title, subtitle, body) {
    return el('article', { class: 'panel' }, [
      el('header', { class: 'panel-head' }, [el('div', {}, [el('h2', { text: title }), subtitle ? el('span', { text: subtitle }) : null])]),
      el('div', { class: 'panel-body' }, body),
    ]);
  }
  function empty(text) { return el('p', { class: 'staff-empty', text: text }); }
  let toastTimer;
  function toast(message, bad) {
    const node = $('staffToast');
    node.textContent = message;
    node.style.borderLeftColor = bad ? 'var(--red)' : 'var(--green)';
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 4200);
  }
  function setStatus(id, text, tone) {
    const node = $(id);
    node.className = 'mod-status' + (tone ? ' ' + tone : '');
    node.textContent = text || '';
  }

  /* ---- Gate: signed out, not staff, or Billy unreachable --------------------- */
  function showGate(title, text, withLogin) {
    $('gateTitle').textContent = title;
    $('gateText').textContent = text;
    const login = $('gateLogin');
    login.hidden = !withLogin;
    if (withLogin) login.href = apiBase + '/api/oauth/login?next=staff';
    $('staffGate').hidden = false;
    $('staffTabs').hidden = true;
    TABS.forEach((tab) => { $('view-' + tab).hidden = true; });
  }

  async function boot() {
    if (!apiBase) return showGate('Billy staff', 'This copy of the site does not know where Billy is running.', false);
    if (!token) return showGate('Billy staff', 'Sign in with the Discord account that holds your Billy staff rank.', true);
    let data;
    try { data = await api('/api/staff/me'); }
    catch (error) {
      if (error.status === 401) { forgetToken(); return showGate('Billy staff', 'Your sign-in expired. Sign in with Discord again.', true); }
      if (error.status === 403) return showGate('Staff only', 'This page is for Billy’s own staff, and your account is not on the staff list. Server tools are in the Control Room.', false);
      return showGate('Billy staff', explain(error), false);
    }
    state.me = data.you;
    state.can = data.can || {};
    const rank = $('staffRank');
    rank.textContent = data.you.rank_label || 'Staff';
    rank.hidden = false;
    const avatar = $('staffAvatar');
    avatar.textContent = (data.you.username || '?').slice(0, 1).toUpperCase();
    if (data.you.avatar && /^\d+$/.test(data.you.user_id)) {
      avatar.textContent = '';
      avatar.append(el('img', { src: 'https://cdn.discordapp.com/avatars/' + data.you.user_id + '/' + data.you.avatar + '.png?size=64', alt: '' }));
    }
    document.querySelectorAll('#staffTabs button').forEach((button) => {
      button.hidden = !state.can[button.dataset.tab];
      button.addEventListener('click', () => openTab(button.dataset.tab));
    });
    $('staffGate').hidden = true;
    $('staffTabs').hidden = false;
    const wanted = location.hash.slice(1);
    openTab(TABS.includes(wanted) && state.can[wanted] ? wanted : 'servers');
  }

  function openTab(tab) {
    document.querySelectorAll('#staffTabs button').forEach((button) => button.classList.toggle('on', button.dataset.tab === tab));
    TABS.forEach((name) => { $('view-' + name).hidden = name !== tab; });
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
    // Loaded the first time, and again when it has been a minute.
    const stale = !state.loaded[tab] || Date.now() - (state.loadedAt[tab] || 0) > 60000;
    if (stale) {
      state.loaded[tab] = true;
      state.loadedAt[tab] = Date.now();
      ({ servers: loadServers, reports: () => loadReports(state.reportKind), applications: loadApplications,
         plans: loadPlans, global: loadGlobal, staff: loadStaff, announce: loadUpdates })[tab]();
    }
  }

  /* ---- Servers ---------------------------------------------------------------- */
  async function loadServers() {
    try {
      const data = await api('/api/staff/servers');
      state.servers = data.servers || [];
      renderServerList();
      if (state.serverId) loadServer(state.serverId);
    } catch (error) {
      $('serverList').replaceChildren(empty(explain(error)));
    }
  }

  function renderServerList() {
    const needle = $('serverSearch').value.trim().toLowerCase();
    const shown = state.servers.filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.id.includes(needle));
    $('serverCount').textContent = shown.length + ' of ' + state.servers.length;
    const list = $('serverList');
    if (!shown.length) return list.replaceChildren(empty(needle ? 'No server matches that.' : 'Billy is not in any server.'));
    list.replaceChildren(...shown.map((server) => el('button', {
      type: 'button', class: 'staff-item' + (server.id === state.serverId ? ' on' : ''),
      on: { click: () => loadServer(server.id) },
    }, [
      server.icon ? el('img', { src: server.icon, alt: '' }) : initial(server.name),
      el('span', {}, [el('b', { text: server.name }), el('small', { text: fmtNumber(server.members) + ' members · ' + planLabel(server.tier) })]),
      el('span', { class: 'staff-badges' }, [
        server.problems ? chip(String(server.problems), 'red') : null,
        server.ai_paused ? chip('AI off', 'amber') : null,
      ]),
    ])));
  }
  $('serverSearch').addEventListener('input', renderServerList);

  async function loadServer(id) {
    state.serverId = id;
    renderServerList();
    const detail = $('serverDetail');
    detail.replaceChildren(el('div', { class: 'staff-placeholder', text: 'Loading…' }));
    let data;
    try { data = await api('/api/staff/servers/' + id); }
    catch (error) { return detail.replaceChildren(el('div', { class: 'staff-placeholder', text: explain(error) })); }
    const server = data.server;

    const join = el('button', { type: 'button', class: 'button', text: 'Join to help',
      title: 'Billy makes a ten-minute, single-use invite. That server’s audit log shows he made it.' });
    join.addEventListener('click', async () => {
      join.disabled = true;
      try {
        const result = await api('/api/moderator/servers/' + id + '/invite', { method: 'POST' });
        window.open(result.url, '_blank', 'noopener');
        toast(result.message || 'Invite opened.');
      } catch (error) { toast(explain(error), true); }
      setTimeout(() => { join.disabled = false; }, 4000);
    });
    let aiButton = null;
    if (state.can.server_ai) {
      aiButton = el('button', { type: 'button', class: 'button' + (server.ai_paused ? ' primary' : ''),
        text: server.ai_paused ? 'Resume AI replies' : 'Pause AI replies' });
      aiButton.addEventListener('click', async () => {
        const pausing = !server.ai_paused;
        if (pausing && !window.confirm('Pause Billy’s AI replies in ' + server.name + '? Moderation, logs and memory keep running.')) return;
        aiButton.disabled = true;
        try {
          const result = await api('/api/staff/servers/' + id + '/ai', { method: 'POST', body: { paused: pausing } });
          toast(result.message);
          state.loaded.servers = false;
          loadServers();
        } catch (error) { toast(explain(error), true); aiButton.disabled = false; }
      });
    }

    const facts = [
      ['Members', fmtNumber(server.members)], ['Channels', fmtNumber(server.channels)],
      ['Roles', fmtNumber(server.roles)], ['Plan', planLabel(server.tier)],
      ['AI calls, 7 days', fmtNumber(data.ai_calls_7d)], ['Knowledge sources', fmtNumber(data.knowledge_sources)],
    ];
    const problems = (data.problems || []).length
      ? data.problems.map((p) => el('div', { class: 'staff-problem ' + p.severity }, [
          el('b', { text: p.title }), el('span', { text: p.detail }), p.fix ? el('em', { text: 'Fix: ' + p.fix }) : null]))
      : [empty('Nothing broken. Every saved channel exists and Billy has the permissions he needs.')];
    const errors = (data.errors || []).length
      ? [el('div', { class: 'table-wrap' }, [el('table', { class: 'table' }, [
          el('thead', {}, [el('tr', {}, ['Command', 'What happened', 'Times', 'Last'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, data.errors.map((e) => el('tr', {}, [
            el('td', { text: '/' + (e.command || '?') }), el('td', { text: e.message || e.kind }),
            el('td', { text: String(e.occurrences) }), el('td', { text: fmtWhen(e.last_seen) })]))),
        ])])]
      : [empty('No command errors recorded here.')];

    detail.replaceChildren(
      el('div', { class: 'staff-detail-head' }, [
        server.icon ? el('img', { src: server.icon, alt: '' }) : initial(server.name),
        el('div', {}, [el('h1', { text: server.name }),
          el('p', { text: 'Owner ' + (server.owner_name || server.owner_id || 'unknown') + ' · Billy joined ' + fmtDate(server.joined_at) })]),
        el('div', { class: 'staff-actions' }, [join, aiButton]),
      ]),
      el('div', { class: 'staff-facts' }, facts.map(([label, value]) => el('div', {}, [el('b', { text: value }), el('span', { text: label })]))),
      panel('Needs attention', 'Saved channels that are gone or closed to Billy, and missing permissions', problems),
      panel('Recent command errors', 'What went wrong for members here, newest first', errors),
    );
  }

  /* ---- Reports ------------------------------------------------------------------- */
  document.querySelectorAll('#reportKinds button').forEach((button) => {
    button.addEventListener('click', () => {
      state.reportKind = button.dataset.kind;
      document.querySelectorAll('#reportKinds button').forEach((b) => b.classList.toggle('on', b === button));
      loadReports(button.dataset.kind);
    });
  });

  async function loadReports(kind) {
    const list = $('reportList');
    list.replaceChildren(empty('Loading…'));
    $('reportDetail').replaceChildren(el('div', { class: 'staff-placeholder', text: 'Pick a report to read it in full. Counts are for the last 7 days.' }));
    let data;
    try { data = await api('/api/staff/reports?kind=' + encodeURIComponent(kind)); }
    catch (error) { return list.replaceChildren(empty(explain(error))); }
    document.querySelectorAll('#reportKinds button').forEach((b) => {
      b.querySelector('b').textContent = String((data.counts_7d || {})[b.dataset.kind] || 0);
    });
    const items = data.items || [];
    if (!items.length) return list.replaceChildren(empty('Nothing here. That is the good outcome.'));
    list.replaceChildren(...items.map((item) => {
      const button = el('button', { type: 'button', class: 'staff-item no-icon' }, [
        el('span', {}, [el('b', { text: item.title }), el('small', { text: item.guild + ' · ' + fmtWhen(item.at) })]),
        el('span'),
      ]);
      button.addEventListener('click', () => {
        list.querySelectorAll('.staff-item').forEach((b) => b.classList.toggle('on', b === button));
        const people = item.people
          ? el('p', { class: 'staff-meta', text: 'Reporter ' + (item.people.reporter || '?') + (item.people.accused ? ' · reported ' + item.people.accused : '') })
          : null;
        $('reportDetail').replaceChildren(panel(item.title, item.guild + ' · ' + fmtDate(item.at), [
          el('p', { class: 'staff-read', text: item.body || '(no text)' }),
          item.meta ? el('p', { class: 'staff-meta', text: item.meta }) : null,
          people,
        ]));
      });
      return button;
    }));
  }

  /* ---- Applications ----------------------------------------------------------------- */
  async function loadApplications() {
    try {
      const data = await api('/api/staff/applications');
      state.applications = data.applications || [];
      renderApplications();
    } catch (error) { $('applicationList').replaceChildren(empty(explain(error))); }
  }
  function statusTone(status) {
    const s = String(status || '').toLowerCase();
    return s.startsWith('accept') || s === 'approved' ? '' : s.startsWith('reject') || s === 'denied' ? 'red' : 'amber';
  }
  function renderApplications() {
    const filter = $('applicationFilter').value;
    const shown = state.applications.filter((a) => !filter || String(a.status).toLowerCase().startsWith(filter.slice(0, 6)));
    $('applicationCount').textContent = shown.length + ' shown';
    const list = $('applicationList');
    if (!shown.length) return list.replaceChildren(empty('No applications here.'));
    list.replaceChildren(...shown.map((app) => {
      const button = el('button', { type: 'button', class: 'staff-item' }, [
        initial(app.name),
        el('span', {}, [el('b', { text: app.name }), el('small', { text: app.position + ' · ' + fmtDate(app.submitted_at) })]),
        chip(app.status, statusTone(app.status)),
      ]);
      button.addEventListener('click', () => {
        list.querySelectorAll('.staff-item').forEach((b) => b.classList.toggle('on', b === button));
        const answers = (app.answers || []).length
          ? el('dl', { class: 'staff-qa' }, app.answers.flatMap((qa) => [el('dt', { text: qa.question || 'Answer' }), el('dd', { text: qa.answer || '—' })]))
          : empty('No answers were stored with this one.');
        $('applicationDetail').replaceChildren(
          el('div', { class: 'staff-detail-head' }, [initial(app.name), el('div', {}, [
            el('h1', { text: app.name }),
            el('p', { text: app.position + ' · ' + fmtDate(app.submitted_at) + (app.applicant_id ? ' · ' + app.applicant_id : '') })]),
            el('div', { class: 'staff-actions' }, [chip(app.status, statusTone(app.status))])]),
          panel('Answers', 'Accept or reject it in Discord, where its review card and the role grants are', [answers]),
        );
      });
      return button;
    }));
  }
  $('applicationFilter').addEventListener('change', renderApplications);

  /* ---- Plans -------------------------------------------------------------------- */
  function row(cells) { return el('tr', {}, cells.map((text) => el('td', { text: text }))); }
  async function loadPlans() {
    let data;
    try { data = await api('/api/staff/plans'); }
    catch (error) {
      $('planServers').replaceChildren(el('tr', {}, [el('td', { colspan: '5', class: 'staff-empty', text: explain(error) })]));
      return;
    }
    $('planServers').replaceChildren(...(data.servers.length ? data.servers.map((s) => row([
      s.guild, planLabel(s.tier), s.status + (s.cancelling ? ' (cancelling)' : ''), s.provider || 'granted', fmtDate(s.renews)]))
      : [el('tr', {}, [el('td', { colspan: '5', class: 'staff-empty', text: 'No server is on a plan.' })])]));
    $('planPeople').replaceChildren(...(data.people.length ? data.people.map((p) => row([
      p.user_id, planLabel(p.tier), p.status, p.expires_at ? fmtDate(p.expires_at) : 'no end date', p.note || '—']))
      : [el('tr', {}, [el('td', { colspan: '5', class: 'staff-empty', text: 'No personal grants.' })])]));
  }

  /* ---- Global ------------------------------------------------------------------- */
  async function loadGlobal() {
    let data;
    try { data = await api('/api/staff/global'); }
    catch (error) { $('globalStats').replaceChildren(el('div', { class: 'stat-tile', text: explain(error) })); return; }
    const bot = data.bot || {};
    const memory = bot.memory || {};
    const tile = (value, label) => el('div', { class: 'stat-tile' }, [el('b', { text: value }), el('span', { text: label })]);
    $('globalStats').replaceChildren(
      tile(fmtNumber(bot.servers), 'Servers'),
      tile(fmtNumber(bot.members), 'Members reached'),
      tile((bot.latency_ms || 0) + ' ms', 'Discord latency'),
      tile(memory.ram_mb !== undefined ? memory.ram_mb + ' / ' + (memory.swap_mb || 0) + ' MB' : '—', 'Memory: RAM / swap'),
    );
    const models = (data.ai.models || []).map((m) => el('div', { class: 'staff-model' }, [
      el('code', { text: m.name }),
      m.resting_seconds ? chip('resting ' + Math.ceil(m.resting_seconds / 60) + ' min', 'amber')
        : chip(m.name === data.ai.serving ? 'answering now' : 'ready'),
    ]));
    const web = data.web_search && data.web_search.paused_seconds
      ? el('p', { class: 'staff-meta', text: 'Web search is paused for ' + Math.ceil(data.web_search.paused_seconds / 60) + ' more minute(s) after failing twice.' })
      : el('p', { class: 'staff-meta', text: 'Web search is on.' });
    const paused = bot.ai_paused_servers
      ? el('p', { class: 'staff-meta', text: bot.ai_paused_servers + ' server(s) have Billy’s AI replies paused.' }) : null;
    $('globalModels').replaceChildren(...models, web, paused || '');
    const usage = data.ai.usage || [];
    const top = Math.max(1, ...usage.map((u) => u.calls));
    $('globalUsage').replaceChildren(...(usage.length ? usage.map((u) => el('div', { class: 'staff-bar' }, [
      el('span', { text: new Date(u.day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short' }) }),
      el('i', { style: 'width:' + Math.round((u.calls / top) * 100) + '%' }),
      el('span', { text: fmtNumber(u.calls) }),
    ])) : [empty('No AI calls recorded this week.')]));
  }

  /* ---- Staff and bans (the old Moderator Room) -------------------------------------- */
  async function loadStaff() {
    let data;
    try { data = await api('/api/moderator/overview'); }
    catch (error) { setStatus('staffStatus', explain(error), 'bad'); return; }
    $('staffForm').hidden = (data.you && data.you.rank) !== 'developer';
    const members = data.staff || [];
    $('staffMembers').replaceChildren(...(members.length ? members.map((m) => el('div', { class: 'staff-row' }, [
      el('div', {}, [el('b', { text: m.user_id }), el('small', { text: (m.rank_label || m.rank) + (m.updated_at ? ' · since ' + fmtDate(m.updated_at) : '') })]),
    ])) : [empty('Nobody has a rank yet. You can see this because you own Billy.')]));
    const bans = data.bans || [];
    $('banList').replaceChildren(...(bans.length ? bans.map((ban) => {
      const lift = el('button', { type: 'button', text: 'Lift' });
      lift.addEventListener('click', async () => {
        if (!window.confirm('Lift the ban on ' + ban.user_id + '?')) return;
        lift.disabled = true;
        try {
          await api('/api/moderator/bans/' + ban.user_id, { method: 'DELETE', body: { reason: 'Lifted from the Staff Dashboard' } });
          toast('Ban lifted.');
          loadStaff();
        } catch (error) { lift.disabled = false; setStatus('banStatus', explain(error), 'bad'); }
      });
      return el('div', { class: 'ban-row' }, [
        el('div', {}, [el('b', { text: ban.user_id }), el('small', { text: (ban.reason || 'No reason recorded') + (ban.expires_at ? ' · until ' + fmtDate(ban.expires_at) : ' · no end date') })]),
        lift,
      ]);
    }) : [empty('Nobody is banned from Billy. Bans stop someone using Billy; they don’t touch their Discord account.')]));
  }

  $('banSubmit').addEventListener('click', async () => {
    const userId = $('banUserId').value.trim(), reason = $('banReason').value.trim(), days = $('banDays').value.trim();
    setStatus('banStatus', 'Banning…');
    try {
      const result = await api('/api/moderator/bans', { method: 'POST', body: { user_id: userId, reason: reason, days: days || 0 } });
      setStatus('banStatus', result.message, 'good');
      $('banUserId').value = ''; $('banReason').value = ''; $('banDays').value = '';
      loadStaff();
    } catch (error) { setStatus('banStatus', explain(error), 'bad'); }
  });

  $('staffSubmit').addEventListener('click', async () => {
    const userId = $('staffUserId').value.trim(), rank = $('staffRankPick').value;
    setStatus('staffStatus', 'Saving…');
    try {
      const result = await api('/api/moderator/staff', { method: 'POST', body: { user_id: userId, rank: rank } });
      setStatus('staffStatus', result.message, 'good');
      $('staffUserId').value = '';
      loadStaff();
    } catch (error) { setStatus('staffStatus', explain(error), 'bad'); }
  });

  /* ---- Announce ------------------------------------------------------------------- */
  async function loadUpdates() {
    const list = $('updateList');
    let data;
    try { data = await api('/api/updates?limit=20'); }
    catch (error) { return list.replaceChildren(empty(explain(error))); }
    const updates = data.updates || [];
    if (!updates.length) return list.replaceChildren(empty('Nothing published yet.'));
    list.replaceChildren(...updates.map((entry) => {
      const remove = el('button', { type: 'button', class: 'button', text: 'Delete' });
      remove.addEventListener('click', async () => {
        if (!window.confirm('Delete “' + (entry.title || 'this update') + '”? Everyone loses sight of it straight away.')) return;
        remove.disabled = true;
        try { await api('/api/updates/delete', { method: 'POST', body: { id: String(entry.id) } }); toast('Deleted.'); loadUpdates(); }
        catch (error) { remove.disabled = false; toast(explain(error), true); }
      });
      return el('div', { class: 'staff-update' }, [
        el('div', { class: 'staff-update-head' }, [
          entry.version ? el('span', { class: 'tag', text: entry.version }) : null,
          el('b', { text: entry.title || 'Update' }),
          el('span', { class: 'staff-meta', text: fmtWhen(entry.created_at) }),
          remove,
        ]),
        el('p', { class: 'staff-read staff-meta', text: String(entry.body || '').slice(0, 600) }),
      ]);
    }));
  }

  $('updatePublish').addEventListener('click', async () => {
    const title = $('updateTitle').value.trim(), body = $('updateBody').value.trim(), version = $('updateVersion').value.trim();
    const status = $('updateStatus');
    if (!title || !body) { status.textContent = 'A title and some detail are needed.'; return; }
    const button = $('updatePublish');
    button.disabled = true;
    status.textContent = 'Publishing…';
    try {
      await api('/api/updates/publish', { method: 'POST', body: { title: title, body: body, version: version, category: 'bot' } });
      $('updateTitle').value = ''; $('updateBody').value = ''; $('updateVersion').value = '';
      status.textContent = 'Published.';
      loadUpdates();
    } catch (error) {
      status.textContent = error.status === 403 ? 'Only Billy developers can publish an update.' : explain(error);
    } finally { button.disabled = false; }
  });

  boot();
})();
