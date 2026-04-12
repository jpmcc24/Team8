/* ============================================
   VEHICLE MAINTENANCE TRACKER — dashboard.js
   Team GR8 | Place this file in public/js/
   ============================================ */

'use strict';

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const VEHICLE_COLORS = ['#6a8f6e', '#c0603a', '#5a7a9a', '#a07848', '#8a6e9a', '#7a9e8a'];

/* ══════════════════════════════════════════
   DATA STORE  (populated from API on load)
══════════════════════════════════════════ */
const AppState = {
  currentUser:    { name: '', initials: '' },
  vehicles:       [],
  services:       [],
  rules:          [],
  fuelLog:        [],
  maintenanceLog: [],
  monthlySpend:   [],
  activeVehicleId: null
};


/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const qs  = (sel, ctx) => (ctx || document).querySelector(sel);
const qsa = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

const formatCurrency = n  => (n === 0 ? 'Free' : '$' + n.toFixed(2));
const formatMileage  = n  => n.toLocaleString() + ' mi';
const formatDate     = iso => {
  const parts = iso.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const getVehicle   = id  => AppState.vehicles.find(function(v){ return v.id === id; });
const vehicleLabel = id  => { var v = getVehicle(id); return v ? (v.year + ' ' + v.make + ' ' + v.model) : '—'; };
const mpgColor     = mpg => mpg >= 30 ? 'var(--green)' : mpg >= 22 ? 'var(--accent)' : 'var(--red)';
const healthClass  = h   => ({ good: 'health-good', fair: 'health-fair', poor: 'health-poor' }[h] || 'health-good');

function vehicleTypeIcon(type) {
  var icons = {
    'Sedan':    'fa-car',
    'Coupe':    'fa-car-side',
    'Hatchback':'fa-car-side',
    'SUV':      'fa-truck-suv',
    'Truck':    'fa-truck-pickup',
    'Minivan':  'fa-van-shuttle',
    'Other':    'fa-car'
  };
  return icons[type] || 'fa-car';
}

function statusTag(s) {
  if (s.status === 'overdue') {
    var parts = [];
    if (s.daysOverdue > 0)  parts.push(s.daysOverdue + 'd');
    if (s.milesOverdue > 0) parts.push(s.milesOverdue.toLocaleString() + ' mi');
    return '<span class="service-due-tag tag-overdue">Overdue' + (parts.length ? ' · ' + parts.join(' / ') : '') + '</span>';
  }
  if (s.status === 'warning') {
    var parts = [];
    if (s.daysUntil  < 999) parts.push('in ' + s.daysUntil + 'd');
    if (s.milesUntil < 999) parts.push(s.milesUntil.toLocaleString() + ' mi left');
    return '<span class="service-due-tag tag-warning">Due ' + (parts.length ? parts.join(' / ') : 'soon') + '</span>';
  }
  return '<span class="service-due-tag tag-ok">On schedule</span>';
}

function statusDotClass(status) {
  return { overdue: 'status-overdue', warning: 'status-warning', ok: 'status-ok' }[status] || 'status-ok';
}

function openItemsHTML(v) {
  if (v.openItemsStatus === 'overdue')
    return '<div class="vehicle-meta-val" style="color:var(--red)">' + v.openItems + ' overdue</div>';
  if (v.openItemsStatus === 'upcoming')
    return '<div class="vehicle-meta-val" style="color:var(--accent)">' + v.openItems + ' upcoming</div>';
  return '<div class="vehicle-meta-val" style="color:var(--green)">All clear</div>';
}


/* ══════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════ */
async function loadData() {
  const [rawVehicles, rawMaintenance, rawFuel, rawReminders, rawRules] = await Promise.all([
    DataModel.getVehicles(),
    DataModel.getMaintenance(),
    DataModel.getFuel(),
    DataModel.getReminders(),
    DataModel.getRules(),
  ]);

  // ── Vehicles ──
  AppState.vehicles = rawVehicles.map(function(v, i) {
    return {
      id:              'v' + v.id,
      make:            v.make,
      model:           v.model,
      year:            v.year,
      type:            v.type || 'Vehicle',
      color:           VEHICLE_COLORS[i % VEHICLE_COLORS.length],
      odometer:        v.current_mileage,
      avgMpg:          0,
      lastService:     null,
      health:          'good',
      openItems:       0,
      openItemsStatus: 'ok',
    };
  });

  if (AppState.vehicles.length > 0 && !AppState.activeVehicleId) {
    AppState.activeVehicleId = AppState.vehicles[0].id;
  }

  // ── Maintenance log ──
  AppState.maintenanceLog = rawMaintenance.map(function(m) {
    return {
      id:        'm' + m.id,
      vehicleId: 'v' + m.vehicle_id,
      date:      String(m.date).slice(0, 10),
      service:   m.service_type,
      mileage:   m.mileage,
      location:  m.location || '',
      cost:      parseFloat(m.cost) || 0,
      notes:     m.notes || '',
    };
  });

  // Set lastService per vehicle (maintenance is returned DESC by date)
  AppState.vehicles.forEach(function(v) {
    var log = AppState.maintenanceLog.find(function(m) { return m.vehicleId === v.id; });
    if (log) v.lastService = log.date;
  });

  // ── Fuel log ──
  AppState.fuelLog = rawFuel.map(function(f) {
    return {
      id:        'f' + f.id,
      vehicleId: 'v' + f.vehicle_id,
      date:      String(f.date).slice(0, 10),
      station:   f.station || '',
      gallons:   parseFloat(f.gallons),
      cost:      parseFloat(f.gallons) * parseFloat(f.price_per_gallon),
      mpg:       0,
      odometer:  f.mileage,
    };
  });

  computeFuelMpg();

  // ── Reminders → services ──
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  AppState.services = rawReminders.map(function(r) {
    var dueStr  = r.due_date ? String(r.due_date).slice(0, 10) : null;
    var status = 'ok', daysOverdue = 0, daysUntil = 999, milesOverdue = 0, milesUntil = 999;

    if (dueStr) {
      var parts = dueStr.split('-').map(Number);
      var dueDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      var diff = Math.round((dueDateObj - today) / 86400000);
      if      (diff < 0)   { status = 'overdue'; daysOverdue = -diff; }
      else if (diff <= 30) { status = 'warning';  daysUntil   = diff; }
      else                 {                      daysUntil   = diff; }
    }

    if (r.due_mileage) {
      var vehicle = AppState.vehicles.find(function(v) { return v.id === 'v' + r.vehicle_id; });
      var curMi = vehicle ? vehicle.odometer : 0;
      var mileDiff = r.due_mileage - curMi;
      if (mileDiff <= 0) {
        status = 'overdue'; milesOverdue = -mileDiff;
      } else if (mileDiff <= 500) {
        if (status !== 'overdue') status = 'warning';
        milesUntil = mileDiff;
      } else {
        milesUntil = mileDiff;
      }
    }

    return {
      id:        'r' + r.id,
      vehicleId: 'v' + r.vehicle_id,
      name:      r.service_type,
      dueDate:   dueStr || '',
      dueMileage: r.due_mileage || null,
      isRule:    false,
      status, daysOverdue, daysUntil, milesOverdue, milesUntil,
    };
  });

  // ── Maintenance rules → additional service items ──
  AppState.rules = rawRules;
  rawRules.forEach(function(r) {
    var vehicle = AppState.vehicles.find(function(v) { return v.id === 'v' + r.vehicle_id; });
    var curMi   = vehicle ? vehicle.odometer : 0;
    AppState.services.push(computeRuleService(r, curMi, today));
  });

  // Sort: overdue first, then warning, then ok
  AppState.services.sort(function(a, b) {
    var order = { overdue: 0, warning: 1, ok: 2 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });

  // Derive health / openItems per vehicle from all service items
  AppState.vehicles.forEach(function(v) {
    var vr      = AppState.services.filter(function(s) { return s.vehicleId === v.id; });
    var overdue = vr.filter(function(s) { return s.status === 'overdue'; }).length;
    var warning = vr.filter(function(s) { return s.status === 'warning'; }).length;
    v.openItems = overdue + warning;

    if      (overdue >= 2) { v.health = 'poor'; v.openItemsStatus = 'overdue'; }
    else if (overdue > 0)  { v.health = 'fair'; v.openItemsStatus = 'overdue'; }
    else if (warning > 0)  { v.health = 'fair'; v.openItemsStatus = 'upcoming'; }
    else                   { v.health = 'good'; v.openItemsStatus = 'ok'; }
  });

  // ── Monthly spend (last 6 months from maintenance costs) ──
  computeMonthlySpend();
}

function computeFuelMpg() {
  var byVehicle = {};
  AppState.fuelLog.forEach(function(f) {
    if (!byVehicle[f.vehicleId]) byVehicle[f.vehicleId] = [];
    byVehicle[f.vehicleId].push(f);
  });

  Object.keys(byVehicle).forEach(function(vid) {
    var entries = byVehicle[vid].sort(function(a, b) { return a.odometer - b.odometer; });

    for (var i = 1; i < entries.length; i++) {
      var miles = entries[i].odometer - entries[i - 1].odometer;
      if (miles > 0 && entries[i].gallons > 0 && entries[i - 1].odometer > 0) {
        entries[i].mpg = parseFloat((miles / entries[i].gallons).toFixed(1));
      }
    }

    var vehicle = AppState.vehicles.find(function(v) { return v.id === vid; });
    if (vehicle) {
      var valid = entries.filter(function(e) { return e.mpg > 0; });
      if (valid.length > 0) {
        vehicle.avgMpg = parseFloat(
          (valid.reduce(function(s, e) { return s + e.mpg; }, 0) / valid.length).toFixed(1)
        );
      }
    }
  });
}

function computeMonthlySpend() {
  var byMonth = {};
  AppState.maintenanceLog.forEach(function(m) {
    var key = String(m.date).slice(0, 7); // YYYY-MM
    byMonth[key] = (byMonth[key] || 0) + (m.cost || 0);
  });
  AppState.fuelLog.forEach(function(f) {
    var key = String(f.date).slice(0, 7);
    byMonth[key] = (byMonth[key] || 0) + (f.cost || 0);
  });

  var names = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var today = new Date();
  AppState.monthlySpend = [];

  for (var i = 5; i >= 0; i--) {
    var d   = new Date(today.getFullYear(), today.getMonth() - i, 1);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    AppState.monthlySpend.push({ month: names[d.getMonth()], amount: Math.round(byMonth[key] || 0) });
  }
}


/* ══════════════════════════════════════════
   ANALYTICS COMPUTATIONS
══════════════════════════════════════════ */
var _analyticsGradCounter = 0;

function categorizeService(serviceType) {
  var s = (serviceType || '').toLowerCase();
  if (/oil|filter|rotation|inspection|wiper|fluid|coolant|alignment|tune|spark|cabin/.test(s)) return 'routine';
  if (/tire|tyre|brake|battery/.test(s)) return 'wear';
  return 'repair';
}

function computeCostPerMile() {
  var today = new Date();
  var names = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var months = [];
  var i, j, key;
  for (i = 11; i >= 0; i--) {
    var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push({ key: key, label: names[d.getMonth()], miles: 0, fuelCost: 0, maintCost: 0 });
  }

  var byVehicle = {};
  AppState.fuelLog.forEach(function(f) {
    if (!byVehicle[f.vehicleId]) byVehicle[f.vehicleId] = [];
    byVehicle[f.vehicleId].push(f);
  });
  Object.keys(byVehicle).forEach(function(vid) {
    var entries = byVehicle[vid].sort(function(a, b) { return a.odometer - b.odometer; });
    for (i = 1; i < entries.length; i++) {
      var delta = entries[i].odometer - entries[i - 1].odometer;
      if (delta <= 0 || delta > 5000) continue;
      key = String(entries[i].date).slice(0, 7);
      for (j = 0; j < months.length; j++) {
        if (months[j].key === key) { months[j].miles += delta; break; }
      }
    }
  });

  AppState.fuelLog.forEach(function(f) {
    key = String(f.date).slice(0, 7);
    for (j = 0; j < months.length; j++) {
      if (months[j].key === key) { months[j].fuelCost += f.cost; break; }
    }
  });
  AppState.maintenanceLog.forEach(function(m) {
    key = String(m.date).slice(0, 7);
    for (j = 0; j < months.length; j++) {
      if (months[j].key === key) { months[j].maintCost += m.cost; break; }
    }
  });

  return months.map(function(m) {
    var total = m.fuelCost + m.maintCost;
    return {
      key: m.key, label: m.label,
      miles: m.miles, fuelCost: m.fuelCost, maintCost: m.maintCost, total: total,
      cpm: m.miles > 50 ? total / m.miles : 0,
    };
  });
}

function computeSpendingDNA() {
  var today = new Date();
  var names = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var months = [], i, j, key;
  for (i = 5; i >= 0; i--) {
    var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push({ key: key, label: names[d.getMonth()], fuel: 0, routine: 0, wear: 0, repair: 0 });
  }
  AppState.fuelLog.forEach(function(f) {
    key = String(f.date).slice(0, 7);
    for (j = 0; j < months.length; j++) {
      if (months[j].key === key) { months[j].fuel += f.cost; break; }
    }
  });
  AppState.maintenanceLog.forEach(function(m) {
    key = String(m.date).slice(0, 7);
    var cat = categorizeService(m.service);
    for (j = 0; j < months.length; j++) {
      if (months[j].key === key) { months[j][cat] += m.cost; break; }
    }
  });
  return months;
}

function computeFuelIntelligence() {
  return AppState.fuelLog
    .filter(function(f) { return f.mpg > 0; })
    .sort(function(a, b) { return a.date < b.date ? -1 : 1; })
    .map(function(f) {
      var ppg = f.gallons > 0 ? f.cost / f.gallons : 0;
      return { date: f.date, mpg: f.mpg, ppg: ppg, c100: ppg > 0 && f.mpg > 0 ? (ppg / f.mpg) * 100 : 0 };
    });
}

function computeFleetScorecard() {
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  var cutoffStr = cutoff.toISOString().slice(0, 10);
  return AppState.vehicles.map(function(v) {
    var maint90 = AppState.maintenanceLog
      .filter(function(m) { return m.vehicleId === v.id && m.date >= cutoffStr; })
      .reduce(function(s, m) { return s + m.cost; }, 0);
    var fuel90 = AppState.fuelLog
      .filter(function(f) { return f.vehicleId === v.id && f.date >= cutoffStr; })
      .reduce(function(s, f) { return s + f.cost; }, 0);

    var allEntries = AppState.fuelLog
      .filter(function(f) { return f.vehicleId === v.id; })
      .sort(function(a, b) { return a.odometer - b.odometer; });
    var inWindow = allEntries.filter(function(f) { return f.date >= cutoffStr; });
    var miles90 = 0;
    if (inWindow.length >= 1) {
      var startOdo = inWindow[0].odometer;
      for (var k = allEntries.length - 1; k >= 0; k--) {
        if (allEntries[k].date < cutoffStr) { startOdo = allEntries[k].odometer; break; }
      }
      miles90 = Math.max(0, inWindow[inWindow.length - 1].odometer - startOdo);
    }

    var recentMpg = AppState.fuelLog
      .filter(function(f) { return f.vehicleId === v.id && f.mpg > 0; })
      .sort(function(a, b) { return a.date < b.date ? 1 : -1; })
      .slice(0, 6);
    var mpgTrend = 'flat';
    if (recentMpg.length >= 4) {
      var newAvg = (recentMpg[0].mpg + recentMpg[1].mpg) / 2;
      var oldAvg = (recentMpg[recentMpg.length - 2].mpg + recentMpg[recentMpg.length - 1].mpg) / 2;
      if (newAvg > oldAvg * 1.04) mpgTrend = 'up';
      else if (newAvg < oldAvg * 0.96) mpgTrend = 'down';
    }
    var total90 = maint90 + fuel90;
    return {
      vehicle: v, total90: total90, miles90: miles90,
      cpm90: miles90 > 50 ? total90 / miles90 : 0,
      mpgTrend: mpgTrend,
      nextSvc: AppState.services.filter(function(s) { return s.vehicleId === v.id; })[0] || null,
    };
  });
}


/* ══════════════════════════════════════════
   RULE SERVICE COMPUTATION
══════════════════════════════════════════ */
function computeRuleService(rule, currentMileage, todayArg) {
  var today = todayArg || (function() { var d = new Date(); d.setHours(0,0,0,0); return d; })();

  var dueDate = null;
  if (rule.interval_days) {
    var baseStr = rule.last_done_date
      ? String(rule.last_done_date).slice(0, 10)
      : String(rule.created_at).slice(0, 10);
    var bp = baseStr.split('-').map(Number);
    var base = new Date(bp[0], bp[1] - 1, bp[2]);
    base.setDate(base.getDate() + rule.interval_days);
    dueDate = base.getFullYear() + '-' +
      String(base.getMonth() + 1).padStart(2, '0') + '-' +
      String(base.getDate()).padStart(2, '0');
  }

  var dueMileage = null;
  if (rule.interval_miles) {
    var baseMi = (rule.last_done_mileage != null) ? rule.last_done_mileage : currentMileage;
    dueMileage = baseMi + rule.interval_miles;
  }

  var status = 'ok', daysOverdue = 0, daysUntil = 999, milesOverdue = 0, milesUntil = 999;

  if (dueDate) {
    var dp = dueDate.split('-').map(Number);
    var dueDateObj = new Date(dp[0], dp[1] - 1, dp[2]);
    var diff = Math.round((dueDateObj - today) / 86400000);
    if      (diff < 0)   { status = 'overdue'; daysOverdue = -diff; }
    else if (diff <= 30) { status = 'warning';  daysUntil   = diff; }
    else                 {                      daysUntil   = diff; }
  }

  if (dueMileage !== null) {
    var mileDiff = dueMileage - currentMileage;
    if (mileDiff <= 0) {
      status = 'overdue'; milesOverdue = -mileDiff;
    } else if (mileDiff <= 500) {
      if (status !== 'overdue') status = 'warning';
      milesUntil = mileDiff;
    } else {
      milesUntil = mileDiff;
    }
  }

  return {
    id:           'rule' + rule.id,
    vehicleId:    'v' + rule.vehicle_id,
    name:         rule.service_type,
    dueDate:      dueDate || '',
    dueMileage:   dueMileage,
    isRule:       true,
    ruleId:       rule.id,
    intervalDays:  rule.interval_days,
    intervalMiles: rule.interval_miles,
    status, daysOverdue, daysUntil, milesOverdue, milesUntil,
  };
}

/* ══════════════════════════════════════════
   RENDER FUNCTIONS
══════════════════════════════════════════ */
function renderStats() {
  var overdueCount = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
  var lastSpend    = AppState.monthlySpend.length > 0
    ? AppState.monthlySpend[AppState.monthlySpend.length - 1].amount : 0;
  var activeVehicle = AppState.activeVehicleId ? getVehicle(AppState.activeVehicleId) : null;
  var mpgVehicles   = AppState.vehicles.filter(function(v) { return v.avgMpg > 0; });
  var avgMpg, mpgSubText;

  if (activeVehicle) {
    avgMpg     = activeVehicle.avgMpg > 0 ? activeVehicle.avgMpg.toFixed(1) : '—';
    mpgSubText = activeVehicle.year + ' ' + activeVehicle.make + ' ' + activeVehicle.model;
  } else {
    avgMpg     = mpgVehicles.length > 0
      ? (mpgVehicles.reduce(function(s, v) { return s + v.avgMpg; }, 0) / mpgVehicles.length).toFixed(1) : '—';
    mpgSubText = mpgVehicles.length > 1 ? 'Avg across ' + mpgVehicles.length + ' vehicles' : 'No fuel data yet';
  }

  function set(id, val) { var el = qs('#' + id); if (el) el.textContent = val; }
  set('statVehicles', AppState.vehicles.length);
  set('statOverdue',  overdueCount);
  set('statSpend',    '$' + lastSpend);
  set('statMpg',      avgMpg);
  var mpgSub = qs('#statMpgSub');
  if (mpgSub) mpgSub.textContent = mpgSubText;

  var badge = qs('#navOverdueBadge');
  if (badge) {
    badge.textContent  = overdueCount > 0 ? overdueCount : '';
    badge.style.display = overdueCount > 0 ? '' : 'none';
  }
}

function renderSidebarVehicles() {
  var container = qs('#sidebarVehicles');
  if (!container) return;

  var html = AppState.vehicles.map(function(v) {
    return '<div class="vehicle-chip ' + (v.id === AppState.activeVehicleId ? 'active' : '') +
      '" data-vehicle-id="' + v.id + '" role="button" tabindex="0">' +
      '<div class="vehicle-dot" style="background:' + v.color + ';"></div>' +
      '<div class="vehicle-chip-info">' +
        '<div class="vehicle-chip-name">' + v.year + ' ' + v.make + ' ' + v.model + '</div>' +
        '<div class="vehicle-chip-sub">' + formatMileage(v.odometer) + '</div>' +
      '</div></div>';
  }).join('');

  html += '<button type="button" class="add-vehicle-btn" id="addVehicleBtn">' +
    '<i class="fa-solid fa-plus"></i> Add Vehicle</button>';
  container.innerHTML = html;

  qsa('.vehicle-chip', container).forEach(function(chip) {
    chip.addEventListener('click', function() { selectVehicle(chip.dataset.vehicleId); });
    chip.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') selectVehicle(chip.dataset.vehicleId);
    });
  });

  var addBtn = qs('#addVehicleBtn');
  if (addBtn) addBtn.addEventListener('click', function() { openAddVehicleModal(); });
}

