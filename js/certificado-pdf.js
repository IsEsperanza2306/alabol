// =============================================
// CERTIFICADO PDF — ALABOL CAR BROKER
// Reporte de Verificacion Vehicular
// =============================================

(function () {
  'use strict';

  var BUCKET = 'verificaciones';
  var SITE_URL = 'https://alabolcar.com.mx';

  function getSb() { return window.supabaseClient || null; }
  function s(v) { return String(v == null ? 'N/A' : v); }

  var SEM_LABELS = {
    documentos_completos: 'Doc. Completos', vin_valido: 'NIV Consistente',
    vin_no_remarcado: 'Sin Remarcado', placas_vigentes: 'Placas Vigentes',
    sin_reporte_robo: 'Sin Reporte Robo', factura_original: 'Factura / Carta',
    tarjeta_circulacion: 'Tarjeta Circ.', chip_repuve: 'Chip REPUVE',
    numero_motor: 'Num. Motor', condicion_exterior: 'Cond. Exterior',
    pintura_original: 'Pintura Original', estructura_integra: 'Integridad Estruct.'
  };

  var PHOTO_LABELS = {
    niv_tablero: 'NIV en Tablero', niv_chasis: 'NIV en Chasis',
    numero_motor: 'Numero de Motor', chip_repuve: 'Chip REPUVE',
    tarjeta_circulacion: 'Tarjeta Circulacion', factura: 'Factura / Carta'
  };

  // Colors
  var BG = [10, 31, 26];
  var BG2 = [13, 41, 33];
  var GOLD = [212, 175, 55];
  var WHITE = [255, 255, 255];
  var MUTED = [107, 143, 123];
  var TEXT = [168, 197, 184];
  var GREEN = [52, 211, 153];
  var YELLOW = [245, 158, 11];
  var RED = [239, 68, 68];

  function loadImg(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = Math.min(img.width, 800);
          c.height = Math.round(c.width * img.height / img.width);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.6));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  function downloadCertificado(folio, btnEl) {
    var btn = btnEl || null;
    if (btn) { btn.disabled = true; btn.textContent = 'Generando reporte...'; }

    try {
      var client = getSb();
      if (!client) { alert('Error de conexion. Recarga la pagina.'); resetBtn(btn); return; }

      client.from('verificaciones').select('*').eq('folio', folio).limit(1).then(function (res) {
        if (res.error || !res.data || !res.data.length) { alert('Reporte no encontrado'); resetBtn(btn); return; }
        var v = res.data[0];

        // Load photos
        var fotos = v.fotos || {};
        var photoKeys = Object.keys(PHOTO_LABELS);
        var promises = photoKeys.map(function (key) {
          if (!fotos[key]) return Promise.resolve({ key: key, data: null });
          var urlRes = client.storage.from(BUCKET).getPublicUrl(fotos[key]);
          var url = urlRes.data ? urlRes.data.publicUrl : '';
          if (!url) return Promise.resolve({ key: key, data: null });
          return loadImg(url).then(function (d) { return { key: key, data: d }; });
        });

        Promise.all(promises).then(function (photos) {
          try {
            buildPDF(v, photos.filter(function (p) { return p.data; }));
            resetBtn(btn);
          } catch (e) {
            alert('Error al generar PDF: ' + e.message);
            resetBtn(btn);
          }
        });

      }).catch(function (err) {
        alert('Error: ' + (err.message || 'Desconocido'));
        resetBtn(btn);
      });
    } catch (e) {
      alert('Error: ' + e.message);
      resetBtn(btn);
    }
  }

  function resetBtn(btn) {
    if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; }
  }

  function buildPDF(v, photos) {
    var doc = new jspdf.jsPDF('p', 'mm', 'a4');
    var W = 210, H = 297, m = 12, cw = W - m * 2, y;

    // ════════════════════════════
    // PAGINA 1
    // ════════════════════════════

    doc.setFillColor(BG[0], BG[1], BG[2]);
    doc.rect(0, 0, W, H, 'F');

    // Gold top bar
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, 0, W, 2.5, 'F');

    // Header band
    doc.setFillColor(BG2[0], BG2[1], BG2[2]);
    doc.rect(0, 2.5, W, 30, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('ALABOL CAR BROKER', m, 14);

    doc.setFontSize(8);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text('Reporte de Verificacion Vehicular — ' + s(v.folio), m, 20);

    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('alabolcar.com.mx', m, 28);

    // Folio right
    doc.setFontSize(16);
    doc.text(s(v.folio), W - m, 16, { align: 'right' });

    y = 38;

    // ── RESULTADO ──
    var resultado = v.resultado_final || 'pendiente';
    var bc = resultado === 'aprobado' ? GREEN : resultado === 'aprobado_con_observaciones' ? YELLOW : resultado === 'no_aprobado' ? RED : TEXT;
    var bt = resultado === 'aprobado' ? 'GREEN FLAGS — APROBADO' : resultado === 'aprobado_con_observaciones' ? 'YELLOW FLAGS — CON OBSERVACIONES' : resultado === 'no_aprobado' ? 'RED FLAGS — NO APROBADO' : 'EN PROCESO';

    doc.setFillColor(bc[0], bc[1], bc[2]);
    doc.rect(m, y, cw, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BG[0], BG[1], BG[2]);
    doc.text(bt, W / 2, y + 6.5, { align: 'center' });
    y += 14;

    // ── SCORE + RESUMEN ──
    var sem = v.semaforo || {};
    var verdes = 0, amarillos = 0, rojos = 0;
    Object.values(sem).forEach(function (val) { if (val === 'verde') verdes++; else if (val === 'amarillo') amarillos++; else if (val === 'rojo') rojos++; });
    var score = verdes + amarillos * 0.5;

    doc.setFillColor(BG2[0], BG2[1], BG2[2]);
    doc.rect(m, y, 50, 22, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text(String(score), m + 25, y + 14, { align: 'center' });
    doc.setFontSize(7);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text('SCORE / 12', m + 25, y + 20, { align: 'center' });

    // Counts
    var sx = m + 56;
    doc.setFontSize(9);
    doc.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.text(verdes + ' Aprobados', sx, y + 7);
    doc.setTextColor(YELLOW[0], YELLOW[1], YELLOW[2]);
    doc.text(amarillos + ' Observaciones', sx, y + 13);
    doc.setTextColor(RED[0], RED[1], RED[2]);
    doc.text(rojos + ' Alertas', sx, y + 19);

    // Perito note
    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('Revisado por peritos especializados de Alabol', sx + 50, y + 13);

    y += 27;

    // ── DATOS DEL VEHICULO ──
    sectionHeader(doc, m, y, cw, 'IDENTIDAD DEL VEHICULO');
    y += 7;

    doc.setFillColor(BG2[0], BG2[1], BG2[2]);
    doc.rect(m, y, cw, 32, 'F');

    var cx1 = m + 3, cx2 = m + cw / 2 + 3;
    dataRow(doc, 'NIV / VIN', v.vin, cx1, y + 4);
    dataRow(doc, 'MARCA', v.marca, cx2, y + 4);
    dataRow(doc, 'MODELO', v.modelo, cx1, y + 13);
    dataRow(doc, 'ANO', v.anio, cx2, y + 13);
    dataRow(doc, 'COLOR', v.color, cx1, y + 22);
    dataRow(doc, 'PLACAS', v.placas, cx2, y + 22);
    dataRow(doc, 'ESTADO', v.estado_registro, cx1, y + 31);

    // Titular / Solicitante on right
    dataRow(doc, 'SOLICITANTE', v.nombre_solicitante, cx2, y + 31);

    y += 37;

    // ── SEMAFORO ──
    sectionHeader(doc, m, y, cw, 'INSPECCION — 12 PUNTOS DE VERIFICACION');
    y += 7;

    var semKeys = Object.keys(SEM_LABELS);
    var rh = 5.5;

    semKeys.forEach(function (key, i) {
      var col = i % 2;
      var rowIdx = Math.floor(i / 2);
      var rx = m + col * (cw / 2);
      var ry = y + rowIdx * rh;

      doc.setFillColor(rowIdx % 2 === 0 ? BG2[0] : BG[0], rowIdx % 2 === 0 ? BG2[1] : BG[1], rowIdx % 2 === 0 ? BG2[2] : BG[2]);
      doc.rect(rx, ry, cw / 2, rh, 'F');

      var val = sem[key] || 'pendiente';
      var dc = val === 'verde' ? GREEN : val === 'amarillo' ? YELLOW : val === 'rojo' ? RED : MUTED;
      doc.setFillColor(dc[0], dc[1], dc[2]);
      doc.circle(rx + 4, ry + rh / 2, 1.5, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(SEM_LABELS[key], rx + 8, ry + rh / 2 + 1);
    });

    y += Math.ceil(semKeys.length / 2) * rh + 4;

    // ── VERIFICACIONES REALIZADAS ──
    var auto = v.resultados_automaticos || {};
    var checks = auto.checks || {};
    if (Object.keys(checks).length > 0) {
      sectionHeader(doc, m, y, cw, 'VERIFICACIONES REALIZADAS');
      y += 7;

      var checkItems = [
        { label: 'Numero de serie (NIV) verificado', ok: checks.vin_checksum && checks.vin_checksum.valid },
        { label: 'Datos del fabricante consultados', ok: checks.nhtsa && checks.nhtsa.success },
        { label: 'Marca, modelo y ano coinciden', ok: checks.cross_reference && checks.cross_reference.match },
        { label: 'Consulta registro vehiculos robados', ok: checks.repuve && (checks.repuve.status === 'limpio' || checks.repuve.status === 'consulta_ok') },
        { label: 'Revision fotografica por perito', ok: checks.ai_analysis && checks.ai_analysis.success }
      ];

      checkItems.forEach(function (item, i) {
        var cx = m + (i % 2) * (cw / 2) + 3;
        var cy = y + Math.floor(i / 2) * 5;
        var color = item.ok ? GREEN : YELLOW;

        doc.setFillColor(color[0], color[1], color[2]);
        doc.circle(cx, cy + 1.5, 1, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
        doc.text(item.label + (item.ok ? ' — Aprobado' : ' — Pendiente'), cx + 4, cy + 2);
      });

      y += Math.ceil(checkItems.length / 2) * 5 + 4;
    }

    // ── OBSERVACIONES ──
    if (v.notas_verificador) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.text('OBSERVACIONES DEL PERITO', m, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      var lines = doc.splitTextToSize(v.notas_verificador, cw);
      doc.text(lines, m, y);
      y += lines.length * 3 + 4;
    }

    // ── FECHAS ──
    var fE = v.aprobado_at ? new Date(v.aprobado_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pendiente';
    var fV = v.vigencia_certificado ? new Date(v.vigencia_certificado).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
    var tier = v.tier === 'basico' ? 'Escudo' : v.tier === 'verificado' ? 'Escudo Pro' : 'Escudo Total';

    doc.setFontSize(7);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('Emitido: ' + fE + '  |  Vigencia: ' + fV + '  |  Plan: ' + tier, m, y);
    y += 5;

    // ── DISCLAIMER ──
    doc.setFontSize(5.5);
    doc.setTextColor(70, 90, 80);
    var disc = doc.splitTextToSize('Este reporte es un servicio informativo de revision vehicular. Alabol Car Broker no es una autoridad legal ni pericial. Tiene un margen de error inherente y no sustituye una verificacion oficial. No nos hacemos responsables por decisiones basadas en este reporte.', cw);
    doc.text(disc, m, y);

    // Footer
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(0, H - 9, W, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(BG[0], BG[1], BG[2]);
    doc.text(SITE_URL + '/certificado/' + s(v.folio) + '  |  alabolcar.com.mx  |  +52 55 6866 7571', W / 2, H - 3.5, { align: 'center' });

    // ════════════════════════════
    // PAGINA 2 — FOTOS
    // ════════════════════════════

    if (photos.length > 0) {
      doc.addPage();

      doc.setFillColor(BG[0], BG[1], BG[2]);
      doc.rect(0, 0, W, H, 'F');

      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.rect(0, 0, W, 2.5, 'F');

      // Header
      doc.setFillColor(BG2[0], BG2[1], BG2[2]);
      doc.rect(0, 2.5, W, 16, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.text('EVIDENCIA FOTOGRAFICA', m, 12);

      doc.setFontSize(8);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(s(v.folio) + ' — ' + s(v.marca) + ' ' + s(v.modelo) + ' ' + s(v.anio), m, 17);

      y = 24;

      // Photo grid: 2 columns x 3 rows
      var pw = (cw - 6) / 2;
      var ph = 75;

      photos.forEach(function (photo, i) {
        var col = i % 2;
        var row = Math.floor(i / 2);
        var px = m + col * (pw + 6);
        var py = y + row * (ph + 14);

        // Card bg
        doc.setFillColor(BG2[0], BG2[1], BG2[2]);
        doc.rect(px, py, pw, ph + 10, 'F');

        // Photo
        try {
          doc.addImage(photo.data, 'JPEG', px + 1, py + 1, pw - 2, ph - 2);
        } catch (e) { /* skip broken image */ }

        // Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
        doc.text(PHOTO_LABELS[photo.key] || photo.key, px + 3, py + ph + 4);

        // Status
        var semKey = photo.key === 'niv_tablero' ? 'vin_valido' : photo.key === 'niv_chasis' ? 'vin_no_remarcado' : photo.key;
        var pv = sem[semKey] || '';
        if (pv) {
          var pc = pv === 'verde' ? GREEN : pv === 'rojo' ? RED : YELLOW;
          doc.setFillColor(pc[0], pc[1], pc[2]);
          doc.circle(px + pw - 5, py + ph + 5, 2, 'F');
        }
      });

      // Disclaimer fotos
      doc.setFontSize(5.5);
      doc.setTextColor(70, 90, 80);
      doc.text('Las fotografias son evidencia del estado del vehiculo al momento de la verificacion. Alabol no garantiza la autenticidad de las imagenes proporcionadas.', m, H - 16);

      // Footer
      doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
      doc.rect(0, H - 9, W, 9, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(BG[0], BG[1], BG[2]);
      doc.text('Pagina 2/2  |  ' + SITE_URL + '/certificado/' + s(v.folio), W / 2, H - 3.5, { align: 'center' });
    }

    // Open in new tab
    var blob = doc.output('blob');
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function sectionHeader(doc, x, y, w, text) {
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(x, y, w, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(BG[0], BG[1], BG[2]);
    doc.text(text, x + 3, y + 3.5);
  }

  function dataRow(doc, label, value, x, y) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
    doc.text(s(value), x, y + 4);
  }

  window.CertificadoPDF = { downloadCertificado: downloadCertificado };
})();
