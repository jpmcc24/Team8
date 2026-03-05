/* ============================================
   VEHICLE MAINTENANCE TRACKER — dashboard.js
   Team GR8 | Place this file in public/js/
   ============================================ */

'use strict';

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const VEHICLE_COLORS = ['#e8c547', '#5b8dee', '#4caf81', '#e05c5c', '#9b59b6', '#f39c12'];

/* ══════════════════════════════════════════
   DATA STORE  (populated from API on load)
══════════════════════════════════════════ */
const AppState = {
  currentUser:    { name: '', initials: '' },
  vehicles:       [],
  services:       [],
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

function statusTag(status, daysOverdue, daysUntil) {
  if (status === 'overdue') return '<span class="service-due-tag tag-overdue">Overdue ' + daysOverdue + ' days</span>';
  if (status === 'warning') return '<span class="service-due-tag tag-warning">Due in ' + daysUntil + ' days</span>';
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
  const [rawVehicles, rawMaintenance, rawFuel, rawReminders] = await Promise.all([
    DataModel.getVehicles(),
    DataModel.getMaintenance(),
    DataModel.getFuel(),
    DataModel.getReminders(),
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
    var dueDate = dueStr ? new Date(dueStr) : null;
    var status = 'ok', daysOverdue = 0, daysUntil = 999;

    if (dueDate) {
      var diff = Math.round((dueDate - today) / 86400000);
      if      (diff < 0)       { status = 'overdue'; daysOverdue = -diff; }
      else if (diff <= 30)     { status = 'warning'; daysUntil = diff; }
      else                     { status = 'ok';      daysUntil = diff; }
    }

    return {
      id:        'r' + r.id,
      vehicleId: 'v' + r.vehicle_id,
      name:      r.service_type,
      dueDate:   dueStr || '',
      status, daysOverdue, daysUntil,
    };
  });

  // Derive health / openItems per vehicle from reminders
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
      if (miles > 0 && entries[i].gallons > 0) {
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
   RENDER FUNCTIONS
══════════════════════════════════════════ */
function renderStats() {
  var overdueCount = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
  var lastSpend    = AppState.monthlySpend.length > 0
    ? AppState.monthlySpend[AppState.monthlySpend.length - 1].amount : 0;
  var total  = AppState.vehicles.reduce(function(s, v){ return s + v.avgMpg; }, 0);
  var avgMpg = AppState.vehicles.length > 0
    ? (total / AppState.vehicles.length).toFixed(1) : '—';

  function set(id, val) { var el = qs('#' + id); if (el) el.textContent = val; }
  set('statVehicles', AppState.vehicles.length);
  set('statOverdue',  overdueCount);
  set('statSpend',    '$' + lastSpend);
  set('statMpg',      avgMpg);

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
    return '<div class="service-item" data-service-id="' + s.id + '" role="button" tabindex="0">' +
      '<div class="service-status ' + statusDotClass(s.status) + '"></div>' +
      '<div class="service-info">' +
        '<div class="service-name">' + s.name + '</div>' +
        '<div class="service-vehicle">' + vehicleLabel(s.vehicleId) + '</div>' +
      '</div>' +
      '<div class="service-due">' +
        '<span class="service-due-date">' + (s.dueDate ? formatDate(s.dueDate) : '—') + '</span>' +
        statusTag(s.status, s.daysOverdue, s.daysUntil) +
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
  var max       = Math.max.apply(null, amounts.concat([1])); // avoid divide-by-zero
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

function renderFuelLog() {
  var container = qs('#fuelList');
  if (!container) return;

  if (AppState.fuelLog.length === 0) {
    container.innerHTML = '<div class="empty-state">No fuel entries yet.</div>';
    return;
  }

  container.innerHTML = AppState.fuelLog.map(function(f) {
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
      '</div></div>';
  }).join('');
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
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' + msg + '</td></tr>';
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
    '</tr>';
  }).join('');
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
  var v           = getVehicle(s.vehicleId);
  var statusMap   = { overdue: 'tag-overdue', warning: 'tag-warning', ok: 'tag-ok' };
  var statusLabel = s.status === 'overdue' ? 'Overdue ' + s.daysOverdue + ' days'
                  : s.status === 'warning' ? 'Due in '  + s.daysUntil  + ' days'
                  : 'On schedule';

  var modal = createModal('Service Detail',
    '<div class="modal-detail-grid">' +
      '<div class="modal-detail-item"><span class="modal-detail-key">SERVICE</span>' +
        '<span class="modal-detail-val">' + s.name + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">VEHICLE</span>' +
        '<span class="modal-detail-val">' + (v ? v.year + ' ' + v.make + ' ' + v.model : '—') + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">DUE DATE</span>' +
        '<span class="modal-detail-val">' + (s.dueDate ? formatDate(s.dueDate) : '—') + '</span></div>' +
      '<div class="modal-detail-item"><span class="modal-detail-key">STATUS</span>' +
        '<span class="service-due-tag ' + statusMap[s.status] + '">' + statusLabel + '</span></div>' +
      (v ? '<div class="modal-detail-item"><span class="modal-detail-key">CURRENT MILEAGE</span>' +
        '<span class="modal-detail-val">' + formatMileage(v.odometer) + '</span></div>' : '') +
    '</div>',
    [{ label: 'Log as Completed', cls: 'btn-primary',  action: 'complete' },
     { label: 'Dismiss',          cls: 'btn-secondary', action: 'dismiss'  }]
  );

  qsa('[data-modal-action]', modal).forEach(function(btn) {
    btn.addEventListener('click', async function() {
      btn.disabled = true;
      if (btn.dataset.modalAction === 'complete') await logServiceComplete(serviceId);
      closeModal();
    });
  });
}

async function logServiceComplete(serviceId) {
  var idx = AppState.services.findIndex(function(s){ return s.id === serviceId; });
  if (idx === -1) return;

  var s               = AppState.services[idx];
  var v               = getVehicle(s.vehicleId);
  var reminderId      = parseInt(s.id.slice(1));        // 'r12' → 12
  var numericVehicleId = parseInt(s.vehicleId.slice(1)); // 'v3'  → 3

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

    // Refresh vehicle health stats
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
        '<input id="fsService" class="form-control" type="text" placeholder="e.g. Oil Change" /></div>' +
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

  var numericVehicleId = parseInt(vehicleId.slice(1)); // 'v3' → 3

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


/* ── Add Fuel Modal ── */
function openAddFuelModal() {
  var activeId = AppState.activeVehicleId;
  var opts = AppState.vehicles.map(function(v) {
    var sel = (v.id === activeId) ? ' selected' : '';
    return '<option value="' + v.id + '"' + sel + '>' + v.year + ' ' + v.make + ' ' + v.model + '</option>';
  }).join('');

  var modal = createModal('Log Fuel Fill-up',
    '<div class="modal-form">' +
      '<div class="form-group"><label class="form-label" for="ffVehicle">Vehicle</label>' +
        '<select id="ffVehicle" class="form-control">' + (activeId ? '' : '<option value="" disabled selected>Select a vehicle…</option>') + opts + '</select></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="ffDate">Date</label>' +
          '<input id="ffDate" class="form-control" type="date" value="' + new Date().toISOString().slice(0, 10) + '" /></div>' +
        '<div class="form-group"><label class="form-label" for="ffOdometer">Odometer (mi)</label>' +
          '<input id="ffOdometer" class="form-control" type="number" placeholder="e.g. 84500" min="0" /></div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="ffGallons">Gallons</label>' +
          '<input id="ffGallons" class="form-control" type="number" placeholder="e.g. 10.5" min="0.1" step="0.1" /></div>' +
        '<div class="form-group"><label class="form-label" for="ffCost">Total Cost ($)</label>' +
          '<input id="ffCost" class="form-control" type="number" placeholder="0.00" min="0" step="0.01" /></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="ffStation">Station / Location</label>' +
        '<input id="ffStation" class="form-control" type="text" placeholder="e.g. Shell on Main St" /></div>' +
      '<div id="mpgPreview" class="mpg-preview" style="display:none;">' +
        '<span class="mpg-preview-label">Calculated MPG</span>' +
        '<span class="mpg-preview-val" id="mpgPreviewVal">—</span>' +
      '</div>' +
    '</div>',
    [{ label: 'Save Fill-up', cls: 'btn-primary',  action: 'save'   },
     { label: 'Cancel',       cls: 'btn-secondary', action: 'cancel' }]
  );

  // Live MPG preview
  function calcMpg() {
    var vehicleId  = qs('#ffVehicle')  ? qs('#ffVehicle').value  : '';
    var odometer   = parseFloat(qs('#ffOdometer') ? qs('#ffOdometer').value : '');
    var gallons    = parseFloat(qs('#ffGallons')  ? qs('#ffGallons').value  : '');
    var preview    = qs('#mpgPreview');
    var previewVal = qs('#mpgPreviewVal');
    if (!preview || !previewVal) return;
    var v = getVehicle(vehicleId);
    if (v && !isNaN(odometer) && !isNaN(gallons) && gallons > 0 && odometer > v.odometer) {
      var mpg = ((odometer - v.odometer) / gallons).toFixed(1);
      previewVal.textContent = mpg + ' MPG';
      previewVal.style.color = mpgColor(parseFloat(mpg));
      preview.style.display  = 'flex';
    } else {
      preview.style.display = 'none';
    }
  }

  ['#ffVehicle', '#ffOdometer', '#ffGallons'].forEach(function(sel) {
    var el = qs(sel, modal);
    if (el) el.addEventListener('input', calcMpg);
  });

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

  if (!vehicleId || !date || isNaN(odometer) || isNaN(gallons) || isNaN(cost)) {
    showToast('Please fill in all required fields.', 'error');
    return false;
  }

  var numericVehicleId = parseInt(vehicleId.slice(1)); // 'v3' → 3
  var pricePerGallon   = gallons > 0 ? parseFloat((cost / gallons).toFixed(4)) : 0;

  var v            = getVehicle(vehicleId);
  var prevOdometer = v ? v.odometer : odometer;
  var miles        = odometer - prevOdometer;
  var mpg          = miles > 0 && gallons > 0 ? parseFloat((miles / gallons).toFixed(1)) : 0;

  try {
    var result = await DataModel.addFuel({
      vehicle_id: numericVehicleId, date, gallons,
      price_per_gallon: pricePerGallon, mileage: odometer, station,
    });

    AppState.fuelLog.unshift({
      id: 'f' + result.id, vehicleId, date, station,
      gallons, cost, mpg, odometer,
    });

    if (v && odometer > v.odometer) {
      v.odometer = odometer;
      if (mpg > 0) v.avgMpg = parseFloat(((v.avgMpg + mpg) / 2).toFixed(1));
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

    renderSidebarVehicles();
    renderVehicleCards();
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
    'This will also remove all associated maintenance records, fuel logs, and service reminders.</p>',
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

          AppState.vehicles = AppState.vehicles.filter(function(x) { return x.id !== vehicleId; });
          AppState.services       = AppState.services.filter(function(s) { return s.vehicleId !== vehicleId; });
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

// Which dashboard sections to show/hide for each view.
// Panels inside sectionRow1/sectionRow2 are moved into #viewContainer
// so they can be displayed full-width without their grid wrapper.
var VIEW_CONFIG = {
  dashboard:   {
    title:    'Fleet <span>Dashboard</span>',
    subtitle: function() {
      return '// ' + AppState.vehicles.length + ' VEHICLE' +
             (AppState.vehicles.length !== 1 ? 'S' : '') + ' TRACKED';
    },
    sections: ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance'],
    panel:    null,
  },
  vehicles:    {
    title:    'My <span>Vehicles</span>',
    subtitle: function() {
      return '// ' + AppState.vehicles.length + ' REGISTERED';
    },
    panel: 'panelVehicles',
  },
  maintenance: {
    title:    'Maintenance <span>Log</span>',
    subtitle: function() {
      return '// ' + AppState.maintenanceLog.length + ' RECORDS';
    },
    panel: 'panelMaintenance',
  },
  schedule:    {
    title:    'Service <span>Schedule</span>',
    subtitle: function() {
      var n = AppState.services.filter(function(s){ return s.status === 'overdue'; }).length;
      return '// ' + AppState.services.length + ' SERVICES' + (n > 0 ? ' · ' + n + ' OVERDUE' : '');
    },
    panel: 'panelSchedule',
  },
  fuel:        {
    title:    'Fuel <span>Tracker</span>',
    subtitle: function() {
      return '// ' + AppState.fuelLog.length + ' ENTRIES';
    },
    panel: 'panelFuelLog',
  },
  analytics:   {
    title:    'Cost <span>Analytics</span>',
    subtitle: function() { return '// MONTHLY SPENDING BREAKDOWN'; },
    panel: 'panelCostChart',
  },
  profile:     {
    title:    'My <span>Profile</span>',
    subtitle: function() { return '// ACCOUNT DETAILS'; },
    panel: 'panelProfile',
  },
};

// Track where panels lived before being moved into #viewContainer
var _panelOrigins = {};
var _currentView  = 'dashboard';

function switchView(viewName) {
  var config = VIEW_CONFIG[viewName];
  if (!config) return;

  var viewContainer = qs('#viewContainer');

  // ── 1. Restore any panel that was previously moved out ──
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

  // ── 2. Hide everything that lives in the grid sections ──
  var allSections = ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance', 'panelProfile'];
  allSections.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  viewContainer.style.display = 'none';
  viewContainer.innerHTML = '';

  if (viewName === 'dashboard') {
    // Show all dashboard sections
    ['sectionStats', 'sectionRow1', 'sectionRow2', 'panelMaintenance'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = '';
    });
  } else {
    // Show stats row on every view
    var stats = qs('#sectionStats');
    if (stats) stats.style.display = '';

    // Move the target panel into the view container
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

  // ── 3. Update page title / subtitle ──
  var titleEl = qs('#pageTitle');
  var subEl   = qs('#pageSubtitle');
  if (titleEl) titleEl.innerHTML  = config.title;
  if (subEl)   subEl.textContent  = config.subtitle();

  // ── 4. Update profile panel content when visiting profile ──
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
  }

  // ── 5. Sync active class on nav items ──
  qsa('.nav-item[data-view]').forEach(function(l) {
    l.classList.toggle('active', l.dataset.view === viewName);
  });

  // ── 6. Sync primary action button ──
  var primaryBtn = qs('#pageActionPrimary');
  if (primaryBtn) {
    if (viewName === 'fuel') {
      primaryBtn.innerHTML = '<i class="fa-solid fa-gas-pump"></i> Log Fuel';
      primaryBtn.setAttribute('data-action', 'add-fuel');
    } else {
      primaryBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Log Service';
      primaryBtn.setAttribute('data-action', 'log-service');
    }
  }

  // ── 7. Sync fuel panel header + summary ──
  var fuelTitle   = qs('#fuelPanelTitle');
  var fuelAction  = qs('#fuelPanelAction');
  var fuelSummary = qs('#fuelSummary');
  if (fuelTitle)  fuelTitle.textContent    = (viewName === 'fuel') ? 'Fuel Log' : 'Recent Fuel Entries';
  if (fuelAction) fuelAction.style.display = (viewName === 'fuel') ? 'none' : '';
  if (fuelSummary) {
    if (viewName === 'fuel') { updateFuelSummary(); }
    else                     { fuelSummary.style.display = 'none'; }
  }

  _currentView = viewName;
}

function initNav() {
  // Nav item clicks
  qsa('.nav-item[data-view]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      switchView(link.dataset.view);
    });
  });

  // Logo click → dashboard
  var logo = qs('.topbar-logo[data-view]');
  if (logo) {
    logo.addEventListener('click', function(e) {
      e.preventDefault();
      switchView('dashboard');
    });
  }

  // Panel-action "View all →" / "Manage →" etc.
  document.addEventListener('click', function(e) {
    var link = e.target.closest('[data-nav]');
    if (!link) return;
    e.preventDefault();
    switchView(link.dataset.nav);
  });

  // Sign out
  var signOut = qs('#signOutLink');
  if (signOut) {
    signOut.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.removeItem('jwtToken');
      window.location.href = '/';
    });
  }

  // Notification bell
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
   BUTTON WIRING — event delegation
══════════════════════════════════════════ */
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
    rows = [['Month', 'Spend ($)']];
    AppState.monthlySpend.forEach(function(m) { rows.push([m.month, m.amount]); });
    downloadCSV(rows, 'cost_analytics_' + today + '.csv');
    showToast('Cost analytics exported.', 'success');

  } else if (_currentView === 'profile') {
    showToast('Nothing to export from this view.', 'info');

  } else {
    // dashboard or maintenance → export full maintenance log
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
  // Auth guard — redirect to login if no token
  var token = localStorage.getItem('jwtToken');
  if (!token) {
    window.location.href = '/';
    return;
  }
  DataModel.setToken(token);

  // Populate user avatar from JWT payload
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

      // Update dashboard subtitle now that vehicle count is known
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