function renderServices() {
  var container = qs('#serviceList');
  if (!container) return;

  var services = AppState.activeVehicleId
    ? AppState.services.filter(function(s) { return s.vehicleId === AppState.activeVehicleId; })
    : AppState.services;

  if (services.length === 0) {
    var msg = AppState.activeVehicleId
      ? 'No upcoming services for this vehicle.'
      : 'No upcoming services. All caught up!';
    container.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  container.innerHTML = services.map(function(s) {
    var dueParts = [];
    if (s.dueDate)   dueParts.push(formatDate(s.dueDate));
    if (s.dueMileage) dueParts.push(s.dueMileage.toLocaleString() + ' mi');
    var ruleIcon = s.isRule
      ? ' <i class="fa-solid fa-rotate" style="font-size:9px;color:var(--text-muted);vertical-align:middle;" title="Recurring rule"></i>'
      : '';
    return '<div class="service-item" data-service-id="' + s.id + '" role="button" tabindex="0">' +
      '<div class="service-status ' + statusDotClass(s.status) + '"></div>' +
      '<div class="service-info">' +
        '<div class="service-name">' + s.name + ruleIcon + '</div>' +
        '<div class="service-vehicle">' + vehicleLabel(s.vehicleId) + '</div>' +
      '</div>' +
      '<div class="service-due">' +
        '<span class="service-due-date">' + (dueParts.length ? dueParts.join(' · ') : '—') + '</span>' +
        statusTag(s) +
      '</div></div>';
  }).join('');

  qsa('.service-item', container).forEach(function(item) {
    item.addEventListener('click', function() { openServiceModal(item.dataset.serviceId); });
    item.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') openServiceModal(item.dataset.serviceId);
    });
  });
}

function renderVehicleCards() {
  var container = qs('#vehicleCards');
  if (!container) return;

  if (AppState.vehicles.length === 0) {
    container.innerHTML = '<div class="empty-state">No vehicles yet.<br>Click "Add Vehicle" to get started.</div>';
    return;
  }

  container.innerHTML = AppState.vehicles.map(function(v) {
    var isActive = v.id === AppState.activeVehicleId;
    var color = v.color || 'var(--accent)';
    return '<div class="vehicle-card ' + (isActive ? 'active' : '') +
      '" data-vehicle-id="' + v.id + '" role="button" tabindex="0">' +
      '<div class="vehicle-card-banner" style="--vc:' + color + '">' +
        '<i class="fa-solid ' + vehicleTypeIcon(v.type) + ' vehicle-banner-icon"></i>' +
        '<div class="vehicle-card-banner-info">' +
          '<div class="vehicle-make-model">' + v.make + ' ' + v.model + '</div>' +
          '<div class="vehicle-year"><i class="fa-solid ' + vehicleTypeIcon(v.type) + '" style="font-size:10px;margin-right:4px;"></i>' + v.year + ' · ' + v.type + '</div>' +
        '</div>' +
        '<span class="vehicle-health ' + healthClass(v.health) + '">' + v.health.toUpperCase() + '</span>' +
      '</div>' +
      '<div class="vehicle-meta">' +
        '<div class="vehicle-meta-item"><div class="vehicle-meta-key">Odometer</div>' +
          '<div class="vehicle-meta-val">' + formatMileage(v.odometer) + '</div></div>' +
        '<div class="vehicle-meta-item"><div class="vehicle-meta-key">Avg MPG</div>' +
          '<div class="vehicle-meta-val" style="color:' + (v.avgMpg > 0 ? mpgColor(v.avgMpg) : 'inherit') + '">' + (v.avgMpg > 0 ? v.avgMpg : '—') + '</div></div>' +
        '<div class="vehicle-meta-item"><div class="vehicle-meta-key">Last Service</div>' +
          '<div class="vehicle-meta-val">' + (v.lastService ? formatDate(v.lastService) : 'None') + '</div></div>' +
        '<div class="vehicle-meta-item"><div class="vehicle-meta-key">Open Items</div>' +
          openItemsHTML(v) + '</div>' +
      '</div>' +
      '<div class="vehicle-card-actions">' +
        '<button type="button" class="btn btn-secondary vehicle-edit-btn" data-vehicle-id="' + v.id + '">' +
          '<i class="fa-solid fa-pen"></i> Edit</button>' +
        '<button type="button" class="btn btn-danger vehicle-delete-btn" data-vehicle-id="' + v.id + '">' +
          '<i class="fa-solid fa-trash"></i> Delete</button>' +
      '</div>' +
      '</div>';
  }).join('');

  qsa('.vehicle-card', container).forEach(function(card) {
    card.addEventListener('click', function() { selectVehicle(card.dataset.vehicleId); });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') selectVehicle(card.dataset.vehicleId);
    });
  });

  qsa('.vehicle-edit-btn', container).forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      openEditVehicleModal(btn.dataset.vehicleId);
    });
  });

  qsa('.vehicle-delete-btn', container).forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      confirmDeleteVehicle(btn.dataset.vehicleId);
    });
  });
}

function renderCostChart() {
  var container = qs('#costBars');
  if (!container) return;

  var amounts   = AppState.monthlySpend.map(function(m){ return m.amount; });
  var max       = Math.max.apply(null, amounts.concat([1]));
  var lastMonth = AppState.monthlySpend[AppState.monthlySpend.length - 1];

  container.innerHTML = AppState.monthlySpend.map(function(m) {
    var pct = Math.round((m.amount / max) * 100);
    var hi  = (m === lastMonth);
    return '<div class="cost-bar-wrap">' +
      '<div class="cost-bar-track">' +
        '<div class="cost-bar-fill ' + (hi ? 'highlight' : '') +
          '" style="height:0%;" data-target="' + pct + '%" title="' + m.month + ': $' + m.amount + '"></div>' +
      '</div>' +
      '<span class="cost-bar-label" ' + (hi ? 'style="color:var(--accent)"' : '') + '>' + m.month + '</span>' +
    '</div>';
  }).join('');

  requestAnimationFrame(function() {
    setTimeout(function() {
      qsa('.cost-bar-fill', container).forEach(function(bar) {
        bar.style.height = bar.dataset.target;
      });
    }, 200);
  });

  var ytd   = amounts.reduce(function(s, n){ return s + n; }, 0);
  var ytdEl = qs('#ytdTotal');
  if (ytdEl) ytdEl.textContent = '$' + ytd.toLocaleString();
}

/* ══════════════════════════════════════════
   ANALYTICS RENDERING
══════════════════════════════════════════ */
function buildSvgPath(values, W, H, color) {
  var pad = 10;
  var validVals = values.filter(function(v) { return v > 0; });
  if (validVals.length < 2) {
    return '<text x="' + Math.round(W / 2) + '" y="' + Math.round(H / 2 + 4) + '" ' +
      'text-anchor="middle" fill="var(--text-muted)" font-size="11" ' +
      'font-family="JetBrains Mono,monospace">Not enough data yet</text>';
  }
  var minV = Math.min.apply(null, validVals) * 0.92;
  var maxV = Math.max.apply(null, validVals) * 1.08;
  var vRange = maxV - minV || 1;
  var n = values.length;
  var xStep = n > 1 ? (W - pad * 2) / (n - 1) : 0;

  var coords = values.map(function(v, i) {
    return {
      x: pad + i * xStep,
      y: v > 0 ? (H - pad) - ((v - minV) / vRange) * (H - pad * 2) : null,
    };
  });

  var d = '', prevNull = true;
  coords.forEach(function(c) {
    if (c.y !== null) {
      d += (prevNull ? 'M' : 'L') + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' ';
      prevNull = false;
    } else { prevNull = true; }
  });

  var first = coords.find(function(c) { return c.y !== null; });
  var last  = coords.slice().reverse().find(function(c) { return c.y !== null; });
  var areaD = d + 'L' + last.x.toFixed(1) + ' ' + (H - pad) + ' L' + first.x.toFixed(1) + ' ' + (H - pad) + ' Z';
  var gid   = 'ag' + (++_analyticsGradCounter);

  return '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>' +
    '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
    '</linearGradient></defs>' +
    '<path d="' + areaD + '" fill="url(#' + gid + ')"/>' +
    '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="4" fill="' + color + '"/>';
}

function statCell(val, key) {
  return '<div class="analytics-stat">' +
    '<div class="analytics-stat-val">' + val + '</div>' +
    '<div class="analytics-stat-key">' + key + '</div>' +
  '</div>';
}

