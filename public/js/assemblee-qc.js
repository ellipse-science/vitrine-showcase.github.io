/*
 * assemblee-qc.js
 *
 * Hydrates the "Que dit-on à l'Assemblée ?" section of public/index.html
 * with live data from /data/agora/agora_decideurs_qc.json.
 *
 * Updates enjeu stacks, editorial angles, tone dots, word counts, and
 * lexical richness indicators per party. Wires the three period tabs
 * (Dernière période de questions / Cette session / Cette législature).
 *
 * Graceful: if the fetch fails, static mock values in index.html remain.
 */
(function () {
  'use strict';

  var DATA_URL = '/data/agora/agora_decideurs_qc.json';
  var PARTY_KEYS = ['plq', 'caq', 'qs', 'pq', 'pcq'];
  var TONE_AMPLIFY = 10;
  var LOG_TAG = '[assemblee-qc]';

  var ISSUE_META = [
    { key: 'economy_and_labour',                        color: '#742630', label: 'Économie',   title: 'Économie et travail' },
    { key: 'governments_and_governance',                color: '#6F5828', label: 'Gouv.',       title: 'Gouvernements et gouvernance' },
    { key: 'health_and_social_services',                color: '#7D5358', label: 'Santé',       title: 'Santé et services sociaux' },
    { key: 'environment_and_energy',                    color: '#5F6E36', label: 'Environ.',    title: 'Environnement et énergie' },
    { key: 'rights_liberties_minorities_discrimination',color: '#5F4E78', label: 'Droits',      title: 'Droits, libertés, minorités' },
    { key: 'culture_and_nationalism',                   color: '#35604E', label: 'Culture',     title: 'Culture et nationalisme' },
    { key: 'education',                                 color: '#7A5A23', label: 'Éduc.',       title: 'Éducation' },
    { key: 'international_affairs_and_defense',         color: '#304860', label: 'Aff. int.',   title: 'Affaires internationales' },
    { key: 'law_and_crime',                             color: '#463E3E', label: 'Loi',         title: 'Loi et crime' },
    { key: 'public_lands_and_agriculture',              color: '#7D5132', label: 'Terres',      title: 'Terres publiques, agri.' },
    { key: 'immigration',                               color: '#8B6914', label: 'Immig.',      title: 'Immigration' },
    { key: 'technology',                                color: '#3A5F70', label: 'Tech.',       title: 'Technologie' },
  ];

  var MONTHS_FR = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];

  function log() {
    if (typeof console !== 'undefined' && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_TAG);
      console.log.apply(console, args);
    }
  }

  // ── Formatting helpers ────────────────────────────────────────────────────

  function fmtDateFr(dateStr) {
    var parts = String(dateStr || '').split('-');
    if (parts.length < 3) return dateStr || '';
    var day = parseInt(parts[2], 10);
    var month = parseInt(parts[1], 10) - 1;
    return day + ' ' + MONTHS_FR[month] + ' ' + parts[0];
  }

  // Format integer with non-breaking space thousands separator (12840 → "12 840")
  function fmtWords(n) {
    var s = String(Math.round(n || 0));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
      out += s[i];
    }
    return out;
  }

  // level 1–5 → filled dots HTML
  function richnessDots(level) {
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += i <= level ? '●' : '<span class="empty">○</span>';
    }
    return out;
  }

  // Normalize MATTR values across parties → 1–5 levels (relative scaling).
  // The richest party gets 5, others are proportional. When all parties
  // are within 0.01 of each other, assign mid-scale (3) to all.
  function computeRichnessLevels(mattrs) {
    var keys = Object.keys(mattrs);
    var values = keys.map(function (k) { return mattrs[k]; });
    var maxVal = Math.max.apply(null, values);
    var minVal = Math.min.apply(null, values);
    var range = maxVal - minVal;
    var result = Object.create(null);
    keys.forEach(function (k) {
      result[k] = range < 0.01
        ? 3
        : Math.max(1, Math.round(1 + ((mattrs[k] - minVal) / range) * 4));
    });
    return result;
  }

  // ── Enjeu stack ───────────────────────────────────────────────────────────

  function buildEnjeuStack(row) {
    var segments = [];
    ISSUE_META.forEach(function (meta) {
      var val = parseFloat(row[meta.key] || 0);
      if (val >= 0.04) segments.push({ meta: meta, val: val });
    });
    segments.sort(function (a, b) { return b.val - a.val; });

    var cumul = 0;
    var kept = [];
    segments.forEach(function (seg) {
      if (cumul < 0.80) {
        kept.push(seg);
        cumul += seg.val;
      }
    });

    var reste = Math.max(0, 1 - cumul);
    var html = '';
    kept.forEach(function (seg) {
      var pct = Math.round(seg.val * 100);
      html += '<span class="seg"'
           + ' style="background:' + seg.meta.color + ';width:' + pct + '%;"'
           + ' title="' + seg.meta.title + ' · ' + pct + ' %">'
           + seg.meta.label + '</span>';
    });
    if (reste > 0.02) {
      html += '<span class="seg reste"'
           + ' style="width:' + Math.round(reste * 100) + '%;"'
           + ' title="Autres enjeux · ' + Math.round(reste * 100) + ' %">Reste</span>';
    }
    return html;
  }

  // ── DOM traversal ─────────────────────────────────────────────────────────

  function findAssemblee() {
    return document.querySelector('section.assemblee');
  }

  function findTitleRow(section) {
    var el = section.previousElementSibling;
    while (el) {
      if (el.classList && el.classList.contains('partis-title-row')) return el;
      el = el.previousElementSibling;
    }
    return null;
  }

  // ── Subtitle ──────────────────────────────────────────────────────────────

  function updateSubtitle(titleRow, periodType, endDate) {
    var subtitle = titleRow ? titleRow.querySelector('.period-subtitle') : null;
    if (!subtitle) return;
    var text;
    if (periodType === 'last_pdq') {
      text = 'Période de questions du ' + fmtDateFr(endDate) + ' · Salon bleu';
    } else if (periodType === 'session') {
      text = 'Session ' + String(endDate || '').slice(0, 4) + ' · Salon bleu';
    } else {
      text = 'Législature ' + String(endDate || '').slice(0, 4) + ' · Salon bleu';
    }
    subtitle.textContent = text;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render(data, periodType) {
    var rows = data.filter(function (r) { return r.period_type === periodType; });
    if (!rows.length) { log('no rows for period', periodType); return; }

    var section = findAssemblee();
    if (!section) { log('section.assemblee not found'); return; }

    var titleRow = findTitleRow(section);
    var endDate = rows[0] ? rows[0].period_end_date : '';
    updateSubtitle(titleRow, periodType, endDate);

    var inShadow = section.querySelector('.in-shadow');

    // Build row element map
    var rowMap = Object.create(null);
    PARTY_KEYS.forEach(function (key) {
      var nameBox = section.querySelector('.parti-name-box.' + key);
      if (nameBox) rowMap[key] = nameBox.closest('.ass-row');
    });

    // Sort parties by interventions descending
    var sorted = PARTY_KEYS.map(function (key) {
      var partyData = null;
      rows.forEach(function (r) {
        if (r.party && r.party.toLowerCase() === key) partyData = r;
      });
      return { key: key, data: partyData, interventions: partyData ? (partyData.n_interventions || 0) : 0 };
    });
    sorted.sort(function (a, b) { return b.interventions - a.interventions; });

    // Compute relative richness levels across active parties
    var mattrs = Object.create(null);
    sorted.forEach(function (item) {
      if (item.interventions > 0 && item.data) {
        mattrs[item.key] = parseFloat(item.data.lexical_richness || 0);
      }
    });
    var richnessLevels = computeRichnessLevels(mattrs);

    sorted.forEach(function (item) {
      var rowEl = rowMap[item.key];
      if (!rowEl) return;

      if (item.interventions > 0 && item.data) {
        var d = item.data;

        var enjeuStack = rowEl.querySelector('.enjeu-stack');
        if (enjeuStack) enjeuStack.innerHTML = buildEnjeuStack(d);

        var angleEl = rowEl.querySelector('.ass-angle');
        if (angleEl) angleEl.textContent = d.editorial_angle || '';

        var toneDot = rowEl.querySelector('.ass-tone-dot');
        if (toneDot) {
          var amplified = Math.max(-1, Math.min(1, parseFloat(d.tone_score || 0) * TONE_AMPLIFY));
          toneDot.style.left = (((amplified + 1) / 2) * 100).toFixed(1) + '%';
        }

        var wordsEl = rowEl.querySelector('.ass-words');
        if (wordsEl) wordsEl.textContent = fmtWords(d.word_count);

        var richnessEl = rowEl.querySelector('.ass-richness');
        if (richnessEl) richnessEl.innerHTML = richnessDots(richnessLevels[item.key] || 1);

        // Place row above shadow zone (sorted order is maintained by iteration)
        if (inShadow) {
          section.insertBefore(rowEl, inShadow);
        } else {
          section.appendChild(rowEl);
        }
      } else {
        if (inShadow) inShadow.appendChild(rowEl);
      }
    });

    // Show/hide shadow zone
    if (inShadow) {
      var shadowRows = inShadow.querySelectorAll('.ass-row');
      inShadow.style.display = shadowRows.length === 0 ? 'none' : '';
    }
  }

  // ── Tab wiring ────────────────────────────────────────────────────────────

  function wireTabs(data) {
    var section = findAssemblee();
    if (!section) return;
    var titleRow = findTitleRow(section);
    if (!titleRow) { log('partis-title-row for assemblee not found'); return; }

    var tabs = titleRow.querySelectorAll('.legend-toggle.inline span');
    if (!tabs.length) { log('no tabs found'); return; }

    var periodMap = ['last_pdq', 'session', 'legislature'];
    tabs.forEach(function (tab, i) {
      tab.style.cursor = 'pointer';
      tab.addEventListener('click', function (ev) {
        ev.preventDefault();
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        render(data, periodMap[i]);
      });
    });
    log('tabs wired');
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    log('init', DATA_URL);
    fetch(DATA_URL + '?ts=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        log('fetched', data.length, 'rows');
        render(data, 'last_pdq');
        wireTabs(data);
      })
      .catch(function (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error(LOG_TAG, 'data load failed', err);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
