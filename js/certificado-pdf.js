// =============================================
// CERTIFICADO PDF — ALABOL CAR BROKER
// Reporte Premium de Verificación Vehicular
// =============================================

(function () {
  'use strict';

  var BUCKET = 'verificaciones';
  var SITE_URL = 'https://alabolcar.com.mx';

  var _sb = null;
  function getSb() {
    if (_sb) return _sb;
    if (window.supabaseClient) { _sb = window.supabaseClient; return _sb; }
    return null;
  }

  // Colors
  var C = {
    bg: [10, 31, 26],
    bgLight: [13, 41, 33],
    gold: [212, 175, 55],
    goldRgb: '#D4AF37',
    white: [255, 255, 255],
    text: [168, 197, 184],
    green: [52, 211, 153],
    red: [239, 68, 68],
    yellow: [245, 158, 11],
    muted: [107, 143, 123]
  };

  var SEMAFORO_LABELS = {
    documentos_completos: 'Documentos completos',
    vin_valido: 'NIV valido y consistente',
    vin_no_remarcado: 'Sin indicios de remarcado',
    placas_vigentes: 'Placas vigentes',
    sin_reporte_robo: 'Sin reporte de robo',
    factura_original: 'Factura / carta factura',
    tarjeta_circulacion: 'Tarjeta de circulacion',
    chip_repuve: 'Chip REPUVE',
    numero_motor: 'Numero de motor',
    condicion_exterior: 'Condicion exterior',
    pintura_original: 'Pintura original',
    estructura_integra: 'Integridad estructural'
  };

  function generateQR(text) {
    return new Promise(function (resolve) {
      if (typeof QRCode === 'undefined') { resolve(null); return; }
      var container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(container);
      new QRCode(container, { text: text, width: 256, height: 256, colorDark: '#D4AF37', colorLight: '#0a1f1a', correctLevel: QRCode.CorrectLevel.M });
      setTimeout(function () {
        var canvas = container.querySelector('canvas');
        resolve(canvas ? canvas.toDataURL('image/png') : null);
        document.body.removeChild(container);
      }, 150);
    });
  }

  function loadImageBase64(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  // ── MAIN GENERATE ──

  function generateCertificado(v, qrDataUrl, photoImages) {
    var doc = new jspdf.jsPDF('p', 'mm', 'a4');
    var W = 210, H = 297;
    var m = 12; // margin
    var cw = W - m * 2; // content width
    var y;

    // ══════════════════════════════════════
    // PAGE 1 — PORTADA + DATOS + SEMÁFORO
    // ══════════════════════════════════════

    // Background
    doc.setFillColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.rect(0, 0, W, H, 'F');

    // Gold accent line top
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(0, 0, W, 2.5, 'F');

    // ── HEADER BAND ──
    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.rect(0, 2.5, W, 38, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.text('REPORTE DE VERIFICACION VEHICULAR', m, 16);

    doc.setFontSize(9);
    doc.setTextColor(C.text[0], C.text[1], C.text[2]);
    doc.text('Alabol Car Broker — El Tinder de los Autos', m, 23);

    // Folio big
    doc.setFontSize(20);
    doc.setFont('courier', 'bold');
    doc.setTextColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.text(v.folio || '', m, 34);

    // QR top right
    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', W - m - 28, 6, 28, 28);
    }

    y = 46;

    // ── RESULTADO BANNER ──
    var resultado = v.resultado_final || 'pendiente';
    var esAprobado = resultado === 'aprobado';
    var esObs = resultado === 'aprobado_con_observaciones';
    var esRechazado = resultado === 'no_aprobado';

    var bannerColor = esAprobado ? C.green : esObs ? C.yellow : esRechazado ? C.red : C.text;
    var bannerText = esAprobado ? 'GREEN FLAGS — APROBADO' :
                     esObs ? 'YELLOW FLAGS — APROBADO CON OBSERVACIONES' :
                     esRechazado ? 'RED FLAGS — NO APROBADO' : 'EN PROCESO';

    doc.setFillColor(bannerColor[0], bannerColor[1], bannerColor[2]);
    doc.roundedRect(m, y, cw, 11, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.text(bannerText, W / 2, y + 7.5, { align: 'center' });
    y += 16;

    // ── DATOS DEL VEHÍCULO — 2 columnas ──
    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.roundedRect(m, y, cw, 42, 2, 2, 'F');

    // Gold header bar
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(m, y, cw, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.text('IDENTIDAD DEL VEHICULO', m + 3, y + 4.2);
    y += 9;

    var col1 = m + 3;
    var col2 = m + cw / 2 + 3;

    function dataRow(label, value, x, yPos) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
      doc.text(label, x, yPos);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(C.white[0], C.white[1], C.white[2]);
      doc.text(String(value || 'N/A'), x, yPos + 4);
    }

    dataRow('NIV / VIN', v.vin, col1, y);
    dataRow('PAIS DE ORIGEN', detectCountry(v.vin), col2, y);
    y += 10;
    dataRow('MARCA', v.marca, col1, y);
    dataRow('MODELO', v.modelo, col2, y);
    y += 10;
    dataRow('AÑO', v.anio, col1, y);
    dataRow('COLOR', v.color, col2, y);
    y += 10;
    dataRow('PLACAS', v.placas, col1, y);
    dataRow('ESTADO', v.estado_registro, col2, y);

    y += 12;

    // ── SCORE GAUGE ──
    var semaforo = v.semaforo || {};
    var verdes = 0, amarillos = 0, rojos = 0;
    Object.values(semaforo).forEach(function (v) {
      if (v === 'verde') verdes++;
      else if (v === 'amarillo') amarillos++;
      else if (v === 'rojo') rojos++;
    });
    var score = verdes + amarillos * 0.5;
    var pct = Math.round((score / 12) * 100);

    // Score box
    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.roundedRect(m, y, 40, 20, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(pct >= 75 ? C.green[0] : pct >= 50 ? C.yellow[0] : C.red[0],
                     pct >= 75 ? C.green[1] : pct >= 50 ? C.yellow[1] : C.red[1],
                     pct >= 75 ? C.green[2] : pct >= 50 ? C.yellow[2] : C.red[2]);
    doc.text(score + '/12', m + 20, y + 11, { align: 'center' });

    doc.setFontSize(6);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text('SCORE DE CONFIANZA', m + 20, y + 17, { align: 'center' });

    // Mini counts
    doc.setFontSize(8);
    doc.setTextColor(C.green[0], C.green[1], C.green[2]);
    doc.text(verdes + ' OK', m + 48, y + 7);
    doc.setTextColor(C.yellow[0], C.yellow[1], C.yellow[2]);
    doc.text(amarillos + ' OBS', m + 48, y + 13);
    doc.setTextColor(C.red[0], C.red[1], C.red[2]);
    doc.text(rojos + ' ALERTA', m + 48, y + 19);

    // ── SEMÁFORO TABLE ── (right side of score)
    var semX = m + 72;
    var semW = cw - 72 + m;
    var semY = y;

    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.roundedRect(semX - 2, semY, semW + 2, 46, 2, 2, 'F');

    // Header
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(semX - 2, semY, semW + 2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.text('SEMAFORO DE VERIFICACION — 12 PUNTOS', semX + 1, semY + 3.5);
    semY += 7;

    var semKeys = Object.keys(SEMAFORO_LABELS);
    // Two columns
    var halfCount = Math.ceil(semKeys.length / 2);

    semKeys.forEach(function (key, i) {
      var col = i < halfCount ? 0 : 1;
      var row = i < halfCount ? i : i - halfCount;
      var sx = semX + (col * (semW / 2));
      var sy = semY + row * 6.2;

      var val = semaforo[key] || 'pendiente';
      var dotColor = val === 'verde' ? C.green : val === 'amarillo' ? C.yellow : val === 'rojo' ? C.red : C.muted;

      doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
      doc.circle(sx + 2, sy + 0.5, 1.5, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(C.text[0], C.text[1], C.text[2]);
      doc.text(SEMAFORO_LABELS[key], sx + 5.5, sy + 1.5);
    });

    y += 50;

    // ── TITULAR / SOLICITANTE ──
    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.roundedRect(m, y, cw, 14, 2, 2, 'F');

    dataRow('SOLICITANTE', v.nombre_solicitante, col1, y + 2);
    dataRow('TITULAR EN TARJETA', v.nombre_titular || v.nombre_solicitante || 'N/A', col2, y + 2);
    y += 18;

    // ── CHECKS AUTOMÁTICOS ──
    var auto = v.resultados_automaticos || {};
    var checks = auto.checks || {};

    doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
    doc.roundedRect(m, y, cw, 22, 2, 2, 'F');

    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(m, y, cw, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.text('VERIFICACIONES AUTOMATICAS (IA + BASES DE DATOS)', m + 3, y + 3.5);
    y += 7;

    var checkItems = [
      { label: 'Checksum NIV (ISO 3779)', ok: checks.vin_checksum && checks.vin_checksum.valid },
      { label: 'NHTSA Decode', ok: checks.nhtsa && checks.nhtsa.success },
      { label: 'Cruce marca/modelo/ano', ok: checks.cross_reference && checks.cross_reference.match },
      { label: 'Consulta REPUVE', ok: checks.repuve && checks.repuve.status === 'limpio', pending: checks.repuve && checks.repuve.status === 'pendiente' },
      { label: 'Analisis IA fotos', ok: checks.ai_analysis && checks.ai_analysis.success }
    ];

    checkItems.forEach(function (item, i) {
      var ix = m + 3 + (i % 3) * (cw / 3);
      var iy = y + Math.floor(i / 3) * 6;
      var icon = item.ok ? 'OK' : item.pending ? '--' : 'X';
      var iconColor = item.ok ? C.green : item.pending ? C.yellow : C.red;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(iconColor[0], iconColor[1], iconColor[2]);
      doc.text(icon, ix, iy + 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(C.text[0], C.text[1], C.text[2]);
      doc.text(' ' + item.label, ix + 5, iy + 1);
    });

    y += 18;

    // ── OBSERVACIONES ──
    if (v.notas_verificador) {
      doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
      var notasLines = doc.splitTextToSize(v.notas_verificador, cw - 6);
      var notasH = 8 + notasLines.length * 3.5;
      doc.roundedRect(m, y, cw, notasH, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(C.gold[0], C.gold[1], C.gold[2]);
      doc.text('OBSERVACIONES DEL VERIFICADOR', m + 3, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(C.text[0], C.text[1], C.text[2]);
      doc.text(notasLines, m + 3, y + 9.5);
      y += notasH + 3;
    }

    // ── FECHAS ──
    var fechaEmision = v.aprobado_at ? new Date(v.aprobado_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pendiente';
    var fechaVigencia = v.vigencia_certificado ? new Date(v.vigencia_certificado).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
    var tierLabel = v.tier === 'basico' ? 'Escudo' : v.tier === 'verificado' ? 'Escudo Pro' : 'Escudo Total';

    doc.setFontSize(7);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text('Emitido: ' + fechaEmision + '    |    Vigencia: ' + fechaVigencia + '    |    Plan: ' + tierLabel, m, y + 3);

    // ── FOOTER ──
    doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
    doc.rect(0, H - 12, W, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
    doc.text('Verificable en: ' + SITE_URL + '/certificado/' + v.folio + '  |  alabolcar.com.mx  |  WhatsApp: +52 55 6866 7571', W / 2, H - 5, { align: 'center' });

    // Watermark if not approved
    if (esRechazado) {
      doc.setFontSize(50);
      doc.setTextColor(239, 68, 68);
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.08 }));
      doc.text('RED FLAGS', W / 2, H / 2, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    }

    // ══════════════════════════════════════
    // PAGE 2 — EVIDENCIA FOTOGRÁFICA
    // ══════════════════════════════════════

    if (photoImages && photoImages.length > 0) {
      doc.addPage();

      // Background
      doc.setFillColor(C.bg[0], C.bg[1], C.bg[2]);
      doc.rect(0, 0, W, H, 'F');
      doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
      doc.rect(0, 0, W, 2.5, 'F');

      // Header
      doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
      doc.rect(0, 2.5, W, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(C.gold[0], C.gold[1], C.gold[2]);
      doc.text('EVIDENCIA FOTOGRAFICA', m, 13);

      doc.setFontSize(8);
      doc.setTextColor(C.text[0], C.text[1], C.text[2]);
      doc.text(v.folio + ' — ' + (v.marca || '') + ' ' + (v.modelo || '') + ' ' + (v.anio || ''), m, 18);

      y = 26;

      var photoLabels = {
        niv_tablero: 'NIV en tablero',
        niv_chasis: 'NIV en chasis',
        numero_motor: 'Numero de motor',
        chip_repuve: 'Chip REPUVE',
        tarjeta_circulacion: 'Tarjeta de circulacion',
        factura: 'Factura / carta factura'
      };

      // 3x2 grid
      var pw = (cw - 8) / 3; // photo width
      var ph = pw * 0.7; // photo height

      photoImages.forEach(function (photo, i) {
        var col = i % 3;
        var row = Math.floor(i / 3);
        var px = m + col * (pw + 4);
        var py = y + row * (ph + 14);

        // Photo card background
        doc.setFillColor(C.bgLight[0], C.bgLight[1], C.bgLight[2]);
        doc.roundedRect(px, py, pw, ph + 10, 2, 2, 'F');

        // Photo
        if (photo.data) {
          try {
            doc.addImage(photo.data, 'JPEG', px + 1, py + 1, pw - 2, ph - 2);
          } catch (e) { /* image failed */ }
        }

        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(C.white[0], C.white[1], C.white[2]);
        doc.text(photoLabels[photo.key] || photo.key, px + 2, py + ph + 3);

        // Semaforo dot for this photo
        var semKey = photo.key === 'niv_tablero' ? 'vin_valido' :
                     photo.key === 'niv_chasis' ? 'vin_no_remarcado' :
                     photo.key;
        var pVal = semaforo[semKey];
        if (pVal) {
          var pColor = pVal === 'verde' ? C.green : pVal === 'amarillo' ? C.yellow : C.red;
          doc.setFillColor(pColor[0], pColor[1], pColor[2]);
          doc.circle(px + pw - 4, py + ph + 4, 2, 'F');
        }
      });

      // Footer page 2
      doc.setFillColor(C.gold[0], C.gold[1], C.gold[2]);
      doc.rect(0, H - 12, W, 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(C.bg[0], C.bg[1], C.bg[2]);
      doc.text('Pagina 2/2  |  ' + SITE_URL + '/certificado/' + v.folio, W / 2, H - 5, { align: 'center' });
    }

    return doc;
  }

  // ── DOWNLOAD ──

  function downloadCertificado(folio, btnEl) {
    var btn = btnEl || null;
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF...'; }

    return getSb()
      .from('verificaciones')
      .select('*')
      .eq('folio', folio)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) throw new Error('No encontrado');
        var v = res.data[0];

        // Load photos
        var fotos = v.fotos || {};
        var photoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];
        var photoPromises = photoKeys.map(function (key) {
          if (!fotos[key]) return Promise.resolve({ key: key, data: null });
          var urlRes = getSb().storage.from(BUCKET).getPublicUrl(fotos[key]);
          var url = urlRes.data ? urlRes.data.publicUrl : '';
          if (!url) return Promise.resolve({ key: key, data: null });
          return loadImageBase64(url).then(function (data) { return { key: key, data: data }; });
        });

        return Promise.all([generateQR(SITE_URL + '/certificado/' + folio), Promise.all(photoPromises)])
          .then(function (results) {
            var qr = results[0];
            var photos = results[1].filter(function (p) { return p.data; });
            var doc = generateCertificado(v, qr, photos);
            doc.save('Alabol-Verificacion-' + folio + '.pdf');
            if (btn) { btn.disabled = false; btn.textContent = 'Descargar PDF'; }
          });
      })
      .catch(function (err) {
        alert('Error generando PDF: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Descargar PDF'; }
      });
  }

  function detectCountry(vin) {
    if (!vin || vin.length < 2) return 'Desconocido';
    var first = vin[0].toUpperCase();
    if (first === '3') return 'Mexico';
    var map = { '1': 'USA', '4': 'USA', '5': 'USA', '2': 'Canada', 'J': 'Japon', 'K': 'Corea', 'L': 'China', 'W': 'Alemania', 'Z': 'Italia' };
    return map[first] || 'Otro';
  }

  window.CertificadoPDF = {
    generateCertificado: generateCertificado,
    downloadCertificado: downloadCertificado
  };

})();
