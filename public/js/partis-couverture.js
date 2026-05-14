/*
 * partis-couverture.js
 *
 * Hydrates the static "Couverture médiatique des partis politiques" section
 * of public/index.html with live data from
 * /data/refined/day/provincial_parties_score_day.json.
 *
 * Updates bar widths, percentage tooltips, tone-dot positions, sparklines,
 * and reorders rows (active vs "Dans l'ombre médiatique") based on the
 * selected time range. Wires the .legend-toggle tabs
 * (Aujourd'hui / Depuis une semaine / Depuis un mois) to re-render.
 *
 * Graceful: if the fetch fails or the data is empty, the static mock values
 * in index.html remain on screen — nothing is wiped before data arrives.
 */
(function () {
  'use strict';

  var DATA_URL = '/data/refined/day/provincial_parties_score_day.json';
  var PARTY_KEYS = ['plq', 'caq', 'qs', 'pq', 'pcq'];
  var PASS_ORDER = { pm: 3, noon: 2, am: 1 };
  var SHADOW_THRESHOLD = 0.05;
  var SPARK_W = 100;
  var SPARK_H = 30;
  // Raw tone scores from the refiner are tiny (typically |tone| < 0.05),
  // so a linear [-1,+1] mapping clusters every dot at the centre and the
  // chart looks like every party has identical neutral coverage. Amplify
  // by this factor (then clamp) so day-to-day differences read visually.
  var TONE_AMPLIFY = 15;
  var LOG_TAG = '[partis-couverture]';
  function log() {
    if (typeof console !== 'undefined' && console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_TAG);
      console.log.apply(console, args);
    }
  }

  // ── Data transformation ────────────────────────────────────────────────────

  // Build { date → party(UPPER) → { mentions, tone } } from raw rows.
  // The upstream Athena table has duplicate (date, party, pass) rows and
  // mixed-case party codes; we dedupe by keeping the row with the highest
  // weighted_mentions per (date, partyUpper, pass), then pick the best
  // available pass (pm > noon > am, preferring nonzero mentions).
  function buildDayLookup(rows) {
    var passBest = Object.create(null);
    rows.forEach(function (row) {
      var key = row.date_utc + '|' + row.party.toUpperCase() + '|' + row.pass;
      var existing = passBest[key];
      if (!existing || row.weighted_mentions > existing.weighted_mentions) {
        passBest[key] = {
          date_utc: row.date_utc,
          party: row.party.toUpperCase(),
          pass: row.pass,
          weighted_mentions: row.weighted_mentions,
          weighted_tone: row.weighted_tone,
        };
      }
    });

    var grouped = Object.create(null);
    Object.keys(passBest).forEach(function (k) {
      var row = passBest[k];
      if (!grouped[row.date_utc]) grouped[row.date_utc] = Object.create(null);
      if (!grouped[row.date_utc][row.party]) grouped[row.date_utc][row.party] = [];
      grouped[row.date_utc][row.party].push(row);
    });

    var result = Object.create(null);
    Object.keys(grouped).forEach(function (date) {
      result[date] = Object.create(null);
      var parties = grouped[date];
      Object.keys(parties).forEach(function (party) {
        var passes = parties[party].slice().sort(function (a, b) {
          return (PASS_ORDER[b.pass] || 0) - (PASS_ORDER[a.pass] || 0);
        });
        var best = passes.find(function (r) { return r.weighted_mentions > 0; }) || passes[0];
        result[date][party] = { mentions: best.weighted_mentions, tone: best.weighted_tone };
      });
    });
    return result;
  }

  // For each known party, derive sov.today / sov.week / sov.month, tone,
  // and the per-range SOV history.
  function computeStats(rows) {
    var dayLookup = buildDayLookup(rows);
    var allDates = Object.keys(dayLookup).sort();
    if (allDates.length === 0) return null;

    var latestDate = allDates[allDates.length - 1];
    var knownParties = PARTY_KEYS.map(function (k) { return k.toUpperCase(); });
    var last7 = allDates.slice(-7);
    var last30 = allDates.slice(-30);

    function sovOnDate(date) {
      var day = dayLookup[date] || {};
      var total = knownParties.reduce(function (s, p) {
        return s + ((day[p] && day[p].mentions) || 0);
      }, 0) || 1;
      var out = Object.create(null);
      knownParties.forEach(function (p) {
        out[p] = ((day[p] && day[p].mentions) || 0) / total;
      });
      return out;
    }

    var sovCache = Object.create(null);
    last30.forEach(function (d) { sovCache[d] = sovOnDate(d); });

    function avg(arr) {
      if (!arr.length) return 0;
      return arr.reduce(function (s, v) { return s + v; }, 0) / arr.length;
    }

    // Cache SOV for every available date so we can compute a yearly mean
    // (which is "moyenne de l'année" — the long-term reference shown on
    // the monthly view).
    var allDatesSovCache = Object.create(null);
    allDates.forEach(function (d) { allDatesSovCache[d] = sovOnDate(d); });

    return knownParties.map(function (party) {
      var hist7 = last7.map(function (d) { return (sovCache[d] && sovCache[d][party]) || 0; });
      var hist30 = last30.map(function (d) { return (sovCache[d] && sovCache[d][party]) || 0; });
      var histYear = allDates.map(function (d) { return (allDatesSovCache[d] && allDatesSovCache[d][party]) || 0; });
      return {
        key: party.toLowerCase(),
        sov: {
          today: (sovCache[latestDate] && sovCache[latestDate][party]) || 0,
          week: avg(hist7),
          month: avg(hist30),
          year: avg(histYear),
        },
        tone: (dayLookup[latestDate] && dayLookup[latestDate][party] && dayLookup[latestDate][party].tone) || 0,
        history: { week: hist7, month: hist30 },
      };
    });
  }

  // Per range: what the bar shows, what the reference marker shows,
  // and the caption that follows the leader's marker.
  var RANGE_CONFIG = {
    today: { barKey: 'today', refKey: 'week',  refLabel: 'moyenne 7 jours',    refDays: 7 },
    week:  { barKey: 'week',  refKey: 'month', refLabel: 'moyenne du mois',    refDays: 30 },
    month: { barKey: 'month', refKey: 'year',  refLabel: "moyenne de l'année", refDays: 365 },
  };

  // ── Sparkline geometry ────────────────────────────────────────────────────

  function sparkPoints(history, w, h) {
    if (!history.length) return [];
    var min = Math.min.apply(null, history);
    var max = Math.max.apply(null, history);
    var range = (max - min) || 0.001;
    var n = history.length;
    return history.map(function (v, i) {
      var x = (n === 1 ? w / 2 : (i / (n - 1)) * w);
      var y = h - ((v - min) / range) * (h * 0.8) - h * 0.1;
      return [x, y];
    });
  }

  // Pick `n` evenly-spaced indices from `points` (length ≥ n).
  function samplePoints(points, n) {
    if (points.length <= n) return points;
    var step = (points.length - 1) / (n - 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(points[Math.round(i * step)]);
    return out;
  }

  // ── DOM updates ───────────────────────────────────────────────────────────

  function updateRow(rowEl, stat, range, leadSov) {
    var cfg = RANGE_CONFIG[range] || RANGE_CONFIG.today;
    var sov = stat.sov[cfg.barKey];
    var pct = Math.round(sov * 100);
    var barPct = leadSov > 0 ? Math.min(100, (sov / leadSov) * 100) : 0;

    var bar = rowEl.querySelector('.parti-bar');
    if (bar) {
      bar.style.width = barPct.toFixed(1) + '%';
      bar.setAttribute('title', pct + ' % de part de voix');
      // Color the bar with the party's own colour (read from the
      // CSS variable --party set on the sibling .parti-name-box).
      var nameBox = rowEl.querySelector('.parti-name-box');
      if (nameBox) {
        var partyColor = getComputedStyle(nameBox).getPropertyValue('--party');
        if (partyColor) bar.style.background = partyColor.trim();
      }
    }

    var avgMarker = rowEl.querySelector('.parti-bar-avg');
    if (avgMarker) {
      avgMarker.style.display = '';
      var refSov = stat.sov[cfg.refKey];
      var refPct = leadSov > 0 ? Math.min(100, (refSov / leadSov) * 100) : 0;
      avgMarker.style.left = refPct.toFixed(1) + '%';
      avgMarker.setAttribute('title', cfg.refLabel + ' : ' + Math.round(refSov * 100) + ' %');
    }

    var toneDot = rowEl.querySelector('.parti-tone .ass-tone-dot');
    if (toneDot) {
      var amplified = Math.max(-1, Math.min(1, stat.tone * TONE_AMPLIFY));
      toneDot.style.left = (((amplified + 1) / 2) * 100).toFixed(1) + '%';
    }

    var rawHistory = range === 'month' ? stat.history.month : stat.history.week;
    var pts = sparkPoints(rawHistory, SPARK_W, SPARK_H);
    var ptsStr = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');

    var polyline = rowEl.querySelector('.parti-spark polyline');
    if (polyline) polyline.setAttribute('points', ptsStr);

    var circles = rowEl.querySelectorAll('.parti-spark circle');
    if (circles.length > 0) {
      var sampled = samplePoints(pts, circles.length);
      sampled.forEach(function (p, i) {
        if (circles[i]) {
          circles[i].setAttribute('cx', p[0].toFixed(1));
          circles[i].setAttribute('cy', p[1].toFixed(1));
        }
      });
    }
  }

  function render(stats, range) {
    if (!stats || !stats.length) return;

    var cfg = RANGE_CONFIG[range] || RANGE_CONFIG.today;
    var barKey = cfg.barKey;

    var section = document.querySelector('section.partis');
    if (!section) return;
    var inShadow = section.querySelector('.in-shadow');

    var partyRowEls = Object.create(null);
    PARTY_KEYS.forEach(function (key) {
      var nameBox = section.querySelector('.parti-name-box.' + key);
      if (nameBox) partyRowEls[key] = nameBox.closest('.parti-row');
    });

    var sorted = stats.slice().sort(function (a, b) { return b.sov[barKey] - a.sov[barKey]; });

    // Bar lengths are normalized against the highest non-shadow value so the
    // leader fills the track. Fall back to absolute max if everything is in shadow.
    var visibleLead = 0;
    sorted.forEach(function (s) {
      if (s.sov[barKey] >= SHADOW_THRESHOLD && s.sov[barKey] > visibleLead) {
        visibleLead = s.sov[barKey];
      }
    });
    if (visibleLead === 0 && sorted[0]) visibleLead = sorted[0].sov[barKey];

    sorted.forEach(function (stat) {
      var row = partyRowEls[stat.key];
      if (!row) return;
      updateRow(row, stat, range, visibleLead);
      if (stat.sov[barKey] < SHADOW_THRESHOLD && inShadow) {
        inShadow.appendChild(row);
      } else if (inShadow) {
        section.insertBefore(row, inShadow);
      } else {
        section.appendChild(row);
      }
    });

    if (inShadow) {
      var shadowRows = inShadow.querySelectorAll('.parti-row');
      inShadow.style.display = shadowRows.length === 0 ? 'none' : '';
    }

    // Caption follows the leader and matches the range:
    //   today → "moyenne 7 jours"     (reference = 7-day mean)
    //   week  → "moyenne du mois"     (reference = 30-day mean)
    //   month → "moyenne de l'année"  (reference = full-history mean)
    var label = section.querySelector('.avg-label');
    if (label) label.parentNode.removeChild(label);
    var leaderRow = section.querySelector('.parti-row:not(.header)');
    if (leaderRow) {
      var leaderMarker = leaderRow.querySelector('.parti-bar-avg');
      if (leaderMarker) {
        var span = document.createElement('span');
        span.className = 'avg-label';
        span.textContent = cfg.refLabel;
        leaderMarker.appendChild(span);
      }
    }
  }

  // Locate the legend-toggle that sits in the title row immediately
  // preceding the partis section. Several `.partis-title-row` blocks exist
  // in the page (treemap, assemblée) and each has its own legend-toggle,
  // so we cannot just pick the first one by document order.
  function findPartisTabs() {
    var section = document.querySelector('section.partis');
    if (!section) {
      log('section.partis not found');
      return null;
    }
    var titleRow = section.previousElementSibling;
    while (titleRow && !(titleRow.classList && titleRow.classList.contains('partis-title-row'))) {
      titleRow = titleRow.previousElementSibling;
    }
    if (!titleRow) {
      log('preceding partis-title-row not found, falling back to first match');
      titleRow = document.querySelector('.partis-title-row');
    }
    if (!titleRow) return null;
    var tabs = titleRow.querySelectorAll('.legend-toggle.inline span');
    log('found tabs:', tabs.length);
    return tabs.length ? tabs : null;
  }

  function wireTabs(stats) {
    var tabs = findPartisTabs();
    if (!tabs) return;

    var rangeMap = ['today', 'week', 'month'];
    tabs.forEach(function (tab, i) {
      tab.style.cursor = 'pointer';
      tab.addEventListener('click', function (ev) {
        ev.preventDefault();
        log('tab clicked', i, rangeMap[i]);
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        render(stats, rangeMap[i]);
      });
    });
    log('tabs wired');
  }

  function init() {
    log('init', { readyState: document.readyState, url: DATA_URL });
    fetch(DATA_URL + '?ts=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        log('fetched', rows.length, 'rows');
        var stats = computeStats(rows);
        if (!stats) { log('computeStats returned null'); return; }
        log('computed stats for', stats.length, 'parties');
        render(stats, 'today');
        wireTabs(stats);
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