function renderCostPerMileSection(data) {
  var W = 560, H = 100;
  var cpmVals   = data.map(function(d) { return d.cpm; });
  var validData = data.filter(function(d) { return d.cpm > 0; });
  var avgCpm    = validData.length > 0
    ? validData.reduce(function(s, d) { return s + d.cpm; }, 0) / validData.length : 0;
  var totalMiles = data.reduce(function(s, d) { return s + d.miles; }, 0);
  var totalCost  = data.reduce(function(s, d) { return s + d.total; }, 0);
  var fuelTotal  = data.reduce(function(s, d) { return s + d.fuelCost; }, 0);
  var fuelPct    = totalCost > 0 ? Math.round(fuelTotal / totalCost * 100) : 0;

  var recent3 = validData.slice(-3), older3 = validData.slice(-6, -3);
  var trendHTML = '—';
  if (recent3.length >= 2 && older3.length >= 2) {
    var rAvg = recent3.reduce(function(s, d) { return s + d.cpm; }, 0) / recent3.length;
    var oAvg = older3.reduce(function(s, d) { return s + d.cpm; }, 0) / older3.length;
    var pct  = (rAvg - oAvg) / oAvg * 100;
    var col  = pct <= 0 ? 'var(--green)' : 'var(--red)';
    trendHTML = '<span style="color:' + col + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '% vs prior</span>';
  }

  var pad = 10, xStep = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  var svgInner = buildSvgPath(cpmVals, W, H, 'var(--accent)');

  if (validData.length >= 2) {
    var validVals2 = cpmVals.filter(function(v) { return v > 0; });
    var minV2 = Math.min.apply(null, validVals2) * 0.92;
    var maxV2 = Math.max.apply(null, validVals2) * 1.08;
    var vRange2 = maxV2 - minV2 || 1;
    data.forEach(function(d, i) {
      if (d.maintCost > 30 && d.cpm > 0) {
        var cx = (pad + i * xStep).toFixed(1);
        var cy = ((H - pad) - ((d.cpm - minV2) / vRange2) * (H - pad * 2)).toFixed(1);
        var r  = Math.min(9, Math.max(3, Math.sqrt(d.maintCost / 15))).toFixed(1);
        svgInner += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
          '" fill="var(--red)" opacity="0.55" />';
      }
    });
  }

  var xAxis = data.map(function(d, i) {
    if (i % 2 !== 0) return '';
    return '<text x="' + (pad + i * xStep).toFixed(1) + '" y="' + (H + 15) + '" ' +
      'text-anchor="middle" fill="var(--text-muted)" font-size="9" ' +
      'font-family="JetBrains Mono,monospace">' + d.label + '</text>';
  }).join('');

  var chartDisplay = validData.length < 2 ? 'none' : 'block';
  var noDataMsg = validData.length < 2
    ? '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:8px 0 4px;">Log fuel entries with odometer readings to track cost-per-mile over time.</div>'
    : '';

  return '<div class="analytics-card">' +
    '<div class="analytics-card-header">' +
      '<span class="analytics-card-title"><i class="fa-solid fa-chart-line" style="margin-right:6px;font-size:12px;"></i>True Operating Cost</span>' +
      '<span class="analytics-card-badge">COST / MILE · 12 MO</span>' +
    '</div>' +
    '<div class="analytics-card-body">' +
      '<div class="analytics-stat-row">' +
        statCell(avgCpm > 0 ? '$' + avgCpm.toFixed(2) : '—', 'AVG COST/MI') +
        statCell(totalMiles > 0 ? totalMiles.toLocaleString() + ' mi' : '—', 'MILES TRACKED') +
        statCell(fuelPct + '%', 'FUEL SHARE') +
        statCell(trendHTML, '3-MO TREND') +
      '</div>' +
      '<div class="analytics-chart-wrap">' +
        noDataMsg +
        '<svg viewBox="0 0 ' + W + ' ' + (H + 20) + '" preserveAspectRatio="none" ' +
          'style="width:100%;height:130px;display:' + chartDisplay + ';">' +
          svgInner + xAxis +
        '</svg>' +
      '</div>' +
      '<div class="analytics-chart-legend">' +
        '<span><span class="legend-dot" style="background:var(--accent);"></span>Cost / mile</span>' +
        '<span><span class="legend-dot" style="background:var(--red);opacity:.55;"></span>Maintenance event (size = cost)</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderSpendingDNASection(data) {
  var categories = [
    { key: 'fuel',    label: 'Fuel',    color: 'var(--accent)' },
    { key: 'routine', label: 'Routine', color: 'var(--blue)'   },
    { key: 'wear',    label: 'Wear',    color: '#a07848'        },
    { key: 'repair',  label: 'Repairs', color: 'var(--red)'    },
  ];
  var maxTotal = 0;
  data.forEach(function(d) {
    var t = d.fuel + d.routine + d.wear + d.repair;
    if (t > maxTotal) maxTotal = t;
  });
  if (maxTotal === 0) maxTotal = 1;

  var ytd = {};
  categories.forEach(function(c) { ytd[c.key] = 0; });
  data.forEach(function(d) { categories.forEach(function(c) { ytd[c.key] += d[c.key]; }); });
  var ytdGrand = categories.reduce(function(s, c) { return s + ytd[c.key]; }, 0);

  var barsHTML = data.map(function(d) {
    var total = d.fuel + d.routine + d.wear + d.repair;
    var hPct  = (total / maxTotal * 100).toFixed(1);
    var segs  = categories.map(function(c) {
      return d[c.key] > 0
        ? '<div style="flex:' + d[c.key].toFixed(2) + ';background:' + c.color + ';" ' +
            'title="' + c.label + ': $' + d[c.key].toFixed(0) + '"></div>'
        : '';
    }).join('');
    return '<div class="dna-bar-col">' +
      '<div class="dna-bar-track">' +
        '<div class="dna-bar-fill" style="height:' + hPct + '%;">' + segs + '</div>' +
      '</div>' +
      '<div class="dna-bar-label">' + d.label + '</div>' +
      '<div class="dna-bar-total">' + (total > 0 ? '$' + Math.round(total) : '—') + '</div>' +
    '</div>';
  }).join('');

  var legendHTML = categories.map(function(c) {
    var pct = ytdGrand > 0 ? Math.round(ytd[c.key] / ytdGrand * 100) : 0;
    return '<div class="dna-legend-item">' +
      '<div class="dna-legend-dot" style="background:' + c.color + ';"></div>' +
      '<div>' +
        '<div class="dna-legend-val">' + (ytd[c.key] > 0 ? '$' + Math.round(ytd[c.key]) : '—') + '</div>' +
        '<div class="dna-legend-key">' + c.label.toUpperCase() + ' · ' + pct + '%</div>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="analytics-card">' +
    '<div class="analytics-card-header">' +
      '<span class="analytics-card-title"><i class="fa-solid fa-layer-group" style="margin-right:6px;font-size:12px;"></i>Spending DNA</span>' +
      '<span class="analytics-card-badge">6-MONTH BREAKDOWN</span>' +
    '</div>' +
    '<div class="analytics-card-body">' +
      '<div class="dna-chart">' +
        '<div class="dna-bars">' + barsHTML + '</div>' +
        '<div class="dna-legend">' + legendHTML + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderFuelIntelSection(data) {
  if (data.length < 3) {
    return '<div class="analytics-card">' +
      '<div class="analytics-card-header">' +
        '<span class="analytics-card-title"><i class="fa-solid fa-gas-pump" style="margin-right:6px;font-size:12px;"></i>Fuel Intelligence</span>' +
        '<span class="analytics-card-badge">EFFICIENCY ANALYSIS</span>' +
      '</div>' +
      '<div class="analytics-card-body">' +
        '<div class="empty-state" style="padding:30px 0;">Log at least 3 fill-ups with odometer readings to unlock fuel intelligence.</div>' +
      '</div>' +
    '</div>';
  }

  var W = 160, H = 54;
  var latest = data[data.length - 1];
  var prev   = data.length >= 4 ? data[data.length - 4] : data[0];

  function trendArrow(cur, old, lowerIsBetter) {
    if (!old) return '';
    var pct = (cur - old) / Math.abs(old);
    if (Math.abs(pct) < 0.02) return '<span style="color:var(--text-muted)">→ flat</span>';
    var isUp   = pct > 0;
    var isGood = lowerIsBetter ? !isUp : isUp;
    return '<span style="color:' + (isGood ? 'var(--green)' : 'var(--red)') + '">' +
      (isUp ? '▲' : '▼') + ' ' + (Math.abs(pct) * 100).toFixed(1) + '%</span>';
  }

  function sparkCard(label, values, curVal, trendHTML, color, fmt) {
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" ' +
      'style="width:100%;height:' + H + 'px;">' +
      buildSvgPath(values, W, H, color) + '</svg>';
    return '<div class="spark-card">' +
      '<div class="spark-label">' + label + '</div>' +
      '<div class="spark-val" style="color:' + color + '">' + fmt(curVal) + '</div>' +
      '<div class="spark-trend">' + trendHTML + '</div>' +
      '<div class="spark-chart">' + svg + '</div>' +
    '</div>';
  }

  var mpgVals  = data.map(function(d) { return d.mpg; });
  var ppgVals  = data.map(function(d) { return d.ppg; });
  var c100Vals = data.map(function(d) { return d.c100; });

  var insight = '';
  if (data.length >= 6) {
    var half   = Math.floor(data.length / 2);
    var mpgNew = mpgVals.slice(-half).reduce(function(s, v) { return s + v; }, 0) / half;
    var mpgOld = mpgVals.slice(0, half).reduce(function(s, v) { return s + v; }, 0) / half;
    var ppgNew = ppgVals.slice(-half).reduce(function(s, v) { return s + v; }, 0) / half;
    var ppgOld = ppgVals.slice(0, half).reduce(function(s, v) { return s + v; }, 0) / half;
    var mpgUp  = mpgNew > mpgOld * 1.03, ppgUp = ppgNew > ppgOld * 1.03;
    if      (!mpgUp &&  ppgUp) insight = 'Heads up — efficiency is down and fuel prices are up. Cost per 100 mi is increasing.';
    else if ( mpgUp && !ppgUp) insight = 'Great — efficiency is up and prices are down. Your fuel cost per 100 mi is improving.';
    else if (!mpgUp)           insight = 'Efficiency trending down. A tune-up or tire pressure check may help.';
    else if ( ppgUp)           insight = 'Fuel prices are climbing. Your improved efficiency is helping offset the increase.';
  }

  return '<div class="analytics-card">' +
    '<div class="analytics-card-header">' +
      '<span class="analytics-card-title"><i class="fa-solid fa-gas-pump" style="margin-right:6px;font-size:12px;"></i>Fuel Intelligence</span>' +
      '<span class="analytics-card-badge">EFFICIENCY ANALYSIS</span>' +
    '</div>' +
    '<div class="analytics-card-body">' +
      '<div class="spark-row">' +
        sparkCard('AVG MPG', mpgVals, latest.mpg,
          trendArrow(latest.mpg, prev.mpg, false), 'var(--accent)',
          function(v) { return v.toFixed(1); }) +
        sparkCard('PRICE / GAL', ppgVals, latest.ppg,
          trendArrow(latest.ppg, prev.ppg, true), 'var(--blue)',
          function(v) { return '$' + v.toFixed(3); }) +
        sparkCard('COST / 100MI', c100Vals, latest.c100,
          trendArrow(latest.c100, prev.c100, true), 'var(--red)',
          function(v) { return '$' + v.toFixed(2); }) +
      '</div>' +
      (insight ? '<div class="analytics-insight"><i class="fa-solid fa-circle-info" style="margin-right:6px;"></i>' + insight + '</div>' : '') +
    '</div>' +
  '</div>';
}

function renderFleetScorecardSection(scorecard) {
  if (scorecard.length === 0) {
    return '<div class="analytics-card">' +
      '<div class="analytics-card-header">' +
        '<span class="analytics-card-title"><i class="fa-solid fa-shield-halved" style="margin-right:6px;font-size:12px;"></i>Fleet Health Scorecard</span>' +
      '</div>' +
      '<div class="analytics-card-body"><div class="empty-state">No vehicles registered.</div></div>' +
    '</div>';
  }

  var worstIdx = -1, worstCpm = 0;
  scorecard.forEach(function(s, i) {
    if (s.cpm90 > worstCpm) { worstCpm = s.cpm90; worstIdx = i; }
  });

  var cardsHTML = scorecard.map(function(s, i) {
    var v = s.vehicle;
    var isWorst   = scorecard.length > 1 && i === worstIdx && s.cpm90 > 0;
    var mpgArrow  = { up: '▲', down: '▼', flat: '→' }[s.mpgTrend] || '→';
    var mpgAColor = { up: 'var(--green)', down: 'var(--red)', flat: 'var(--text-muted)' }[s.mpgTrend];

    var nextHTML;
    if (s.nextSvc) {
      var sc      = s.nextSvc.status;
      var scColor = sc === 'overdue' ? 'var(--red)' : sc === 'warning' ? 'var(--accent)' : 'var(--text-muted)';
      var scLabel = sc === 'overdue' ? 'OVERDUE' : s.nextSvc.dueDate ? formatDate(s.nextSvc.dueDate) : 'Due soon';
      nextHTML = '<span style="font-size:12px;">' + s.nextSvc.name + '</span><br>' +
        '<span style="font-family:var(--font-mono);font-size:9px;color:' + scColor + ';">' + scLabel + '</span>';
    } else {
      nextHTML = '<span style="color:var(--green);">All clear</span>';
    }

    return '<div class="scorecard-card' + (isWorst ? ' scorecard-worst' : '') + '">' +
      '<div class="scorecard-vehicle-header" style="border-left:3px solid ' + v.color + ';">' +
        '<div>' +
          '<div class="scorecard-name">' + v.year + ' ' + v.make + ' ' + v.model + '</div>' +
          '<span class="vehicle-health ' + healthClass(v.health) + '" style="font-size:9px;padding:2px 5px;">' +
            v.health.toUpperCase() + '</span>' +
        '</div>' +
        (isWorst ? '<span class="scorecard-flag">HIGHEST COST/MI</span>' : '') +
      '</div>' +
      '<div class="scorecard-metrics">' +
        '<div class="scorecard-metric">' +
          '<div class="scorecard-metric-val">' + (s.total90 > 0 ? '$' + Math.round(s.total90) : '—') + '</div>' +
          '<div class="scorecard-metric-key">90-DAY SPEND</div>' +
        '</div>' +
        '<div class="scorecard-metric">' +
          '<div class="scorecard-metric-val">' + (s.cpm90 > 0 ? '$' + s.cpm90.toFixed(2) : '—') + '</div>' +
          '<div class="scorecard-metric-key">COST / MI</div>' +
        '</div>' +
        '<div class="scorecard-metric">' +
          '<div class="scorecard-metric-val">' +
            (v.avgMpg > 0
              ? '<span style="color:' + mpgColor(v.avgMpg) + '">' + v.avgMpg + '</span>' +
                ' <small style="color:' + mpgAColor + ';font-size:10px;">' + mpgArrow + '</small>'
              : '—') +
          '</div>' +
          '<div class="scorecard-metric-key">AVG MPG</div>' +
        '</div>' +
        '<div class="scorecard-metric">' +
          '<div class="scorecard-metric-val">' + nextHTML + '</div>' +
          '<div class="scorecard-metric-key">NEXT SERVICE</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="analytics-card">' +
    '<div class="analytics-card-header">' +
      '<span class="analytics-card-title"><i class="fa-solid fa-shield-halved" style="margin-right:6px;font-size:12px;"></i>Fleet Health Scorecard</span>' +
      '<span class="analytics-card-badge">90-DAY COMPARISON</span>' +
    '</div>' +
    '<div class="analytics-card-body">' +
      '<div class="scorecard-list">' + cardsHTML + '</div>' +
    '</div>' +
  '</div>';
}

function renderAnalytics() {
  var panel = qs('#panelAnalytics');
  if (!panel) return;

  var cpmData   = computeCostPerMile();
  var dnaData   = computeSpendingDNA();
  var fuelIntel = computeFuelIntelligence();
  var scorecard = computeFleetScorecard();
  var today     = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  panel.className = 'panel';
  panel.innerHTML =
    '<div class="panel-header">' +
      '<div class="panel-title"><span class="dot"></span> Performance Dashboard</div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">Updated ' + today + '</div>' +
    '</div>' +
    '<div class="analytics-body">' +
      '<div class="analytics-grid">' +
        renderCostPerMileSection(cpmData) +
        renderSpendingDNASection(dnaData) +
      '</div>' +
      '<div class="analytics-grid" style="margin-top:16px;">' +
        renderFuelIntelSection(fuelIntel) +
        renderFleetScorecardSection(scorecard) +
      '</div>' +
    '</div>';
}


function renderFuelLog() {
  var container = qs('#fuelList');
  if (!container) return;

  var log = AppState.activeVehicleId
    ? AppState.fuelLog.filter(function(f) { return f.vehicleId === AppState.activeVehicleId; })
    : AppState.fuelLog;
  var displayLog = (_currentView !== 'fuel') ? log.slice(0, 5) : log;

  if (displayLog.length === 0) {
    var msg = AppState.activeVehicleId ? 'No fuel entries for this vehicle.' : 'No fuel entries yet.';
    container.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  container.innerHTML = displayLog.map(function(f) {
    return '<div class="fuel-entry">' +
      '<div class="fuel-icon"><i class="fa-solid fa-gas-pump"></i></div>' +
      '<div class="fuel-info">' +
        '<div class="fuel-vehicle">' + vehicleLabel(f.vehicleId) + '</div>' +
        '<div class="fuel-date">' + formatDate(f.date) + (f.station ? ' · ' + f.station : '') + '</div>' +
      '</div>' +
      '<div class="fuel-stats">' +
        '<div class="fuel-stat-item"><span class="fuel-stat-val">' + f.gallons + ' gal</span>' +
          '<span class="fuel-stat-key">VOLUME</span></div>' +
        '<div class="fuel-stat-item"><span class="fuel-stat-val">' + formatCurrency(f.cost) + '</span>' +
          '<span class="fuel-stat-key">COST</span></div>' +
        '<div class="fuel-stat-item"><span class="fuel-stat-val" style="color:' +
          mpgColor(f.mpg) + '">' + (f.mpg > 0 ? f.mpg : '—') + '</span>' +
          '<span class="fuel-stat-key">MPG</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:4px;align-items:center;margin-left:8px;">' +
        '<button type="button" class="fuel-edit-btn" style="font-size:11px;padding:4px 8px;background:var(--surface-2);color:var(--text);border:1px solid var(--border-bright);border-radius:var(--radius);cursor:pointer;" data-id="' + f.id + '"><i class="fa-solid fa-pen"></i></button>' +
        '<button type="button" class="fuel-delete-btn" style="font-size:11px;padding:4px 8px;background:rgba(224,92,92,0.15);color:var(--red);border:1px solid var(--red);border-radius:var(--radius);cursor:pointer;" data-id="' + f.id + '"><i class="fa-solid fa-trash"></i></button>' +
      '</div>' +
    '</div>';
  }).join('');

  if (_currentView !== 'fuel' && log.length > 5) {
    container.insertAdjacentHTML('beforeend', '<div style="text-align:center;padding:8px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">+ ' + (log.length - 5) + ' more — <a href="#" data-nav="fuel" style="color:var(--accent);">View all</a></div>');
  }

  qsa('.fuel-edit-btn', container).forEach(function(btn) {
    btn.addEventListener('click', function() { openEditFuelModal(btn.dataset.id); });
  });
  qsa('.fuel-delete-btn', container).forEach(function(btn) {
    btn.addEventListener('click', function() { confirmDeleteFuel(btn.dataset.id); });
  });
}

function renderMaintenanceLog() {
  var tbody = qs('#maintenanceTbody');
  if (!tbody) return;

  var log = AppState.activeVehicleId
    ? AppState.maintenanceLog.filter(function(m) { return m.vehicleId === AppState.activeVehicleId; })
    : AppState.maintenanceLog;

  if (log.length === 0) {
    var msg = AppState.activeVehicleId
      ? 'No maintenance records for this vehicle.'
      : 'No maintenance records yet.';
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">' + msg + '</td></tr>';
    return;
  }

  tbody.innerHTML = log.map(function(m) {
    return '<tr>' +
      '<td class="td-mono">'    + formatDate(m.date)        + '</td>' +
      '<td class="td-name">'    + m.service                 + '</td>' +
      '<td class="td-mono">'    + vehicleLabel(m.vehicleId) + '</td>' +
      '<td class="td-mileage">' + formatMileage(m.mileage)  + '</td>' +
      '<td>'                    + (m.location || '—')       + '</td>' +
      '<td class="td-cost">'    + formatCurrency(m.cost)    + '</td>' +
      '<td>'                    + (m.notes || '')           + '</td>' +
      '<td style="white-space:nowrap;">' +
  '<button type="button" class="maint-edit-btn" ' +
    'style="font-size:11px;padding:4px 8px;margin-right:4px;background:var(--surface-2);color:var(--text);border:1px solid var(--border-bright);border-radius:var(--radius);cursor:pointer;" data-id="' + m.id + '">' +
    '<i class="fa-solid fa-pen"></i></button>' +
  '<button type="button" class="maint-delete-btn" ' +
    'style="font-size:11px;padding:4px 8px;background:rgba(224,92,92,0.15);color:var(--red);border:1px solid var(--red);border-radius:var(--radius);cursor:pointer;" data-id="' + m.id + '">' +
    '<i class="fa-solid fa-trash"></i></button>' +
'</td>' +
    '</tr>';
  }).join('');

  qsa('.maint-edit-btn', tbody).forEach(function(btn) {
    btn.addEventListener('click', function() { openEditMaintenanceModal(btn.dataset.id); });
  });

  qsa('.maint-delete-btn', tbody).forEach(function(btn) {
    btn.addEventListener('click', function() { confirmDeleteMaintenance(btn.dataset.id); });
  });
}


/* ══════════════════════════════════════════
   VEHICLE SELECTION
══════════════════════════════════════════ */
function selectVehicle(id) {
  AppState.activeVehicleId = id;
  renderSidebarVehicles();
  renderVehicleCards();
  renderServices();
  renderMaintenanceLog();
  renderFuelLog();
  renderStats();
}


/* ══════════════════════════════════════════
   MODAL SYSTEM
══════════════════════════════════════════ */
function createModal(title, bodyHTML, actions) {
  actions = actions || [];

  var existing = qs('#appModal');
  if (existing) existing.remove();

  var actionsHTML = actions.map(function(a) {
    return '<button type="button" class="btn ' + a.cls + '" data-modal-action="' + a.action + '">' + a.label + '</button>';
  }).join('');

  var modal = document.createElement('div');
  modal.id        = 'appModal';
  modal.className = 'modal-overlay';
  modal.innerHTML =
    '<div class="modal-box" role="dialog" aria-modal="true">' +
      '<div class="modal-header">' +
        '<span class="modal-title">' + title + '</span>' +
        '<button type="button" class="modal-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' + bodyHTML + '</div>' +
      (actionsHTML ? '<div class="modal-footer">' + actionsHTML + '</div>' : '') +
    '</div>';

  document.body.appendChild(modal);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() { modal.classList.add('modal-visible'); });
  });

  qs('.modal-close', modal).addEventListener('click', closeModal);
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });

  var onKey = function(e) { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  modal._cleanup = function() { document.removeEventListener('keydown', onKey); };

  return modal;
}

function closeModal() {
  var modal = qs('#appModal');
  if (!modal) return;
  if (modal._cleanup) modal._cleanup();
  modal.classList.remove('modal-visible');
  setTimeout(function() { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 220);
}


/* ── Service Detail Modal ── */
function openServiceModal(serviceId) {
  var s = AppState.services.find(function(x){ return x.id === serviceId; });
  if (!s) return;
  var v = getVehicle(s.vehicleId);

  var ruleInfoHTML = '';
  if (s.isRule) {
    var parts = [];
    if (s.intervalDays)  parts.push('Every ' + s.intervalDays + ' days');
    if (s.intervalMiles) parts.push('Every ' + s.intervalMiles.toLocaleString() + ' mi');
    ruleInfoHTML = '<div class="modal-detail-item"><span class="modal-detail-key">RULE INTERVAL</span>' +
      '<span class="modal-detail-val">' + parts.join(' / ') + '</span></div>';
  }

  var actions = [{ label: 'Log as Completed', cls: 'btn-primary', action: 'complete' }];
  if (s.isRule) {
    actions.push({ label: 'Edit Rule',   cls: 'btn-secondary', action: 'edit-rule'   });
    actions.push({ label: 'Delete Rule', cls: 'btn-danger',    action: 'delete-rule' });
  }
  actions.push({ label: 'Dismiss', cls: 'btn-secondary', action: 'dismiss' });

  var modal = createModal(s.isRule ? 'Recurring Rule' : 'Service Reminder',
    '<div class="modal-detail-grid">' +
      '<div class="modal-detail-item"><span class="modal-detail-key">SERVICE</span>' +
        '<span class="modal-detail-val">' + s.name + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">VEHICLE</span>' +
        '<span class="modal-detail-val">' + (v ? v.year + ' ' + v.make + ' ' + v.model : '—') + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">DUE DATE</span>' +
        '<span class="modal-detail-val">' + (s.dueDate ? formatDate(s.dueDate) : '—') + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">DUE MILEAGE</span>' +
        '<span class="modal-detail-val">' + (s.dueMileage ? s.dueMileage.toLocaleString() + ' mi' : '—') + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">STATUS</span>' +
        statusTag(s) + '</div>' +
      (v ? '<div class="modal-detail-item"><span class="modal-detail-key">CURRENT MILEAGE</span>' +
        '<span class="modal-detail-val">' + formatMileage(v.odometer) + '</span></div>' : '') +
      ruleInfoHTML +
    '</div>',
    actions
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      var action = btn.dataset.modalAction;
      if (action === 'complete') {
        if (s.isRule) await logRuleComplete(serviceId);
        else          await logServiceComplete(serviceId);
      } else if (action === 'edit-rule') {
        closeModal();
        openEditRuleModal(serviceId);
        return;
      } else if (action === 'delete-rule') {
        await deleteRule(serviceId);
      }
      closeModal();
    });
  });
}

