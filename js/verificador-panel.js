// =============================================
// PANEL DE VERIFICADOR — ALABOL CAR BROKER
// =============================================

(function () {
  'use strict';

  var BUCKET = 'verificaciones';

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Supabase client — uses config.js initialization
  var _sb = null;
  function getSb() {
    if (_sb) return _sb;
    if (window.supabaseClient) { _sb = window.supabaseClient; return _sb; }
    return null;
  }

  // 12 puntos del semáforo de verificación
  var SEMAFORO_PUNTOS = [
    { key: 'documentos_completos', label: 'Documentos completos', icon: 'fa-folder-open' },
    { key: 'vin_valido', label: 'NIV valido y consistente', icon: 'fa-fingerprint' },
    { key: 'vin_no_remarcado', label: 'NIV sin indicios de remarcado', icon: 'fa-magnifying-glass' },
    { key: 'placas_vigentes', label: 'Placas vigentes', icon: 'fa-rectangle-list' },
    { key: 'sin_reporte_robo', label: 'Sin reporte de robo', icon: 'fa-shield-halved' },
    { key: 'factura_original', label: 'Factura original o endoso correcto', icon: 'fa-file-invoice' },
    { key: 'tarjeta_circulacion', label: 'Tarjeta de circulacion valida', icon: 'fa-id-card' },
    { key: 'chip_repuve', label: 'Chip REPUVE presente y legible', icon: 'fa-microchip' },
    { key: 'numero_motor', label: 'Numero de motor legible', icon: 'fa-gears' },
    { key: 'condicion_exterior', label: 'Condicion exterior aceptable', icon: 'fa-car' },
    { key: 'pintura_original', label: 'Pintura sin indicios de reparacion', icon: 'fa-paintbrush' },
    { key: 'estructura_integra', label: 'Estructura sin soldaduras sospechosas', icon: 'fa-wrench' }
  ];

  var currentView = 'list'; // 'list' | 'detail'
  var currentFolio = null;
  var verificadorId = null;

  function g(id) { return document.getElementById(id); }

  // ── AUTH GUARD ──

  function checkAuth() {
    return getSb().auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) return null;

      return getSb()
        .from('verificadores')
        .select('id, nombre, activo')
        .eq('user_id', session.user.id)
        .limit(1)
        .then(function (vRes) {
          if (vRes.error || !vRes.data || !vRes.data.length) return null;
          if (!vRes.data[0].activo) return null;
          verificadorId = vRes.data[0].id;
          return vRes.data[0];
        });
    });
  }

  // ── LOAD EXPEDIENTES ──

  function loadExpedientes(filter) {
    filter = filter || 'pendientes';
    var query = getSb()
      .from('verificaciones')
      .select('id, folio, vin, marca, modelo, anio, nombre_solicitante, tier, estatus, created_at, verificador_id')
      .order('created_at', { ascending: false });

    if (filter === 'pendientes') {
      query = query.in('estatus', ['pagado', 'en_revision']);
    } else if (filter === 'completados') {
      query = query.in('estatus', ['aprobado', 'aprobado_con_observaciones', 'rechazado']);
    }

    return query.limit(50).then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  function renderList(expedientes) {
    var container = g('expedientes-list');
    if (!container) return;

    if (!expedientes.length) {
      container.innerHTML =
        '<div class="empty-state">' +
        '<i class="fas fa-inbox"></i>' +
        '<p>No hay expedientes pendientes</p>' +
        '</div>';
      return;
    }

    var html = expedientes.map(function (exp) {
      var statusClass = exp.estatus === 'pagado' ? 'status-new' :
                        exp.estatus === 'en_revision' ? 'status-review' :
                        exp.estatus === 'aprobado' ? 'status-ok' :
                        exp.estatus === 'rechazado' ? 'status-reject' : 'status-obs';
      var statusLabel = exp.estatus === 'pagado' ? 'Nuevo' :
                        exp.estatus === 'en_revision' ? 'En revision' :
                        exp.estatus === 'aprobado' ? 'Aprobado' :
                        exp.estatus === 'aprobado_con_observaciones' ? 'Con obs.' :
                        exp.estatus === 'rechazado' ? 'Rechazado' : exp.estatus;
      var fecha = new Date(exp.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

      return (
        '<div class="exp-card" onclick="VerificadorPanel.openDetail(\'' + exp.folio + '\')">' +
        '<div class="exp-card-header">' +
        '<span class="exp-folio">' + exp.folio + '</span>' +
        '<span class="exp-status ' + statusClass + '">' + statusLabel + '</span>' +
        '</div>' +
        '<div class="exp-card-body">' +
        '<div class="exp-vehicle">' + (exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || '') + '</div>' +
        '<div class="exp-vin"><i class="fas fa-fingerprint"></i> ' + (exp.vin || '') + '</div>' +
        '<div class="exp-meta">' +
        '<span><i class="fas fa-user"></i> ' + (exp.nombre_solicitante || 'Sin nombre') + '</span>' +
        '<span><i class="fas fa-calendar"></i> ' + fecha + '</span>' +
        '<span class="exp-tier tier-' + exp.tier + '"><i class="fas fa-shield"></i> ' + (exp.tier || '').toUpperCase() + '</span>' +
        '</div>' +
        '</div>' +
        '</div>'
      );
    }).join('');

    container.innerHTML = html;
  }

  // ── DETAIL VIEW ──

  function openDetail(folio) {
    currentFolio = folio;

    getSb()
      .from('verificaciones')
      .select('*')
      .eq('folio', folio)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          alert('Expediente no encontrado');
          return;
        }
        renderDetail(res.data[0]);
      });
  }

  function renderDetail(exp) {
    currentView = 'detail';
    g('view-list').style.display = 'none';
    g('view-detail').style.display = 'block';

    // Header
    g('detail-folio').textContent = exp.folio;
    g('detail-vehicle').textContent = (exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || '');

    // Vehicle data
    g('detail-data').innerHTML =
      '<div class="data-grid">' +
      '<div><strong>NIV:</strong> ' + (exp.vin || 'N/A') + '</div>' +
      '<div><strong>Marca:</strong> ' + (exp.marca || 'N/A') + '</div>' +
      '<div><strong>Modelo:</strong> ' + (exp.modelo || 'N/A') + '</div>' +
      '<div><strong>Ano:</strong> ' + (exp.anio || 'N/A') + '</div>' +
      '<div><strong>Color:</strong> ' + (exp.color || 'N/A') + '</div>' +
      '<div><strong>Placas:</strong> ' + (exp.placas || 'N/A') + '</div>' +
      '<div><strong>Estado:</strong> ' + (exp.estado_registro || 'N/A') + '</div>' +
      '<div><strong>Solicitante:</strong> ' + (exp.nombre_solicitante || 'N/A') + '</div>' +
      '<div><strong>Email:</strong> ' + (exp.email_solicitante || 'N/A') + '</div>' +
      '<div><strong>WhatsApp:</strong> ' + (exp.telefono_solicitante || 'N/A') + '</div>' +
      '<div><strong>Tier:</strong> ' + (exp.tier || '').toUpperCase() + '</div>' +
      '<div><strong>Checksum NIV:</strong> ' + (exp.vin_checksum_valido ? '<span class="txt-ok">Valido</span>' : '<span class="txt-warn">Fallido</span>') + '</div>' +
      '</div>';

    // NHTSA data
    var nhtsaHtml = '';
    if (exp.nhtsa_data && exp.nhtsa_data.make) {
      nhtsaHtml =
        '<div class="detail-section">' +
        '<h3><i class="fas fa-database"></i> Datos NHTSA</h3>' +
        '<div class="data-grid">' +
        '<div><strong>Marca:</strong> ' + (exp.nhtsa_data.make || '') + '</div>' +
        '<div><strong>Modelo:</strong> ' + (exp.nhtsa_data.model || '') + '</div>' +
        '<div><strong>Ano:</strong> ' + (exp.nhtsa_data.year || '') + '</div>' +
        '<div><strong>Tipo:</strong> ' + (exp.nhtsa_data.bodyClass || '') + '</div>' +
        '<div><strong>Motor:</strong> ' + (exp.nhtsa_data.engineDisplacement || '') + 'L</div>' +
        '<div><strong>Fabricante:</strong> ' + (exp.nhtsa_data.manufacturer || '') + '</div>' +
        '</div></div>';
    }
    g('detail-nhtsa').innerHTML = nhtsaHtml;

    // Verification links (assisted)
    var verifyLinksHtml = '';
    if (window.VinValidator && window.VinValidator.getVerificationLinks) {
      var links = window.VinValidator.getVerificationLinks(exp.estado_registro, exp.placas, exp.vin);
      if (links.length > 0) {
        verifyLinksHtml = '<div class="detail-section"><h3><i class="fas fa-magnifying-glass"></i> Consultas de Verificacion</h3>';
        links.forEach(function (link) {
          verifyLinksHtml +=
            '<a href="' + link.url + '" target="_blank" rel="noopener" class="verify-link-card">' +
            '<i class="fas ' + link.icon + '"></i>' +
            '<div><strong>' + link.name + '</strong><br><span>' + link.description + '</span></div>' +
            '<i class="fas fa-external-link-alt"></i>' +
            '</a>';
        });
        verifyLinksHtml += '</div>';
      }
    }
    var linksContainer = g('detail-verify-links');
    if (linksContainer) linksContainer.innerHTML = verifyLinksHtml;

    // Photos
    var fotosHtml = '';
    var fotos = exp.fotos || {};
    var fotoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];
    var fotoNames = {
      niv_tablero: 'NIV en tablero', niv_chasis: 'NIV en chasis',
      numero_motor: 'Numero de motor', chip_repuve: 'Chip REPUVE',
      tarjeta_circulacion: 'Tarjeta de circulacion', factura: 'Factura'
    };

    fotoKeys.forEach(function (key) {
      var path = fotos[key];
      if (path) {
        var urlRes = getSb().storage.from(BUCKET).getPublicUrl(path);
        var url = urlRes.data ? urlRes.data.publicUrl : '';
        fotosHtml +=
          '<div class="photo-review-card">' +
          '<img src="' + url + '" alt="' + fotoNames[key] + '" onclick="VerificadorPanel.zoomPhoto(this.src)">' +
          '<div class="photo-review-label">' + fotoNames[key] + '</div>' +
          '</div>';
      }
    });
    g('detail-photos').innerHTML = fotosHtml || '<p class="txt-muted">No hay fotos disponibles</p>';

    // Auto-verify results
    var autoResults = exp.resultados_automaticos || null;
    var autoHtml = '';
    if (autoResults) {
      var scoreColor = autoResults.score >= 9 ? 'var(--emerald)' : autoResults.score >= 6 ? 'var(--warning)' : 'var(--danger)';
      autoHtml = '<div class="detail-section">' +
        '<h3><i class="fas fa-robot"></i> Verificacion Automatica</h3>' +
        '<div class="auto-score" style="text-align:center;margin-bottom:14px">' +
        '<div style="font-size:36px;font-weight:800;color:' + scoreColor + '">' + autoResults.score + '/' + autoResults.maxScore + '</div>' +
        '<div style="font-size:11px;color:var(--green-muted)">Score de confianza automatico</div>' +
        '</div>' +
        '<div class="auto-checks">';

      var checkLabels = {
        vin_checksum: 'Checksum NIV', nhtsa: 'NHTSA Decode',
        cross_reference: 'Cruce marca/modelo/ano', repuve: 'REPUVE',
        country: 'Pais de origen', ai_analysis: 'Analisis IA de fotos'
      };
      var checks = autoResults.checks || {};
      Object.keys(checks).forEach(function (key) {
        var check = checks[key];
        var isOk = check.valid || check.success || check.match || check.status === 'limpio';
        var isFail = check.valid === false || check.status === 'reporte' || check.match === false;
        var icon = isOk ? 'fa-check-circle' : isFail ? 'fa-times-circle' : 'fa-minus-circle';
        var color = isOk ? 'var(--emerald)' : isFail ? 'var(--danger)' : 'var(--warning)';
        var detail = check.error || check.message || (check.discrepancies && check.discrepancies.length ? check.discrepancies.join(', ') : '') || '';
        autoHtml += '<div class="auto-check-row" style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12px">' +
          '<i class="fas ' + icon + '" style="color:' + color + ';width:16px"></i>' +
          '<strong style="color:white;min-width:140px">' + (checkLabels[key] || key) + '</strong>' +
          '<span style="color:var(--green-muted);flex:1">' + detail + '</span>' +
          '</div>';
      });

      // AI analysis details
      if (checks.ai_analysis && checks.ai_analysis.analysis) {
        var ai = checks.ai_analysis.analysis;
        autoHtml += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(212,175,55,0.06);border:1px solid var(--gold-dim)">' +
          '<div style="font-size:11px;font-weight:700;color:var(--gold);margin-bottom:6px"><i class="fas fa-brain"></i> Analisis de IA</div>';
        if (ai.vin_leido) autoHtml += '<div style="font-size:11px;color:var(--green-text)">NIV leido en foto: <strong style="color:white;font-family:monospace">' + ai.vin_leido + '</strong> ' + (ai.vin_coincide ? '<span style="color:var(--emerald)">Coincide</span>' : '<span style="color:var(--danger)">NO coincide</span>') + '</div>';
        if (ai.indicios_remarcado) autoHtml += '<div style="font-size:11px;color:var(--danger);margin-top:4px"><i class="fas fa-exclamation-triangle"></i> ' + (ai.remarcado_detalle || 'Indicios de remarcado detectados') + '</div>';
        if (ai.alertas && ai.alertas.length) {
          ai.alertas.forEach(function (a) { autoHtml += '<div style="font-size:11px;color:var(--warning);margin-top:2px">- ' + a + '</div>'; });
        }
        autoHtml += '<div style="font-size:10px;color:var(--green-muted);margin-top:6px">Confianza: ' + (ai.confianza_general || 'N/A') + '</div>';
        autoHtml += '</div>';
      }

      autoHtml += '</div></div>';
    } else {
      autoHtml = '<div class="detail-section" style="text-align:center">' +
        '<h3><i class="fas fa-robot"></i> Verificacion Automatica</h3>' +
        '<p style="color:var(--green-muted);font-size:13px;margin-bottom:14px">La verificacion automatica no se ha ejecutado aun.</p>' +
        '<button class="btn-auto-verify" onclick="VerificadorPanel.runAutoVerify(\'' + exp.folio + '\')"><i class="fas fa-bolt"></i> Ejecutar verificacion automatica</button>' +
        '</div>';
    }
    var autoContainer = g('detail-auto-results');
    if (autoContainer) autoContainer.innerHTML = autoHtml;

    // Semáforo — con badges auto/manual
    var semaforo = exp.semaforo || {};
    currentSemaforo = Object.assign({}, semaforo); // Load existing
    var autoCheckedKeys = autoResults ? Object.keys(autoResults.semaforo || {}) : [];

    var semaforoHtml = SEMAFORO_PUNTOS.map(function (punto) {
      var valor = semaforo[punto.key] || '';
      var isAuto = autoCheckedKeys.indexOf(punto.key) !== -1;
      var badge = isAuto
        ? '<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:rgba(212,175,55,0.12);color:var(--gold);margin-left:6px">AUTO</span>'
        : '<span style="font-size:8px;padding:2px 6px;border-radius:8px;background:rgba(148,184,167,0.12);color:var(--green-muted);margin-left:6px">MANUAL</span>';
      return (
        '<div class="semaforo-row">' +
        '<div class="semaforo-label"><i class="fas ' + punto.icon + '"></i> ' + punto.label + badge + '</div>' +
        '<div class="semaforo-btns" data-key="' + punto.key + '">' +
        '<button class="sem-btn sem-verde' + (valor === 'verde' ? ' active' : '') + '" onclick="VerificadorPanel.setSemaforo(\'' + punto.key + '\', \'verde\')"><i class="fas fa-check"></i></button>' +
        '<button class="sem-btn sem-amarillo' + (valor === 'amarillo' ? ' active' : '') + '" onclick="VerificadorPanel.setSemaforo(\'' + punto.key + '\', \'amarillo\')"><i class="fas fa-exclamation"></i></button>' +
        '<button class="sem-btn sem-rojo' + (valor === 'rojo' ? ' active' : '') + '" onclick="VerificadorPanel.setSemaforo(\'' + punto.key + '\', \'rojo\')"><i class="fas fa-times"></i></button>' +
        '</div>' +
        '</div>'
      );
    }).join('');
    g('detail-semaforo').innerHTML = semaforoHtml;

    // Notes
    var notasEl = g('detail-notas');
    if (notasEl) notasEl.value = exp.notas_verificador || '';

    // Assign to me if not assigned
    if (!exp.verificador_id && verificadorId) {
      getSb()
        .from('verificaciones')
        .update({ verificador_id: verificadorId, estatus: 'en_revision' })
        .eq('id', exp.id);
    }
  }

  // ── SEMÁFORO ──

  var currentSemaforo = {};

  function setSemaforo(key, valor) {
    currentSemaforo[key] = valor;

    // Update UI
    var btns = document.querySelectorAll('.semaforo-btns[data-key="' + key + '"] .sem-btn');
    btns.forEach(function (btn) { btn.classList.remove('active'); });

    var activeClass = 'sem-' + valor;
    var btnsAll = document.querySelectorAll('.semaforo-btns[data-key="' + key + '"] .' + activeClass);
    btnsAll.forEach(function (btn) { btn.classList.add('active'); });
  }

  // ── ACTIONS ──

  function aprobar() {
    var incomplete = SEMAFORO_PUNTOS.filter(function (p) { return !currentSemaforo[p.key]; });
    if (incomplete.length > 0) {
      alert('Evalua todos los puntos del semaforo antes de aprobar. Faltan: ' + incomplete.map(function (p) { return p.label; }).join(', '));
      return;
    }

    var hasRojo = SEMAFORO_PUNTOS.some(function (p) { return currentSemaforo[p.key] === 'rojo'; });
    var hasAmarillo = SEMAFORO_PUNTOS.some(function (p) { return currentSemaforo[p.key] === 'amarillo'; });

    var resultado, estatus;
    if (hasRojo) {
      if (!confirm('Hay puntos en ROJO. Esto significa NO APROBADO. Confirmar?')) return;
      resultado = 'no_aprobado';
      estatus = 'rechazado';
    } else if (hasAmarillo) {
      resultado = 'aprobado_con_observaciones';
      estatus = 'aprobado_con_observaciones';
    } else {
      resultado = 'aprobado';
      estatus = 'aprobado';
    }

    var notas = g('detail-notas') ? g('detail-notas').value.trim() : '';

    getSb()
      .from('verificaciones')
      .update({
        semaforo: currentSemaforo,
        notas_verificador: notas,
        resultado_final: resultado,
        estatus: estatus,
        aprobado_at: new Date().toISOString(),
        vigencia_certificado: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      .eq('folio', currentFolio)
      .then(function (res) {
        if (res.error) {
          alert('Error: ' + res.error.message);
          return;
        }
        // Notificar al cliente por email
        var _folio = currentFolio;
        var _resultado = resultado;
        sendNotification(_folio, 'dictamen').then(function (ok) {
          alert('Verificacion ' + _resultado.replace(/_/g, ' ') + ' — Folio: ' + _folio + (ok ? '. Cliente notificado por correo.' : '. Nota: el email no se pudo enviar.'));
          backToList();
        });
      });
  }

  function rechazar() {
    var motivo = prompt('Motivo del rechazo:');
    if (!motivo) return;

    getSb()
      .from('verificaciones')
      .update({
        semaforo: currentSemaforo,
        notas_verificador: motivo,
        resultado_final: 'no_aprobado',
        estatus: 'rechazado'
      })
      .eq('folio', currentFolio)
      .then(function (res) {
        if (res.error) {
          alert('Error: ' + res.error.message);
          return;
        }
        var _folio = currentFolio;
        sendNotification(_folio, 'dictamen').then(function (ok) {
          alert('Verificacion rechazada — Folio: ' + _folio + (ok ? '. Cliente notificado.' : '. Email no enviado.'));
          backToList();
        });
      });
  }

  function getAuthHeaders() {
    var h = { 'Content-Type': 'application/json' };
    // Send session token for function auth
    var sb = getSb();
    if (sb && sb.auth) {
      try {
        var session = sb.auth.session && sb.auth.session();
        if (session && session.access_token) h['Authorization'] = 'Bearer ' + session.access_token;
      } catch (e) { /* no session */ }
    }
    return h;
  }

  function sendNotification(folio, tipo) {
    return fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ folio: folio, tipo: tipo })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) return false;
      return data.sent || data.success;
    })
    .catch(function () { return false; });
  }

  function previewEmail(folio) {
    fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ folio: folio, tipo: 'dictamen' })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var html = data.html;
      if (!html) { alert('No se pudo generar preview'); return; }
      var overlay = document.createElement('div');
      overlay.className = 'photo-zoom-overlay';
      overlay.style.background = 'rgba(0,0,0,0.95)';
      overlay.innerHTML =
        '<div style="width:90%;max-width:620px;max-height:90vh;overflow-y:auto;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">' +
        '<iframe sandbox="" srcdoc="' + html.replace(/"/g, '&quot;') + '" style="width:100%;height:80vh;border:none;border-radius:12px"></iframe>' +
        '</div>' +
        '<button class="zoom-close" onclick="this.parentElement.remove()" style="position:absolute;top:16px;right:16px">&times;</button>';
      overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
      document.body.appendChild(overlay);
    });
  }

  function runAutoVerify(folio) {
    var btn = document.querySelector('.btn-auto-verify');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analizando con IA...'; }

    fetch('/.netlify/functions/auto-verify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ folio: folio })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        alert('Error en verificacion automatica: ' + data.error);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> Ejecutar verificacion automatica'; }
        return;
      }
      alert('Verificacion automatica completada: ' + data.score + ' — Recargando expediente...');
      openDetail(folio); // Reload detail with new data
    })
    .catch(function (err) {
      alert('Error: ' + err.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> Ejecutar verificacion automatica'; }
    });
  }

  function backToList() {
    currentView = 'list';
    currentFolio = null;
    currentSemaforo = {};
    g('view-detail').style.display = 'none';
    g('view-list').style.display = 'block';
    refreshList();
  }

  function refreshList() {
    var activeFilter = document.querySelector('.filter-btn.active');
    var filter = activeFilter ? activeFilter.dataset.filter : 'pendientes';
    loadExpedientes(filter).then(renderList).catch(function (err) {
      console.error('Error loading expedientes:', err);
    });
  }

  function setFilter(filter) {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    loadExpedientes(filter).then(renderList);
  }

  var galleryPhotos = [];
  var galleryIndex = 0;

  function zoomPhoto(src) {
    // Collect all visible photos for gallery navigation
    galleryPhotos = [];
    document.querySelectorAll('.photo-review-card img').forEach(function (img) {
      galleryPhotos.push(img.src);
    });
    galleryIndex = galleryPhotos.indexOf(src);
    if (galleryIndex === -1) galleryIndex = 0;
    showGallery();
  }

  function showGallery() {
    var existing = document.querySelector('.photo-zoom-overlay');
    if (existing) existing.remove();

    var total = galleryPhotos.length;
    var overlay = document.createElement('div');
    overlay.className = 'photo-zoom-overlay';
    overlay.innerHTML =
      '<button class="gallery-nav gallery-prev" onclick="event.stopPropagation();VerificadorPanel.galleryPrev()"><i class="fas fa-chevron-left"></i></button>' +
      '<img src="' + galleryPhotos[galleryIndex] + '" alt="Foto">' +
      '<button class="gallery-nav gallery-next" onclick="event.stopPropagation();VerificadorPanel.galleryNext()"><i class="fas fa-chevron-right"></i></button>' +
      '<div class="gallery-counter">' + (galleryIndex + 1) + ' / ' + total + '</div>' +
      '<button class="zoom-close" onclick="event.stopPropagation();this.parentElement.remove()">&times;</button>';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);

    // Keyboard navigation
    overlay._keyHandler = function (e) {
      if (e.key === 'ArrowRight') galleryNext();
      else if (e.key === 'ArrowLeft') galleryPrev();
      else if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', overlay._keyHandler); }
    };
    document.addEventListener('keydown', overlay._keyHandler);
  }

  function galleryNext() {
    if (galleryPhotos.length === 0) return;
    galleryIndex = (galleryIndex + 1) % galleryPhotos.length;
    showGallery();
  }

  function galleryPrev() {
    if (galleryPhotos.length === 0) return;
    galleryIndex = (galleryIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
    showGallery();
  }

  // ── STATS ──

  function loadStats() {
    Promise.all([
      getSb().from('verificaciones').select('id', { count: 'exact', head: true }).in('estatus', ['pagado', 'en_revision']),
      getSb().from('verificaciones').select('id', { count: 'exact', head: true }).eq('estatus', 'en_revision').eq('verificador_id', verificadorId),
      getSb().from('verificaciones').select('id', { count: 'exact', head: true }).in('estatus', ['aprobado', 'aprobado_con_observaciones']).gte('aprobado_at', new Date().toISOString().split('T')[0])
    ]).then(function (results) {
      var pendientes = results[0].count || 0;
      var enRevision = results[1].count || 0;
      var aprobadosHoy = results[2].count || 0;

      var statPend = g('stat-pendientes');
      var statRev = g('stat-revision');
      var statApproved = g('stat-aprobados');
      if (statPend) statPend.textContent = pendientes;
      if (statRev) statRev.textContent = enRevision;
      if (statApproved) statApproved.textContent = aprobadosHoy;
    });
  }

  // ── INIT ──

  function init() {
    checkAuth().then(function (verificador) {
      if (!verificador) {
        g('panel-loading').style.display = 'none';
        g('panel-denied').style.display = 'flex';
        return;
      }
      g('panel-loading').style.display = 'none';
      g('panel-content').style.display = 'block';
      g('verificador-nombre').textContent = verificador.nombre;

      loadStats();
      refreshList();
    });
  }

  // Expose
  window.VerificadorPanel = {
    init: init,
    openDetail: openDetail,
    setSemaforo: setSemaforo,
    aprobar: aprobar,
    rechazar: rechazar,
    backToList: backToList,
    setFilter: setFilter,
    zoomPhoto: zoomPhoto,
    galleryNext: galleryNext,
    galleryPrev: galleryPrev,
    runAutoVerify: runAutoVerify,
    previewEmail: previewEmail,
    SEMAFORO_PUNTOS: SEMAFORO_PUNTOS
  };

})();