async function logServiceComplete(serviceId) {
  var idx = AppState.services.findIndex(function(s){ return s.id === serviceId; });
  if (idx === -1) return;

  var s               = AppState.services[idx];
  var v               = getVehicle(s.vehicleId);
  var reminderId      = parseInt(s.id.slice(1));
  var numericVehicleId = parseInt(s.vehicleId.slice(1));

  var entry = {
    vehicle_id:   numericVehicleId,
    service_type: s.name,
    date:         new Date().toISOString().slice(0, 10),
    mileage:      v ? v.odometer : 0,
    cost:         0,
    location:     'Self / Unknown',
    notes:        'Marked complete from dashboard',
  };

  try {
    var result = await DataModel.addMaintenance(entry);
    await DataModel.completeReminder(reminderId);

    AppState.maintenanceLog.unshift({
      id:        'm' + result.id,
      vehicleId: s.vehicleId,
      date:      entry.date,
      service:   s.name,
      mileage:   entry.mileage,
      location:  entry.location,
      cost:      0,
      notes:     entry.notes,
    });
    AppState.services.splice(idx, 1);

    recomputeVehicleHealth();
    renderServices();
    renderStats();
    renderMaintenanceLog();
    computeMonthlySpend();
    renderCostChart();
    showToast('"' + s.name + '" marked as completed.', 'success');
  } catch (err) {
    showToast('Error saving service: ' + err.message, 'error');
  }
}

async function logRuleComplete(serviceId) {
  var svc = AppState.services.find(function(s){ return s.id === serviceId; });
  if (!svc || !svc.isRule) return;

  var v            = getVehicle(svc.vehicleId);
  var numericVid   = parseInt(svc.vehicleId.slice(1));
  var today        = new Date().toISOString().slice(0, 10);
  var currentMi    = v ? v.odometer : 0;

  try {
    var result = await DataModel.addMaintenance({
      vehicle_id:   numericVid,
      service_type: svc.name,
      date:         today,
      mileage:      currentMi,
      cost:         0,
      location:     'Self / Unknown',
      notes:        'Marked complete from schedule',
    });
    await DataModel.updateRuleComplete(svc.ruleId, {
      last_done_date:    today,
      last_done_mileage: currentMi,
    });

    AppState.maintenanceLog.unshift({
      id: 'm' + result.id, vehicleId: svc.vehicleId,
      date: today, service: svc.name,
      mileage: currentMi, location: 'Self / Unknown', cost: 0,
      notes: 'Marked complete from schedule',
    });

    // Update the rule in AppState and recompute its service item
    var rule = AppState.rules.find(function(r){ return r.id === svc.ruleId; });
    if (rule) {
      rule.last_done_date    = today;
      rule.last_done_mileage = currentMi;
      var idx = AppState.services.findIndex(function(s){ return s.id === serviceId; });
      if (idx !== -1) {
        var newSvc = computeRuleService(rule, currentMi);
        AppState.services.splice(idx, 1, newSvc);
      }
    }

    // Re-sort services
    AppState.services.sort(function(a, b) {
      var order = { overdue: 0, warning: 1, ok: 2 };
      return (order[a.status] || 2) - (order[b.status] || 2);
    });

    recomputeVehicleHealth();
    renderServices();
    renderStats();
    renderMaintenanceLog();
    computeMonthlySpend();
    renderCostChart();

    var nextDate = newSvc && newSvc.dueDate ? ' Next due: ' + formatDate(newSvc.dueDate) : '';
    showToast('"' + svc.name + '" marked as completed.' + nextDate, 'success');
  } catch (err) {
    showToast('Error saving service: ' + err.message, 'error');
  }
}

async function deleteRule(serviceId) {
  var svc = AppState.services.find(function(s){ return s.id === serviceId; });
  if (!svc || !svc.isRule) return;

  try {
    await DataModel.deleteRule(svc.ruleId);
    AppState.services = AppState.services.filter(function(s){ return s.id !== serviceId; });
    AppState.rules    = AppState.rules.filter(function(r){ return r.id !== svc.ruleId; });

    recomputeVehicleHealth();
    renderServices();
    renderStats();
    renderVehicleCards();
    showToast('Rule "' + svc.name + '" deleted.', 'success');
  } catch (err) {
    showToast('Error deleting rule: ' + err.message, 'error');
  }
}

function recomputeVehicleHealth() {
  AppState.vehicles.forEach(function(v) {
    var vr      = AppState.services.filter(function(s) { return s.vehicleId === v.id; });
    var overdue = vr.filter(function(s) { return s.status === 'overdue'; }).length;
    var warning = vr.filter(function(s) { return s.status === 'warning'; }).length;
    v.openItems = overdue + warning;

    if      (overdue >= 2) { v.health = 'poor'; v.openItemsStatus = 'overdue'; }
    else if (overdue > 0)  { v.health = 'fair'; v.openItemsStatus = 'overdue'; }
    else if (warning > 0)  { v.health = 'fair'; v.openItemsStatus = 'upcoming'; }
    else                   { v.health = 'good'; v.openItemsStatus = 'ok'; }
  });
}


/* ── Add Service Modal ── */
function openAddServiceModal() {
  if (AppState.vehicles.length === 0) {
    showToast('Add a vehicle first before logging a service.', 'info');
    return;
  }
  var activeId = AppState.activeVehicleId;
  var opts = AppState.vehicles.map(function(v) {
    var sel = (v.id === activeId) ? ' selected' : '';
    return '<option value="' + v.id + '"' + sel + '>' + v.year + ' ' + v.make + ' ' + v.model + '</option>';
  }).join('');

  var modal = createModal('Log New Service',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label" for="fsVehicle">Vehicle</label>' +
        '<select id="fsVehicle" class="form-control">' + (activeId ? '' : '<option value="" disabled selected>Select a vehicle…</option>') + opts + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="fsService">Service Type</label>' +
        '<input id="fsService" class="form-control" type="text" placeholder="e.g. Oil Change" list="fsServiceList" autocomplete="off" />' +
        '<datalist id="fsServiceList">' +
          '<option value="Oil Change" />' +
          '<option value="Tire Rotation" />' +
          '<option value="Tire Replacement" />' +
          '<option value="Wheel Alignment" />' +
          '<option value="Brake Inspection" />' +
          '<option value="Brake Pad Replacement" />' +
          '<option value="Brake Fluid Flush" />' +
          '<option value="Air Filter Replacement" />' +
          '<option value="Cabin Air Filter Replacement" />' +
          '<option value="Battery Replacement" />' +
          '<option value="Spark Plug Replacement" />' +
          '<option value="Coolant Flush" />' +
          '<option value="Transmission Fluid Change" />' +
          '<option value="Differential Fluid Change" />' +
          '<option value="Power Steering Fluid" />' +
          '<option value="Serpentine Belt Replacement" />' +
          '<option value="Timing Belt Replacement" />' +
          '<option value="Wiper Blade Replacement" />' +
          '<option value="Fuel Filter Replacement" />' +
          '<option value="AC Service" />' +
          '<option value="Check Engine Diagnostic" />' +
          '<option value="Fuel System Cleaning" />' +
          '<option value="Multi-Point Inspection" />' +
        '</datalist></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="fsDate">Date</label>' +
          '<input id="fsDate" class="form-control" type="date" value="' + new Date().toISOString().slice(0, 10) + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="fsMileage">Mileage</label>' +
          '<input id="fsMileage" class="form-control" type="number" placeholder="e.g. 45000" min="0" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="fsCost">Cost ($)</label>' +
          '<input id="fsCost" class="form-control" type="number" placeholder="0.00" min="0" step="0.01" /></div>' +
        '<div class="form-group"><label class="form-label" for="fsLocation">Location</label>' +
          '<input id="fsLocation" class="form-control" type="text" placeholder="e.g. Jiffy Lube" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="fsNotes">Notes</label>' +
        '<input id="fsNotes" class="form-control" type="text" placeholder="Optional details…" /></div>' +
    '</div>',
    [{ label: 'Save Service', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  // Pre-fill mileage from the selected vehicle's last known odometer
  var mileageInput  = qs('#fsMileage', modal);
  var vehicleSelect = qs('#fsVehicle', modal);

  function prefillMileage(vid) {
    if (!mileageInput || !vid) return;
    var v = getVehicle(vid);
    var candidates = [v ? v.odometer : 0];
    AppState.maintenanceLog.forEach(function(m) { if (m.vehicleId === vid) candidates.push(m.mileage); });
    AppState.fuelLog.forEach(function(f) { if (f.vehicleId === vid) candidates.push(f.odometer); });
    var latest = Math.max.apply(null, candidates.filter(function(x) { return x > 0; }));
    mileageInput.value = latest > 0 ? latest : '';
  }

  if (vehicleSelect) {
    prefillMileage(vehicleSelect.value);
    vehicleSelect.addEventListener('change', function() {
      prefillMileage(vehicleSelect.value);
    });
  }

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitAddService()) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitAddService() {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var vehicleId = val('fsVehicle');
  var service   = val('fsService');
  var date      = val('fsDate');
  var mileage   = parseFloat(val('fsMileage'));
  var cost      = parseFloat(val('fsCost')) || 0;
  var location  = val('fsLocation') || 'Unknown';
  var notes     = val('fsNotes')    || '';

  if (!vehicleId || !service || !date || isNaN(mileage)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericVehicleId = parseInt(vehicleId.slice(1));

  try {
    var result = await DataModel.addMaintenance({
      vehicle_id: numericVehicleId, service_type: service,
      date, mileage, cost, location, notes,
    });

    AppState.maintenanceLog.unshift({
      id: 'm' + result.id, vehicleId: vehicleId, service: service,
      date, mileage, location, cost, notes,
    });

    var v = getVehicle(vehicleId);
    if (v && mileage > v.odometer) { v.odometer = mileage; v.lastService = date; }

    computeMonthlySpend();
    renderMaintenanceLog();
    renderVehicleCards();
    renderSidebarVehicles();
    renderStats();
    renderCostChart();
    showToast('Service "' + service + '" logged successfully.', 'success');
    return true;
  } catch (err) {
    showToast('Error saving service: ' + err.message, 'error');
    return false;
  }
}


/* ── Add Maintenance Rule Modal ── */
function openAddRuleModal() {
  if (AppState.vehicles.length === 0) {
    showToast('Add a vehicle first before creating a rule.', 'info');
    return;
  }
  var activeId = AppState.activeVehicleId;
  var opts = AppState.vehicles.map(function(v) {
    var sel = (v.id === activeId) ? ' selected' : '';
    return '<option value="' + v.id + '"' + sel + '>' + v.year + ' ' + v.make + ' ' + v.model + '</option>';
  }).join('');

  var modal = createModal('Add Maintenance Rule',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label" for="arVehicle">Vehicle</label>' +
        '<select id="arVehicle" class="form-control">' + opts + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="arService">Service Type</label>' +
        '<input id="arService" class="form-control" type="text" list="arServiceList" placeholder="e.g. Oil Change" />' +
        '<datalist id="arServiceList">' +
          '<option value="Oil Change">' +
          '<option value="Tire Rotation">' +
          '<option value="Air Filter Replacement">' +
          '<option value="Cabin Air Filter">' +
          '<option value="Brake Inspection">' +
          '<option value="Coolant Flush">' +
          '<option value="Transmission Fluid">' +
          '<option value="Spark Plug Replacement">' +
          '<option value="Battery Check">' +
          '<option value="Wiper Blade Replacement">' +
        '</datalist></div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.08em;padding:4px 0 2px;">SET AT LEAST ONE INTERVAL</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="arDaysPreset">Time Interval</label>' +
          '<select id="arDaysPreset" class="form-control">' +
            '<option value="">— none —</option>' +
            '<option value="30">30 days (Monthly)</option>' +
            '<option value="90">90 days (Quarterly)</option>' +
            '<option value="180">180 days (Semi-Annual)</option>' +
            '<option value="365">365 days (Annual)</option>' +
            '<option value="custom">Custom…</option>' +
          '</select>' +
          '<input id="arDays" class="form-control" type="number" placeholder="days" min="1" style="display:none;margin-top:6px;" /></div>' +
        '<div class="form-group"><label class="form-label" for="arMilesPreset">Mileage Interval</label>' +
          '<select id="arMilesPreset" class="form-control">' +
            '<option value="">— none —</option>' +
            '<option value="3000">3,000 miles</option>' +
            '<option value="5000">5,000 miles</option>' +
            '<option value="7500">7,500 miles</option>' +
            '<option value="10000">10,000 miles</option>' +
            '<option value="custom">Custom…</option>' +
          '</select>' +
          '<input id="arMiles" class="form-control" type="number" placeholder="miles" min="1" style="display:none;margin-top:6px;" /></div>' +
      '</div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.08em;padding:4px 0 2px;">LAST COMPLETED (OPTIONAL)</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="arLastDate">Date</label>' +
          '<input id="arLastDate" class="form-control" type="date" /></div>' +
        '<div class="form-group"><label class="form-label" for="arLastMileage">Mileage</label>' +
          '<input id="arLastMileage" class="form-control" type="number" placeholder="e.g. 45000" min="0" /></div>' +
      '</div>' +
    '</div>',
    [{ label: 'Save Rule', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',    cls: 'btn-secondary', action: 'cancel' }]
  );

  // Show/hide custom inputs for preset selects
  function wirePreset(presetId, inputId) {
    var preset = qs('#' + presetId, modal);
    var input  = qs('#' + inputId,  modal);
    if (!preset || !input) return;
    preset.addEventListener('change', function() {
      if (preset.value === 'custom') {
        input.style.display = '';
        input.focus();
      } else {
        input.style.display = 'none';
        input.value = '';
      }
    });
  }
  wirePreset('arDaysPreset', 'arDays');
  wirePreset('arMilesPreset', 'arMiles');

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitAddRule()) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitAddRule() {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }

  var vehicleId   = val('arVehicle');
  var serviceType = val('arService');

  // Resolve interval days
  var daysPreset = val('arDaysPreset');
  var intervalDays = daysPreset === 'custom' ? parseInt(val('arDays')) || 0
                   : daysPreset ? parseInt(daysPreset) : 0;

  // Resolve interval miles
  var milesPreset = val('arMilesPreset');
  var intervalMiles = milesPreset === 'custom' ? parseInt(val('arMiles')) || 0
                    : milesPreset ? parseInt(milesPreset) : 0;

  var lastDate    = val('arLastDate')    || null;
  var lastMileage = parseInt(val('arLastMileage')) || null;

  // Pin due-mileage to the current odometer at rule creation time so that
  // later odometer edits don't shift the reminder forward.
  if (intervalMiles && lastMileage == null) {
    var pinVehicle = getVehicle(vehicleId);
    if (pinVehicle && pinVehicle.odometer > 0) lastMileage = pinVehicle.odometer;
  }

  if (!vehicleId || !serviceType) {
    showToast('Please select a vehicle and enter a service type.', 'error');
    return false;
  }
  if (!intervalDays && !intervalMiles) {
    showToast('Please set at least one interval (time or mileage).', 'error');
    return false;
  }

  var numericVid = parseInt(vehicleId.slice(1));
  try {
    var result = await DataModel.addRule({
      vehicle_id:        numericVid,
      service_type:      serviceType,
      interval_days:     intervalDays  || null,
      interval_miles:    intervalMiles || null,
      last_done_date:    lastDate,
      last_done_mileage: lastMileage,
    });

    AppState.rules.push(result);
    var vehicle = getVehicle(vehicleId);
    var curMi   = vehicle ? vehicle.odometer : 0;
    var newSvc  = computeRuleService(result, curMi);
    AppState.services.push(newSvc);

    AppState.services.sort(function(a, b) {
      var order = { overdue: 0, warning: 1, ok: 2 };
      return (order[a.status] || 2) - (order[b.status] || 2);
    });

    recomputeVehicleHealth();
    renderServices();
    renderStats();
    renderVehicleCards();
    showToast('Rule "' + serviceType + '" created!', 'success');
    return true;
  } catch (err) {
    showToast('Error creating rule: ' + err.message, 'error');
    return false;
  }
}

/* ── Edit Rule Modal ── */
function openEditRuleModal(serviceId) {
  var svc  = AppState.services.find(function(s) { return s.id === serviceId; });
  if (!svc || !svc.isRule) return;
  var rule = AppState.rules.find(function(r) { return r.id === svc.ruleId; });
  if (!rule) return;
  var v = getVehicle(svc.vehicleId);

  function daysToPreset(d) {
    return (d === 30 || d === 90 || d === 180 || d === 365) ? String(d) : (d ? 'custom' : '');
  }
  function milesToPreset(m) {
    return (m === 3000 || m === 5000 || m === 7500 || m === 10000) ? String(m) : (m ? 'custom' : '');
  }

  var daysPresetVal  = daysToPreset(rule.interval_days);
  var milesPresetVal = milesToPreset(rule.interval_miles);

  var modal = createModal('Edit Maintenance Rule',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label">Vehicle</label>' +
        '<div class="form-control" style="opacity:0.6;cursor:default;">' + (v ? v.year + ' ' + v.make + ' ' + v.model : '—') + '</div></div>' +
      '<div class="form-group"><label class="form-label" for="erService">Service Type</label>' +
        '<input id="erService" class="form-control" type="text" list="erServiceList" value="' + rule.service_type + '" />' +
        '<datalist id="erServiceList">' +
          '<option value="Oil Change"><option value="Tire Rotation"><option value="Air Filter Replacement">' +
          '<option value="Cabin Air Filter"><option value="Brake Inspection"><option value="Coolant Flush">' +
          '<option value="Transmission Fluid"><option value="Spark Plug Replacement">' +
          '<option value="Battery Check"><option value="Wiper Blade Replacement">' +
        '</datalist></div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.08em;padding:4px 0 2px;">SET AT LEAST ONE INTERVAL</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="erDaysPreset">Time Interval</label>' +
          '<select id="erDaysPreset" class="form-control">' +
            '<option value="">— none —</option>' +
            '<option value="30"' + (daysPresetVal === '30'  ? ' selected' : '') + '>30 days (Monthly)</option>' +
            '<option value="90"' + (daysPresetVal === '90'  ? ' selected' : '') + '>90 days (Quarterly)</option>' +
            '<option value="180"' + (daysPresetVal === '180' ? ' selected' : '') + '>180 days (Semi-Annual)</option>' +
            '<option value="365"' + (daysPresetVal === '365' ? ' selected' : '') + '>365 days (Annual)</option>' +
            '<option value="custom"' + (daysPresetVal === 'custom' ? ' selected' : '') + '>Custom…</option>' +
          '</select>' +
          '<input id="erDays" class="form-control" type="number" placeholder="days" min="1" value="' + (daysPresetVal === 'custom' ? rule.interval_days : '') + '" style="' + (daysPresetVal === 'custom' ? '' : 'display:none;') + 'margin-top:6px;" /></div>' +
        '<div class="form-group"><label class="form-label" for="erMilesPreset">Mileage Interval</label>' +
          '<select id="erMilesPreset" class="form-control">' +
            '<option value="">— none —</option>' +
            '<option value="3000"'  + (milesPresetVal === '3000'  ? ' selected' : '') + '>3,000 miles</option>' +
            '<option value="5000"'  + (milesPresetVal === '5000'  ? ' selected' : '') + '>5,000 miles</option>' +
            '<option value="7500"'  + (milesPresetVal === '7500'  ? ' selected' : '') + '>7,500 miles</option>' +
            '<option value="10000"' + (milesPresetVal === '10000' ? ' selected' : '') + '>10,000 miles</option>' +
            '<option value="custom"' + (milesPresetVal === 'custom' ? ' selected' : '') + '>Custom…</option>' +
          '</select>' +
          '<input id="erMiles" class="form-control" type="number" placeholder="miles" min="1" value="' + (milesPresetVal === 'custom' ? rule.interval_miles : '') + '" style="' + (milesPresetVal === 'custom' ? '' : 'display:none;') + 'margin-top:6px;" /></div>' +
      '</div>' +
      '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.08em;padding:4px 0 2px;">LAST COMPLETED (OPTIONAL)</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="erLastDate">Date</label>' +
          '<input id="erLastDate" class="form-control" type="date" value="' + (rule.last_done_date ? String(rule.last_done_date).slice(0,10) : '') + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="erLastMileage">Mileage</label>' +
          '<input id="erLastMileage" class="form-control" type="number" placeholder="e.g. 45000" min="0" value="' + (rule.last_done_mileage != null ? rule.last_done_mileage : '') + '" /></div>' +
      '</div>' +
    '</div>',
    [{ label: 'Save Changes', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  function wirePreset(presetId, inputId) {
    var preset = qs('#' + presetId, modal);
    var input  = qs('#' + inputId,  modal);
    if (!preset || !input) return;
    preset.addEventListener('change', function() {
      if (preset.value === 'custom') { input.style.display = ''; input.focus(); }
      else { input.style.display = 'none'; input.value = ''; }
    });
  }
  wirePreset('erDaysPreset', 'erDays');
  wirePreset('erMilesPreset', 'erMiles');

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitEditRule(serviceId)) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitEditRule(serviceId) {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var svc  = AppState.services.find(function(s) { return s.id === serviceId; });
  if (!svc) return false;
  var rule = AppState.rules.find(function(r) { return r.id === svc.ruleId; });
  if (!rule) return false;

  var serviceType = val('erService');
  var daysPreset  = val('erDaysPreset');
  var intervalDays  = daysPreset === 'custom' ? parseInt(val('erDays'))  || 0 : daysPreset  ? parseInt(daysPreset)  : 0;
  var milesPreset = val('erMilesPreset');
  var intervalMiles = milesPreset === 'custom' ? parseInt(val('erMiles')) || 0 : milesPreset ? parseInt(milesPreset) : 0;
  var lastDate    = val('erLastDate')    || null;
  var lastMileage = parseInt(val('erLastMileage')) || null;

  if (!serviceType) { showToast('Please enter a service type.', 'error'); return false; }
  if (!intervalDays && !intervalMiles) { showToast('Please set at least one interval.', 'error'); return false; }

  try {
    await DataModel.updateRule(rule.id, {
      service_type:      serviceType,
      interval_days:     intervalDays  || null,
      interval_miles:    intervalMiles || null,
      last_done_date:    lastDate,
      last_done_mileage: lastMileage,
    });

    rule.service_type      = serviceType;
    rule.interval_days     = intervalDays  || null;
    rule.interval_miles    = intervalMiles || null;
    rule.last_done_date    = lastDate;
    rule.last_done_mileage = lastMileage;

    var v     = getVehicle(svc.vehicleId);
    var curMi = v ? v.odometer : 0;
    var idx   = AppState.services.findIndex(function(s) { return s.id === serviceId; });
    if (idx !== -1) AppState.services.splice(idx, 1, computeRuleService(rule, curMi));

    AppState.services.sort(function(a, b) {
      var order = { overdue: 0, warning: 1, ok: 2 };
      return (order[a.status] || 2) - (order[b.status] || 2);
    });

    recomputeVehicleHealth();
    renderServices();
    renderStats();
    renderVehicleCards();
    showToast('Rule updated.', 'success');
    return true;
  } catch (err) {
    showToast('Error updating rule: ' + err.message, 'error');
    return false;
  }
}

/* ── Edit Maintenance Modal ── */
function openEditMaintenanceModal(maintenanceId) {
  var m = AppState.maintenanceLog.find(function(x) { return x.id === maintenanceId; });
  if (!m) return;

  var modal = createModal('Edit Maintenance Record',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label" for="emService">Service Type</label>' +
        '<input id="emService" class="form-control" type="text" value="' + m.service + '" /></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="emDate">Date</label>' +
          '<input id="emDate" class="form-control" type="date" value="' + m.date + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="emMileage">Mileage</label>' +
          '<input id="emMileage" class="form-control" type="number" value="' + m.mileage + '" min="0" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="emCost">Cost ($)</label>' +
          '<input id="emCost" class="form-control" type="number" value="' + m.cost + '" min="0" step="0.01" /></div>' +
        '<div class="form-group"><label class="form-label" for="emLocation">Location</label>' +
          '<input id="emLocation" class="form-control" type="text" value="' + (m.location || '') + '" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="emNotes">Notes</label>' +
        '<input id="emNotes" class="form-control" type="text" value="' + (m.notes || '') + '" /></div>' +
    '</div>',
    [{ label: 'Save Changes', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitEditMaintenance(maintenanceId)) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitEditMaintenance(maintenanceId) {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var service  = val('emService');
  var date     = val('emDate');
  var mileage  = parseFloat(val('emMileage'));
  var cost     = parseFloat(val('emCost')) || 0;
  var location = val('emLocation') || '';
  var notes    = val('emNotes')    || '';

  if (!service || !date || isNaN(mileage)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericId = parseInt(maintenanceId.slice(1)); // 'm12' → 12

  try {
    await DataModel.updateMaintenance(numericId, {
      service_type: service, date, mileage, cost, location, notes
    });

    var m = AppState.maintenanceLog.find(function(x) { return x.id === maintenanceId; });
    m.service  = service;
    m.date     = date;
    m.mileage  = mileage;
    m.cost     = cost;
    m.location = location;
    m.notes    = notes;

    computeMonthlySpend();
    renderMaintenanceLog();
    renderCostChart();
    renderStats();
    showToast('Maintenance record updated.', 'success');
    return true;
  } catch (err) {
    showToast('Error updating record: ' + err.message, 'error');
    return false;
  }
}

/* ── Delete Maintenance Confirmation ── */
function confirmDeleteMaintenance(maintenanceId) {
  var m = AppState.maintenanceLog.find(function(x) { return x.id === maintenanceId; });
  if (!m) return;

  var modal = createModal('Delete Maintenance Record',
    '<p style="margin:0;line-height:1.5;">Are you sure you want to delete the <strong>' +
    m.service + '</strong> record from ' + formatDate(m.date) + '? This cannot be undone.</p>',
    [{ label: 'Delete',  cls: 'btn-danger',    action: 'delete' },
     { label: 'Cancel',  cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'delete') {
        btn.disabled = true;
        var numericId = parseInt(maintenanceId.slice(1));
        try {
          await DataModel.deleteMaintenance(numericId);

          AppState.maintenanceLog = AppState.maintenanceLog.filter(function(x) {
            return x.id !== maintenanceId;
          });

          computeMonthlySpend();
          renderMaintenanceLog();
          renderCostChart();
          renderStats();
          closeModal();
          showToast('Maintenance record deleted.', 'success');
        } catch (err) {
          showToast('Error deleting record: ' + err.message, 'error');
          btn.disabled = false;
        }
      } else {
        closeModal();
      }
    });
  });
}


/* ── Add Fuel Modal ── */
function openAddFuelModal() {
  if (AppState.vehicles.length === 0) {
    showToast('Add a vehicle first before logging fuel.', 'info');
    return;
  }
  var activeId = AppState.activeVehicleId;
  var opts = AppState.vehicles.map(function(v) {
    var sel = (v.id === activeId) ? ' selected' : '';
    return '<option value="' + v.id + '"' + sel + '>' + v.year + ' ' + v.make + ' ' + v.model + '</option>';
  }).join('');

  function lastFuelOdometer(vehicleId) {
    var entries = AppState.fuelLog.filter(function(f) { return f.vehicleId === vehicleId; });
    if (entries.length === 0) return 0; // first fill-up — no valid previous reading, skip MPG
    return Math.max.apply(null, entries.map(function(f) { return f.odometer; }));
  }

  var initialOdometer = activeId ? latestOdometer(activeId) : '';

  var modal = createModal('Log Fuel Fill-up',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label" for="ffVehicle">Vehicle</label>' +
        '<select id="ffVehicle" class="form-control">' + (activeId ? '' : '<option value="" disabled selected>Select a vehicle…</option>') + opts + '</select></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="ffDate">Date</label>' +
          '<input id="ffDate" class="form-control" type="date" value="' + new Date().toISOString().slice(0, 10) + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="ffOdometer">Odometer (mi)</label>' +
          '<input id="ffOdometer" class="form-control" type="number" value="' + initialOdometer + '" placeholder="e.g. 84500" min="0" step="10" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="ffGallons">Gallons</label>' +
          '<input id="ffGallons" class="form-control" type="number" placeholder="e.g. 10" min="1" step="1" /></div>' +
        '<div class="form-group"><label class="form-label" for="ffCost">Total Cost ($)</label>' +
          '<input id="ffCost" class="form-control" type="number" placeholder="0.00" min="0" step="1" /></div>' +
      '</div>' +
      '<div class="form-group" style="position:relative;"><label class="form-label" for="ffStation">Station / Location</label>' +
        '<input id="ffStation" class="form-control" type="text" placeholder="e.g. Shell on Main St" autocomplete="off" />' +
        '<div id="ffStationDropdown" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 2px);background:var(--surface);border:1px solid var(--border-bright);border-radius:var(--radius);box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:100;max-height:160px;overflow-y:auto;"></div>' +
      '</div>' +
      '<div id="mpgPreview" class="mpg-preview" style="display:none;">' +
        '<span class="mpg-preview-label">Calculated MPG</span>' +
        '<span class="mpg-preview-val" id="mpgPreviewVal">—</span>' +
      '</div>' +
    '</div>',
    [{ label: 'Save Fill-up', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  function latestOdometer(vehicleId) {
    var v = getVehicle(vehicleId);
    // Collect odometers from actual logged entries
    var logCandidates = [];
    AppState.maintenanceLog.forEach(function(m) { if (m.vehicleId === vehicleId && m.mileage > 0) logCandidates.push(m.mileage); });
    AppState.fuelLog.forEach(function(f) { if (f.vehicleId === vehicleId && f.odometer > 0) logCandidates.push(f.odometer); });
    // Only fall back to v.odometer (DB current_mileage) when there are no logged entries.
    // v.odometer is never decremented server-side, so it becomes stale after entries are deleted.
    if (logCandidates.length > 0) {
      return Math.max.apply(null, logCandidates);
    }
    return (v && v.odometer > 0) ? v.odometer : 0;
  }

  function prefillOdometer() {
    var vehicleId = qs('#ffVehicle') ? qs('#ffVehicle').value : '';
    var odomEl = qs('#ffOdometer');
    if (odomEl) odomEl.value = latestOdometer(vehicleId) || '';
  }

  function calcMpg() {
    var vehicleId  = qs('#ffVehicle') ? qs('#ffVehicle').value : '';
    var odometer   = parseFloat(qs('#ffOdometer') ? qs('#ffOdometer').value : '');
    var gallons    = parseFloat(qs('#ffGallons')  ? qs('#ffGallons').value  : '');
    var preview    = qs('#mpgPreview');
    var previewVal = qs('#mpgPreviewVal');
    if (!preview || !previewVal) return;
    var prev = lastFuelOdometer(vehicleId);
    if (prev > 0 && !isNaN(odometer) && !isNaN(gallons) && gallons > 0 && odometer > prev) {
      var mpg = ((odometer - prev) / gallons).toFixed(1);
      previewVal.textContent = mpg + ' MPG';
      previewVal.style.color = mpgColor(parseFloat(mpg));
      preview.style.display  = 'flex';
    } else {
      preview.style.display = 'none';
    }
  }

  var vehicleEl = qs('#ffVehicle', modal);
  if (vehicleEl) vehicleEl.addEventListener('change', function() { prefillOdometer(); calcMpg(); });

  ['#ffOdometer', '#ffGallons'].forEach(function(sel) {
    var el = qs(sel, modal);
    if (el) el.addEventListener('input', calcMpg);
  });

  var stationInput    = qs('#ffStation', modal);
  var stationDropdown = qs('#ffStationDropdown', modal);
  var savedStations   = JSON.parse(localStorage.getItem('fuelStations') || '[]');

  function showStationSuggestions(filter) {
    var matches = filter
      ? savedStations.filter(function(s) { return s.toLowerCase().indexOf(filter.toLowerCase()) !== -1; })
      : savedStations;
    if (matches.length === 0) { stationDropdown.style.display = 'none'; return; }
    stationDropdown.innerHTML = matches.map(function(s) {
      return '<div class="station-suggestion" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);">' + s + '</div>';
    }).join('');
    stationDropdown.style.display = '';
    qsa('.station-suggestion', stationDropdown).forEach(function(item) {
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        stationInput.value = item.textContent;
        stationDropdown.style.display = 'none';
      });
    });
  }

  if (stationInput && stationDropdown) {
    stationInput.addEventListener('focus', function() {
      if (savedStations.length > 0) showStationSuggestions(stationInput.value);
    });
    stationInput.addEventListener('input', function() {
      showStationSuggestions(stationInput.value);
    });
    stationInput.addEventListener('blur', function() {
      setTimeout(function() { stationDropdown.style.display = 'none'; }, 150);
    });
  }

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitAddFuel()) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitAddFuel() {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var vehicleId = val('ffVehicle');
  var date      = val('ffDate');
  var odometer  = parseFloat(val('ffOdometer'));
  var gallons   = parseFloat(val('ffGallons'));
  var cost      = parseFloat(val('ffCost'));
  var station   = val('ffStation') || 'Unknown';

  if (!vehicleId || !date || isNaN(odometer) || isNaN(gallons) || gallons <= 0 || isNaN(cost)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericVehicleId = parseInt(vehicleId.slice(1));
  var pricePerGallon   = gallons > 0 ? parseFloat((cost / gallons).toFixed(4)) : 0;

  var v                = getVehicle(vehicleId);
  var existingEntries  = AppState.fuelLog.filter(function(f) { return f.vehicleId === vehicleId; });
  // Only use logged entry odometers as the floor — never v.odometer, since it's
  // never reset when entries are deleted and would block historical backdating.
  var prevOdometer     = existingEntries.length > 0
    ? Math.max.apply(null, existingEntries.map(function(f) { return f.odometer; }))
    : 0;

  if (prevOdometer > 0 && odometer < prevOdometer) {
    showToast('Odometer (' + odometer.toLocaleString() + ' mi) is lower than the last recorded reading (' + prevOdometer.toLocaleString() + ' mi). Please verify.', 'error');
    return false;
  }

  var miles = prevOdometer > 0 ? odometer - prevOdometer : 0;
  var mpg   = miles > 0 && gallons > 0 ? parseFloat((miles / gallons).toFixed(1)) : 0;

  try {
    var result = await DataModel.addFuel({
      vehicle_id: numericVehicleId, date, gallons,
      price_per_gallon: pricePerGallon, mileage: odometer, station,
    });

    AppState.fuelLog.unshift({
      id: 'f' + result.id, vehicleId, date, station,
      gallons, cost, mpg, odometer,
    });

    if (v && odometer > v.odometer) v.odometer = odometer;
    computeFuelMpg();

    if (station && station !== 'Unknown') {
      var stations = JSON.parse(localStorage.getItem('fuelStations') || '[]');
      stations = [station].concat(stations.filter(function(s) { return s !== station; })).slice(0, 10);
      localStorage.setItem('fuelStations', JSON.stringify(stations));
    }
    renderFuelLog();
    renderVehicleCards();
    renderSidebarVehicles();
    renderStats();
    if (_currentView === 'fuel') updateFuelSummary();
    showToast('Fuel entry saved.' + (mpg > 0 ? ' Calculated MPG: ' + mpg : ''), 'success');
    return true;
  } catch (err) {
    showToast('Error saving fuel entry: ' + err.message, 'error');
    return false;
  }
}


/* ── Edit Fuel Modal ── */
function openEditFuelModal(fuelId) {
  var f = AppState.fuelLog.find(function(x) { return x.id === fuelId; });
  if (!f) return;

  var modal = createModal('Edit Fuel Entry',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label">Vehicle</label>' +
        '<div class="form-control" style="opacity:0.6;cursor:default;">' + vehicleLabel(f.vehicleId) + '</div></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="efDate">Date</label>' +
          '<input id="efDate" class="form-control" type="date" value="' + f.date + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="efOdometer">Odometer (mi)</label>' +
          '<input id="efOdometer" class="form-control" type="number" value="' + f.odometer + '" min="0" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="efGallons">Gallons</label>' +
          '<input id="efGallons" class="form-control" type="number" value="' + f.gallons + '" min="0.1" step="0.1" /></div>' +
        '<div class="form-group"><label class="form-label" for="efCost">Total Cost ($)</label>' +
          '<input id="efCost" class="form-control" type="number" value="' + f.cost.toFixed(2) + '" min="0" step="0.01" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="efStation">Station / Location</label>' +
        '<input id="efStation" class="form-control" type="text" value="' + (f.station || '') + '" /></div>' +
    '</div>',
    [{ label: 'Save Changes', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitEditFuel(fuelId)) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitEditFuel(fuelId) {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var date     = val('efDate');
  var odometer = parseFloat(val('efOdometer'));
  var gallons  = parseFloat(val('efGallons'));
  var cost     = parseFloat(val('efCost'));
  var station  = val('efStation') || '';

  if (!date || isNaN(odometer) || isNaN(gallons) || gallons <= 0 || isNaN(cost)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericId      = parseInt(fuelId.slice(1));
  var pricePerGallon = parseFloat((cost / gallons).toFixed(4));

  try {
    await DataModel.updateFuel(numericId, {
      date, gallons, price_per_gallon: pricePerGallon, mileage: odometer, station,
    });

    var f = AppState.fuelLog.find(function(x) { return x.id === fuelId; });
    f.date     = date;
    f.odometer = odometer;
    f.gallons  = gallons;
    f.cost     = cost;
    f.station  = station;

    var vehicleFuelEntries = AppState.fuelLog.filter(function(ff) { return ff.vehicleId === f.vehicleId; });
    var maxOdometer = vehicleFuelEntries.length > 0
      ? Math.max.apply(null, vehicleFuelEntries.map(function(ff) { return ff.odometer; })) : 0;
    var fv = getVehicle(f.vehicleId);
    if (fv && maxOdometer > 0) fv.odometer = maxOdometer;

    computeFuelMpg();
    renderFuelLog();
    renderVehicleCards();
    renderStats();
    if (_currentView === 'fuel') updateFuelSummary();
    showToast('Fuel entry updated.', 'success');
    return true;
  } catch (err) {
    showToast('Error updating fuel entry: ' + err.message, 'error');
    return false;
  }
}

/* ── Delete Fuel Confirmation ── */
function confirmDeleteFuel(fuelId) {
  var f = AppState.fuelLog.find(function(x) { return x.id === fuelId; });
  if (!f) return;

  var modal = createModal('Delete Fuel Entry',
    '<p style="margin:0;line-height:1.5;">Are you sure you want to delete the fuel entry from <strong>' +
    formatDate(f.date) + '</strong> for ' + vehicleLabel(f.vehicleId) + '? This cannot be undone.</p>',
    [{ label: 'Delete',  cls: 'btn-danger',    action: 'delete' },
     { label: 'Cancel',  cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'delete') {
        btn.disabled = true;
        var numericId = parseInt(fuelId.slice(1));
        try {
          await DataModel.deleteFuel(numericId);

          AppState.fuelLog = AppState.fuelLog.filter(function(x) { return x.id !== fuelId; });

          computeFuelMpg();
          renderFuelLog();
          renderVehicleCards();
          renderStats();
          if (_currentView === 'fuel') updateFuelSummary();
          closeModal();
          showToast('Fuel entry deleted.', 'success');
        } catch (err) {
          showToast('Error deleting fuel entry: ' + err.message, 'error');
          btn.disabled = false;
        }
      } else {
        closeModal();
      }
    });
  });
}


/* ── Add Vehicle Modal ── */
function openAddVehicleModal() {
  var modal = createModal('Add Vehicle',
    '<div class="modal-form">' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="avYear">Year</label>' +
          '<input id="avYear" class="form-control" type="number" placeholder="e.g. 2022" min="1900" max="2100" /></div>' +
        '<div class="form-group"><label class="form-label" for="avType">Type</label>' +
          '<select id="avType" class="form-control">' +
            '<option value="Sedan">Sedan</option>' +
            '<option value="Truck">Truck</option>' +
            '<option value="SUV">SUV</option>' +
            '<option value="Hatchback">Hatchback</option>' +
            '<option value="Coupe">Coupe</option>' +
            '<option value="Minivan">Minivan</option>' +
            '<option value="Other">Other</option>' +
          '</select></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="avMake">Make</label>' +
          '<input id="avMake" class="form-control" type="text" placeholder="e.g. Honda" /></div>' +
        '<div class="form-group"><label class="form-label" for="avModel">Model</label>' +
          '<input id="avModel" class="form-control" type="text" placeholder="e.g. Civic" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="avMileage">Current Mileage</label>' +
        '<input id="avMileage" class="form-control" type="number" placeholder="e.g. 45000" min="0" /></div>' +
    '</div>',
    [{ label: 'Add Vehicle', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',      cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitAddVehicle()) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitAddVehicle() {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var year    = parseInt(val('avYear'));
  var type    = val('avType');
  var make    = val('avMake');
  var model   = val('avModel');
  var mileage = parseInt(val('avMileage'));

  if (!year || !make || !model || isNaN(mileage)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  try {
    var result = await DataModel.addVehicle({ year, make, model, type, current_mileage: mileage });

    var newVehicle = {
      id:              'v' + result.id,
      make:            result.make,
      model:           result.model,
      year:            result.year,
      type:            result.type || type,
      color:           VEHICLE_COLORS[AppState.vehicles.length % VEHICLE_COLORS.length],
      odometer:        result.current_mileage,
      avgMpg:          0,
      lastService:     null,
      health:          'good',
      openItems:       0,
      openItemsStatus: 'ok',
    };

    AppState.vehicles.push(newVehicle);
    if (!AppState.activeVehicleId) AppState.activeVehicleId = newVehicle.id;

    renderSidebarVehicles();
    renderVehicleCards();
    renderStats();
    showToast(result.year + ' ' + result.make + ' ' + result.model + ' added!', 'success');
    return true;
  } catch (err) {
    showToast('Error adding vehicle: ' + err.message, 'error');
    return false;
  }
}


/* ── Edit Vehicle Modal ── */
function openEditVehicleModal(vehicleId) {
  var v = getVehicle(vehicleId);
  if (!v) return;

  var typeOptions = ['Sedan', 'Truck', 'SUV', 'Hatchback', 'Coupe', 'Minivan', 'Other'];
  var typeSelect = typeOptions.map(function(t) {
    return '<option value="' + t + '"' + (v.type === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  var modal = createModal('Edit Vehicle',
    '<div class="modal-form">' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="evYear">Year</label>' +
          '<input id="evYear" class="form-control" type="number" min="1900" max="2100" value="' + v.year + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="evType">Type</label>' +
          '<select id="evType" class="form-control">' + typeSelect + '</select></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="evMake">Make</label>' +
          '<input id="evMake" class="form-control" type="text" value="' + v.make + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="evModel">Model</label>' +
          '<input id="evModel" class="form-control" type="text" value="' + v.model + '" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="evMileage">Current Mileage</label>' +
        '<input id="evMileage" class="form-control" type="number" min="0" value="' + v.odometer + '" /></div>' +
    '</div>',
    [{ label: 'Save Changes', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'save') {
        btn.disabled = true;
        if (await submitEditVehicle(vehicleId)) closeModal();
        else btn.disabled = false;
      } else {
        closeModal();
      }
    });
  });
}

async function submitEditVehicle(vehicleId) {
  function val(id) { var el = qs('#' + id); return el ? el.value.trim() : ''; }
  var year    = parseInt(val('evYear'));
  var type    = val('evType');
  var make    = val('evMake');
  var model   = val('evModel');
  var mileage = parseInt(val('evMileage'));

  if (!year || !make || !model || isNaN(mileage)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericId = vehicleId.replace(/^v/, '');
  try {
    await DataModel.updateVehicle(numericId, { year, make, model, type, current_mileage: mileage });

    var v = getVehicle(vehicleId);
    v.year     = year;
    v.make     = make;
    v.model    = model;
    v.type     = type;
    v.odometer = mileage;

    // Recompute rule services for this vehicle with updated mileage
    AppState.services = AppState.services.map(function(s) {
      if (!s.isRule || s.vehicleId !== vehicleId) return s;
      var rule = AppState.rules.find(function(r) { return r.id === s.ruleId; });
      return rule ? computeRuleService(rule, mileage) : s;
    });
    AppState.services.sort(function(a, b) {
      var order = { overdue: 0, warning: 1, ok: 2 };
      return (order[a.status] || 2) - (order[b.status] || 2);
    });

    recomputeVehicleHealth();
    renderSidebarVehicles();
    renderVehicleCards();
    renderServices();
    renderStats();
    showToast(year + ' ' + make + ' ' + model + ' updated!', 'success');
    return true;
  } catch (err) {
    showToast('Error updating vehicle: ' + err.message, 'error');
    return false;
  }
}

/* ── Delete Vehicle Confirmation ── */
function confirmDeleteVehicle(vehicleId) {
  var v = getVehicle(vehicleId);
  if (!v) return;

  var label = v.year + ' ' + v.make + ' ' + v.model;
  var modal = createModal('Delete Vehicle',
    '<p style="margin:0;line-height:1.5;">Are you sure you want to delete the <strong>' + label + '</strong>? ' +
    'This will permanently remove all associated maintenance records, fuel logs, service reminders, and maintenance rules. This cannot be undone.</p>',
    [{ label: 'Delete',  cls: 'btn-danger',    action: 'delete' },
     { label: 'Cancel',  cls: 'btn-secondary', action: 'cancel' }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.dataset.modalAction === 'delete') {
        btn.disabled = true;
        var numericId = vehicleId.replace(/^v/, '');
        try {
          await DataModel.deleteVehicle(numericId);

          AppState.vehicles       = AppState.vehicles.filter(function(x) { return x.id !== vehicleId; });
          AppState.services       = AppState.services.filter(function(s) { return s.vehicleId !== vehicleId; });
          AppState.rules          = AppState.rules.filter(function(r) { return 'v' + r.vehicle_id !== vehicleId; });
          AppState.maintenanceLog = AppState.maintenanceLog.filter(function(m) { return m.vehicleId !== vehicleId; });
          AppState.fuelLog        = AppState.fuelLog.filter(function(f) { return f.vehicleId !== vehicleId; });

          if (AppState.activeVehicleId === vehicleId) {
            AppState.activeVehicleId = AppState.vehicles.length > 0 ? AppState.vehicles[0].id : null;
          }

          closeModal();
          renderSidebarVehicles();
          renderVehicleCards();
          renderStats();
          showToast(label + ' deleted.', 'success');
        } catch (err) {
          showToast('Error deleting vehicle: ' + err.message, 'error');
          btn.disabled = false;
        }
      } else {
        closeModal();
      }
    });
  });
}


/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function showToast(message, type) {
  type = type || 'info';
  var container = qs('#toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  var icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + message + '</span>' +
    '<button type="button" class="toast-close" aria-label="Dismiss">&times;</button>';
  container.appendChild(toast);

  qs('.toast-close', toast).addEventListener('click', function() { dismissToast(toast); });
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { toast.classList.add('toast-visible'); });
  });
  setTimeout(function() { dismissToast(toast); }, 4000);
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.remove('toast-visible');
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
}


/* ══════════════════════════════════════════
   SEARCH
══════════════════════════════════════════ */
function initSearch() {
  var input = qs('#topbarSearchInput');
  if (!input) return;
  input.addEventListener('input', function() {
    var q = input.value.toLowerCase().trim();
    qsa('#maintenanceTbody tr').forEach(function(row) {
      row.style.opacity = (!q || row.textContent.toLowerCase().indexOf(q) !== -1) ? '1' : '0.25';
    });
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      input.value = '';
      qsa('#maintenanceTbody tr').forEach(function(row) { row.style.opacity = '1'; });
    }
  });
}


/* ══════════════════════════════════════════
   NAV + VIEW SWITCHER
══════════════════════════════════════════ */
var VIEW_CONFIG = {
  dashboard:   {
    title:    'Fleet <span>Dashboard</span>',
    subtitle: function() {
      return AppState.vehicles.length + ' VEHICLE' +
             (AppState.vehicles.length !== 1 ? 'S' : '') + ' TRACKED';
    },
    sections: ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance'],
    panel:    null,
  },
  vehicles:    {
    title:    'My <span>Vehicles</span>',
    subtitle: function() { return AppState.vehicles.length + ' REGISTERED'; },
    panel: 'panelVehicles',
  },
  maintenance: {
    title:    'Maintenance <span>Log</span>',
    subtitle: function() { return AppState.maintenanceLog.length + ' RECORDS'; },
    panel: 'panelMaintenance',
  },
  schedule:    {
    title:    'Service <span>Schedule</span>',
    subtitle: function() {
      var n = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
      return AppState.services.length + ' SERVICES' + (n > 0 ? ' · ' + n + ' OVERDUE' : '');
    },
    panel: 'panelSchedule',
  },
  fuel:        {
    title:    'Fuel <span>Tracker</span>',
    subtitle: function() { return AppState.fuelLog.length + ' ENTRIES'; },
    panel: 'panelFuelLog',
  },
  analytics:   {
    title:    'Cost <span>Analytics</span>',
    subtitle: function() { return 'PERFORMANCE INSIGHTS'; },
    panel: 'panelAnalytics',
  },
  profile:     {
    title:    'My <span>Profile</span>',
    subtitle: function() { return 'ACCOUNT DETAILS'; },
    panel: 'panelProfile',
  },
};

var _panelOrigins = {};
var _currentView  = 'dashboard';
var _profileControlsInitialized = false;

function switchView(viewName) {
  var config = VIEW_CONFIG[viewName];
  if (!config) return;

  var viewContainer = qs('#viewContainer');

  Object.keys(_panelOrigins).forEach(function(id) {
    var info  = _panelOrigins[id];
    var panel = document.getElementById(id);
    if (!panel || !info) return;
    if (info.nextSibling) {
      info.parent.insertBefore(panel, info.nextSibling);
    } else {
      info.parent.appendChild(panel);
    }
  });
  _panelOrigins = {};

  var allSections = ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance', 'panelProfile', 'panelAnalytics'];
  allSections.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  viewContainer.style.display = 'none';
  viewContainer.innerHTML = '';

  if (viewName === 'dashboard') {
    ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = '';
    });
  } else {
    var stats = qs('#sectionStats');
    if (stats) stats.style.display = '';

    var panelId = config.panel;
    if (panelId) {
      var panel = document.getElementById(panelId);
      if (panel) {
        _panelOrigins[panelId] = {
          parent:      panel.parentNode,
          nextSibling: panel.nextSibling,
        };
        viewContainer.appendChild(panel);
        panel.style.display = '';
        viewContainer.style.display = 'block';
      }
    }
  }

  var titleEl = qs('#pageTitle');
  var subEl   = qs('#pageSubtitle');
  if (titleEl) titleEl.innerHTML  = config.title;
  if (subEl)   subEl.textContent  = config.subtitle();

  if (viewName === 'profile') {
    var emailEl = qs('#profileEmail');
    var avEl    = qs('#profileAvatar');
    var vcEl    = qs('#profileVehicleCount');
    var scEl    = qs('#profileServiceCount');
    var email   = AppState.currentUser.email || '—';
    if (emailEl) emailEl.textContent = email;
    if (avEl)    avEl.textContent    = AppState.currentUser.initials || '?';
    if (vcEl)    vcEl.textContent    = AppState.vehicles.length;
    if (scEl)    scEl.textContent    = AppState.maintenanceLog.length;

    var deleteBtn = qs('#deleteAccountButton');
    if (deleteBtn && !deleteBtn.dataset.deleteListenerAdded) {
      deleteBtn.dataset.deleteListenerAdded = '1';
      deleteBtn.addEventListener('click', function() {
        var modal = createModal('Delete Account',
          '<p style="margin:0;line-height:1.5;">Are you sure you want to delete your account? ' +
          'This will permanently remove all your vehicles, maintenance records, fuel logs, and reminders. ' +
          '<strong>This cannot be undone.</strong></p>',
          [{ label: 'Delete Account', cls: 'btn-danger',    action: 'delete' },
           { label: 'Cancel',         cls: 'btn-secondary', action: 'cancel' }]
        );
        qsa('[data-modal-action]', modal).forEach(function(btn) {
          btn.addEventListener('click', async function() {
            if (btn.dataset.modalAction === 'delete') {
              btn.disabled = true;
              btn.textContent = 'Deleting...';
              try {
                await DataModel.deleteAccount();
                localStorage.removeItem('jwtToken');
                window.location.href = '/';
              } catch (err) {
                showToast('Error deleting account: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Delete Account';
              }
            } else {
              closeModal();
            }
          });
        });
      });
    }

    initProfileControls();
  }

  qsa('.nav-item[data-view]').forEach(function(l) {
    l.classList.toggle('active', l.dataset.view === viewName);
  });

  var primaryBtn = qs('#pageActionPrimary');
  if (primaryBtn) {
    if (viewName === 'fuel') {
      primaryBtn.innerHTML = '<i class="fa-solid fa-gas-pump"></i> Log Fuel';
      primaryBtn.setAttribute('data-action', 'add-fuel');
    } else if (viewName === 'schedule') {
      primaryBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Add Rule';
      primaryBtn.setAttribute('data-action', 'add-rule');
    } else {
      primaryBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Log Service';
      primaryBtn.setAttribute('data-action', 'log-service');
    }
  }

  var fuelTitle   = qs('#fuelPanelTitle');
  var fuelAction  = qs('#fuelPanelAction');
  var fuelSummary = qs('#fuelSummary');
  if (fuelTitle)  fuelTitle.textContent    = (viewName === 'fuel') ? 'Fuel Log' : 'Recent Fuel Entries';
  if (fuelAction) fuelAction.style.display = (viewName === 'fuel') ? 'none' : '';
  if (fuelSummary) {
    if (viewName === 'fuel') { updateFuelSummary(); }
    else                     { fuelSummary.style.display = 'none'; }
  }

  if (viewName === 'analytics') renderAnalytics();

  _currentView = viewName;
}

function initNav() {
  qsa('.nav-item[data-view]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  var logo = qs('.topbar-logo[data-view]');
  if (logo) {
    logo.addEventListener('click', function(e) {
      e.preventDefault();
      switchView('dashboard');
    });
  }

  document.addEventListener('click', function(e) {
    var link = e.target.closest('[data-nav]');
    if (!link) return;
    e.preventDefault();
    switchView(link.dataset.nav);
  });

  var signOut = qs('#signOutLink');
  if (signOut) {
    signOut.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.removeItem('jwtToken');
      window.location.href = '/';
    });
  }

  var bell = qs('#notifBtn');
  if (bell) {
    bell.addEventListener('click', function() {
      var n = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
      showToast(
        n > 0 ? n + ' service(s) are overdue. Check the schedule.' : 'No new notifications.',
        n > 0 ? 'error' : 'info'
      );
    });
  }
}


/* ══════════════════════════════════════════
   PROFILE CONTROLS
══════════════════════════════════════════ */
function initProfileControls() {
  if (_profileControlsInitialized) return;
  _profileControlsInitialized = true;

  var editEmailButton = qs('#editEmailButton');
  var changePasswordButton = qs('#changePasswordButton');

  if (editEmailButton) {
    editEmailButton.addEventListener('click', function() {
      var currentEmail = AppState.currentUser.email || '';
      var modalBody = 
        '<div class="form-group">' +
          '<label class="form-label">New email address</label>' +
          '<input id="modalEmailInput" class="form-control" type="email" placeholder="you@example.com" value="' + currentEmail + '" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Current password</label>' +
          '<input id="modalEmailPassword" class="form-control" type="password" placeholder="Current password" />' +
        '</div>' +
        '<div id="modalEmailStatus" style="font-size:13px;color:var(--text-muted);margin-top:8px;"></div>';
      
      var modal = createModal('Edit Email Address', modalBody, [
        { label: 'Save', cls: 'btn-primary', action: 'save' },
        { label: 'Cancel', cls: 'btn-secondary', action: 'cancel' }
      ]);

      qsa('[data-modal-action]', modal).forEach(function(btn) {
        btn.addEventListener('click', async function() {
          if (btn.dataset.modalAction === 'save') {
            var newEmail = qs('#modalEmailInput').value.trim();
            var currentPassword = qs('#modalEmailPassword').value;
            var statusEl = qs('#modalEmailStatus');
            
            if (!newEmail || !currentPassword) {
              statusEl.style.color = 'var(--red)';
              statusEl.textContent = 'Email and password are required.';
              return;
            }
            
            btn.disabled = true;
            btn.textContent = 'Saving...';
            try {
              var result = await DataModel.updateEmail(newEmail, currentPassword);
              if (result && result.token) {
                localStorage.setItem('jwtToken', result.token);
                DataModel.setToken(result.token);
                AppState.currentUser.email = newEmail;
                AppState.currentUser.initials = newEmail[0].toUpperCase();
                var avatar = qs('#userAvatar');
                if (avatar) { avatar.textContent = AppState.currentUser.initials; avatar.title = newEmail; }
                var emailEl = qs('#profileEmail');
                if (emailEl) emailEl.textContent = newEmail;
              }
              showToast('Email updated successfully!', 'success');
              closeModal();
            } catch (err) {
              console.error('Error updating email:', err);
              statusEl.style.color = 'var(--red)';
              statusEl.textContent = err.message || 'Failed to update email.';
              btn.disabled = false;
              btn.textContent = 'Save';
            }
          } else {
            closeModal();
          }
        });
      });
    });
  }

  if (changePasswordButton) {
    changePasswordButton.addEventListener('click', function() {
      var modalBody = 
        '<div class="form-group">' +
          '<label class="form-label">Current password</label>' +
          '<input id="modalCurrentPassword" class="form-control" type="password" placeholder="Current password" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">New password</label>' +
          '<input id="modalNewPassword" class="form-control" type="password" placeholder="New password" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">Confirm new password</label>' +
          '<input id="modalConfirmPassword" class="form-control" type="password" placeholder="Confirm new password" />' +
        '</div>' +
        '<div id="modalPasswordStatus" style="font-size:13px;color:var(--text-muted);margin-top:8px;"></div>';
      
      var modal = createModal('Change Password', modalBody, [
        { label: 'Update Password', cls: 'btn-primary', action: 'save' },
        { label: 'Cancel', cls: 'btn-secondary', action: 'cancel' }
      ]);

      qsa('[data-modal-action]', modal).forEach(function(btn) {
        btn.addEventListener('click', async function() {
          if (btn.dataset.modalAction === 'save') {
            var currentPassword = qs('#modalCurrentPassword').value;
            var newPassword = qs('#modalNewPassword').value;
            var confirmPassword = qs('#modalConfirmPassword').value;
            var statusEl = qs('#modalPasswordStatus');
            
            if (!currentPassword || !newPassword || !confirmPassword) {
              statusEl.style.color = 'var(--red)';
              statusEl.textContent = 'All password fields are required.';
              return;
            }
            
            if (newPassword !== confirmPassword) {
              statusEl.style.color = 'var(--red)';
              statusEl.textContent = 'New passwords do not match.';
              return;
            }
            
            btn.disabled = true;
            btn.textContent = 'Updating...';
            try {
              await DataModel.updatePassword(currentPassword, newPassword);
              showToast('Password updated successfully!', 'success');
              closeModal();
            } catch (err) {
              console.error('Error changing password:', err);
              statusEl.style.color = 'var(--red)';
              statusEl.textContent = err.message || 'Failed to change password.';
              btn.disabled = false;
              btn.textContent = 'Update Password';
            }
          } else {
            closeModal();
          }
        });
      });
    });
  }
}

/* ══════════════════════════════════════════
  FUEL SUMMARY
══════════════════════════════════════════ */
function updateFuelSummary() {
  var container = qs('#fuelSummary');
  if (!container) return;

  var totalEntries = AppState.fuelLog.length;
  var totalGallons = AppState.fuelLog.reduce(function(s, f) { return s + f.gallons; }, 0);
  var totalSpend   = AppState.fuelLog.reduce(function(s, f) { return s + f.cost;    }, 0);
  var mpgVehicles  = AppState.vehicles.filter(function(v) { return v.avgMpg > 0; });
  var avgMpg       = mpgVehicles.length > 0
    ? (mpgVehicles.reduce(function(s, v) { return s + v.avgMpg; }, 0) / mpgVehicles.length).toFixed(1)
    : '—';
  var mpgClr = isNaN(parseFloat(avgMpg)) ? 'var(--text-muted)' : mpgColor(parseFloat(avgMpg));

  container.innerHTML =
    '<div class="fuel-summary">' +
      '<div class="fuel-summary-item">' +
        '<span class="fuel-summary-val">' + totalEntries + '</span>' +
        '<span class="fuel-summary-key">FILL-UPS</span>' +
      '</div>' +
      '<div class="fuel-summary-item">' +
        '<span class="fuel-summary-val">' + totalGallons.toFixed(1) + ' <small>gal</small></span>' +
        '<span class="fuel-summary-key">TOTAL GALLONS</span>' +
      '</div>' +
      '<div class="fuel-summary-item">' +
        '<span class="fuel-summary-val">$' + totalSpend.toFixed(2) + '</span>' +
        '<span class="fuel-summary-key">TOTAL SPENT</span>' +
      '</div>' +
      '<div class="fuel-summary-item">' +
        '<span class="fuel-summary-val" style="color:' + mpgClr + '">' + avgMpg + '</span>' +
        '<span class="fuel-summary-key">FLEET AVG MPG</span>' +
      '</div>' +
    '</div>';
  container.style.display = '';
}


/* ══════════════════════════════════════════
   EXPORT
══════════════════════════════════════════ */
function downloadCSV(rows, filename) {
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var s = String(cell == null ? '' : cell);
      if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\r\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleExport() {
  var today = new Date().toISOString().slice(0, 10);
  var rows;

  if (_currentView === 'vehicles') {
    if (AppState.vehicles.length === 0) { showToast('No vehicles to export.', 'info'); return; }
    rows = [['Year', 'Make', 'Model', 'Type', 'Odometer (mi)', 'Avg MPG', 'Last Service', 'Health']];
    AppState.vehicles.forEach(function(v) {
      rows.push([v.year, v.make, v.model, v.type, v.odometer,
        v.avgMpg > 0 ? v.avgMpg : '', v.lastService || '', v.health]);
    });
    downloadCSV(rows, 'vehicles_' + today + '.csv');
    showToast('Vehicles exported.', 'success');

  } else if (_currentView === 'fuel') {
    if (AppState.fuelLog.length === 0) { showToast('No fuel entries to export.', 'info'); return; }
    rows = [['Date', 'Vehicle', 'Station', 'Gallons', 'Total Cost ($)', 'MPG', 'Odometer (mi)']];
    AppState.fuelLog.forEach(function(f) {
      rows.push([f.date, vehicleLabel(f.vehicleId), f.station,
        f.gallons, f.cost.toFixed(2), f.mpg > 0 ? f.mpg : '', f.odometer]);
    });
    downloadCSV(rows, 'fuel_log_' + today + '.csv');
    showToast('Fuel log exported.', 'success');

  } else if (_currentView === 'schedule') {
    if (AppState.services.length === 0) { showToast('No services to export.', 'info'); return; }
    rows = [['Service', 'Vehicle', 'Due Date', 'Status', 'Days Overdue', 'Days Until Due']];
    AppState.services.forEach(function(s) {
      rows.push([s.name, vehicleLabel(s.vehicleId), s.dueDate, s.status,
        s.daysOverdue || '', s.daysUntil < 999 ? s.daysUntil : '']);
    });
    downloadCSV(rows, 'service_schedule_' + today + '.csv');
    showToast('Service schedule exported.', 'success');

  } else if (_currentView === 'analytics') {
    var cpmExport = computeCostPerMile();
    rows = [['Month', 'Miles Driven', 'Fuel Cost ($)', 'Maintenance Cost ($)', 'Total Cost ($)', 'Cost Per Mile ($)']];
    cpmExport.forEach(function(m) {
      rows.push([m.label, m.miles, m.fuelCost.toFixed(2), m.maintCost.toFixed(2),
        m.total.toFixed(2), m.cpm > 0 ? m.cpm.toFixed(3) : '']);
    });
    downloadCSV(rows, 'cost_analytics_' + today + '.csv');
    showToast('Cost analytics exported.', 'success');

  } else if (_currentView === 'profile') {
    showToast('Nothing to export from this view.', 'info');

  } else {
    if (AppState.maintenanceLog.length === 0) { showToast('No maintenance records to export.', 'info'); return; }
    rows = [['Date', 'Service Type', 'Vehicle', 'Mileage (mi)', 'Location', 'Cost ($)', 'Notes']];
    AppState.maintenanceLog.forEach(function(m) {
      rows.push([m.date, m.service, vehicleLabel(m.vehicleId),
        m.mileage, m.location, m.cost.toFixed(2), m.notes]);
    });
    downloadCSV(rows, 'maintenance_log_' + today + '.csv');
    showToast('Maintenance log exported.', 'success');
  }
}

function initButtons() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.preventDefault();
    var action = btn.getAttribute('data-action');
    if (action === 'log-service') openAddServiceModal();
    if (action === 'add-fuel')    openAddFuelModal();
    if (action === 'add-rule')    openAddRuleModal();
    if (action === 'export')      handleExport();
  });
}


/* ══════════════════════════════════════════
   MODAL + TOAST CSS  (injected at runtime)
══════════════════════════════════════════ */
function injectStyles() {
  var style = document.createElement('style');
  style.textContent = [
    '.modal-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .2s ease;backdrop-filter:blur(4px)}',
    '.modal-overlay.modal-visible{opacity:1}',
    '.modal-box{background:var(--surface);border:1px solid var(--border-bright);border-radius:var(--radius-lg);width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.6);transform:translateY(14px);transition:transform .2s ease;overflow:hidden}',
    '.modal-overlay.modal-visible .modal-box{transform:translateY(0)}',
    '.modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}',
    '.modal-title{font-family:var(--font-head);font-size:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text)}',
    '.modal-close{background:none;border:none;color:var(--text-muted);font-size:22px;cursor:pointer;line-height:1;padding:0 6px;border-radius:var(--radius);transition:color var(--transition)}',
    '.modal-close:hover{color:var(--text)}',
    '.modal-body{padding:20px}',
    '.modal-footer{display:flex;gap:8px;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--border)}',
    '.modal-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
    '.modal-detail-key{font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:.1em;display:block;margin-bottom:4px}',
    '.modal-detail-val{font-size:14px;font-weight:600;color:var(--text)}',
    '.modal-form{display:flex;flex-direction:column;gap:14px}',
    '.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.form-group{display:flex;flex-direction:column;gap:5px}',
    '.form-label{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted)}',
    '.form-control{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;color:var(--text);font-family:var(--font-body);font-size:13px;outline:none;width:100%;transition:border-color var(--transition)}',
    '.form-control:focus{border-color:var(--accent-dim)}',
    '.form-control option{background:var(--surface-2)}',
    '.mpg-preview{display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-top:4px}',
    '.mpg-preview-label{font-family:var(--font-mono);font-size:11px;color:var(--text-muted)}',
    '.mpg-preview-val{font-family:var(--font-head);font-size:20px;font-weight:800;color:var(--accent)}',
    '.toast-container{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:2000}',
    '.toast{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border-bright);border-radius:var(--radius-lg);padding:12px 16px;min-width:280px;max-width:380px;font-size:13px;color:var(--text);box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;transform:translateX(16px);transition:opacity .2s ease,transform .2s ease}',
    '.toast.toast-visible{opacity:1;transform:translateX(0)}',
    '.toast-success{border-left:3px solid var(--green)}.toast-error{border-left:3px solid var(--red)}.toast-info{border-left:3px solid var(--blue)}',
    '.toast-success i{color:var(--green)}.toast-error i{color:var(--red)}.toast-info i{color:var(--blue)}',
    '.toast-close{margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;line-height:1}'
  ].join('\n');
  document.head.appendChild(style);
}


/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

function init() {
  var token = localStorage.getItem('jwtToken');
  if (!token) {
    window.location.href = '/';
    return;
  }
  DataModel.setToken(token);

  var decoded = decodeToken(token);
  if (decoded && decoded.email) {
    var initials = decoded.email[0].toUpperCase();
    AppState.currentUser.email    = decoded.email;
    AppState.currentUser.initials = initials;
    var avatar = qs('#userAvatar');
    if (avatar) { avatar.textContent = initials; avatar.title = decoded.email; }
  }

  injectStyles();
  initSearch();
  initNav();
  initButtons();

  loadData()
    .then(function() {
      renderStats();
      renderSidebarVehicles();
      renderServices();
      renderVehicleCards();
      renderCostChart();
      renderFuelLog();
      renderMaintenanceLog();

      var subEl = qs('#pageSubtitle');
      if (subEl) subEl.textContent = VIEW_CONFIG.dashboard.subtitle();

      setTimeout(function() {
        var n = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
        if (n > 0) showToast(n + ' service(s) are overdue and need attention.', 'error');
      }, 900);
    })
    .catch(function(err) {
      console.error('Failed to initialize dashboard:', err);
      showToast('Failed to load dashboard. Please refresh.', 'error');
    });
}

document.addEventListener('DOMContentLoaded', init);