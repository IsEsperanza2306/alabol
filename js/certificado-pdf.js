// =============================================
// CERTIFICADO PDF — ALABOL CAR BROKER
// Reporte de Verificacion Vehicular
// =============================================

(function () {
  'use strict';

  var BUCKET = 'verificaciones';
  var SITE_URL = 'https://alabolcar.com.mx';

  function getSb() { return window.supabaseClient || null; }

  var SEMAFORO_LABELS = {
    documentos_completos: 'Documentos completos',
    vin_valido: 'NIV valido',
    vin_no_remarcado: 'Sin remarcado',
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

  function s(v) { return String(v == null ? 'N/A' : v); }

  function downloadCertificado(folio, btnEl) {
    var btn = btnEl || null;
    if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF...'; }

    try {
      var client = getSb();
      if (!client) { alert('Error: No hay conexion. Recarga la pagina.'); if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; } return; }
      if (typeof jspdf === 'undefined') { alert('Error: PDF no disponible. Recarga la pagina.'); if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; } return; }

      client.from('verificaciones').select('*').eq('folio', folio).limit(1).then(function (res) {
        if (res.error || !res.data || !res.data.length) { alert('Reporte no encontrado'); if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; } return; }

        var v = res.data[0];
        var doc = new jspdf.jsPDF('p', 'mm', 'a4');
        var W = 210, H = 297, m = 14, cw = W - m * 2, y = 0;

        // ── PAGE 1 ──

        // Dark background
        doc.setFillColor(10, 31, 26);
        doc.rect(0, 0, W, H, 'F');

        // Gold top line
        doc.setFillColor(212, 175, 55);
        doc.rect(0, 0, W, 3, 'F');

        // Header band
        doc.setFillColor(13, 41, 33);
        doc.rect(0, 3, W, 35, 'F');

        // Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(212, 175, 55);
        doc.text('REPORTE DE VERIFICACION VEHICULAR', m, 17);

        doc.setFontSize(9);
        doc.setTextColor(168, 197, 184);
        doc.text('Alabol Car Broker — El Tinder de los Autos', m, 24);

        // Folio
        doc.setFontSize(18);
        doc.setFont('courier', 'bold');
        doc.setTextColor(212, 175, 55);
        doc.text(s(v.folio), m, 34);

        y = 44;

        // ── RESULTADO ──
        var resultado = v.resultado_final || 'pendiente';
        var bc = resultado === 'aprobado' ? [52, 211, 153] : resultado === 'aprobado_con_observaciones' ? [245, 158, 11] : resultado === 'no_aprobado' ? [239, 68, 68] : [168, 197, 184];
        var bt = resultado === 'aprobado' ? 'GREEN FLAGS — APROBADO' : resultado === 'aprobado_con_observaciones' ? 'YELLOW FLAGS — CON OBSERVACIONES' : resultado === 'no_aprobado' ? 'RED FLAGS — NO APROBADO' : 'EN PROCESO';

        doc.setFillColor(bc[0], bc[1], bc[2]);
        doc.rect(m, y, cw, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(10, 31, 26);
        doc.text(bt, W / 2, y + 7, { align: 'center' });
        y += 16;

        // ── SCORE ──
        var sem = v.semaforo || {};
        var verdes = 0, amarillos = 0, rojos = 0;
        Object.values(sem).forEach(function (val) { if (val === 'verde') verdes++; else if (val === 'amarillo') amarillos++; else if (val === 'rojo') rojos++; });
        var score = verdes + amarillos * 0.5;

        doc.setFillColor(13, 41, 33);
        doc.rect(m, y, cw, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.setTextColor(212, 175, 55);
        doc.text(score + ' / 12', m + 25, y + 13, { align: 'center' });
        doc.setFontSize(8);
        doc.setTextColor(168, 197, 184);
        doc.text('SCORE DE CONFIANZA', m + 25, y + 17, { align: 'center' });

        doc.setFontSize(9);
        doc.setTextColor(52, 211, 153);
        doc.text(verdes + ' Aprobados', m + 65, y + 8);
        doc.setTextColor(245, 158, 11);
        doc.text(amarillos + ' Observaciones', m + 65, y + 13);
        doc.setTextColor(239, 68, 68);
        doc.text(rojos + ' Alertas', m + 65, y + 18);

        y += 24;

        // ── DATOS DEL VEHICULO ──
        doc.setFillColor(212, 175, 55);
        doc.rect(m, y, cw, 5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(10, 31, 26);
        doc.text('IDENTIDAD DEL VEHICULO', m + 3, y + 3.5);
        y += 7;

        doc.setFillColor(13, 41, 33);
        doc.rect(m, y, cw, 34, 'F');

        var cx = m + 3;
        var cx2 = m + cw / 2 + 3;

        function row(label, val, x, yy) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(107, 143, 123);
          doc.text(label, x, yy);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
          doc.text(s(val), x, yy + 4);
        }

        row('NIV / VIN', v.vin, cx, y + 4);
        row('MARCA', v.marca, cx2, y + 4);
        row('MODELO', v.modelo, cx, y + 13);
        row('ANO', v.anio, cx2, y + 13);
        row('COLOR', v.color, cx, y + 22);
        row('PLACAS', v.placas, cx2, y + 22);
        row('ESTADO', v.estado_registro, cx, y + 31);
        row('SOLICITANTE', v.nombre_solicitante, cx2, y + 31);

        y += 38;

        // ── SEMAFORO ──
        doc.setFillColor(212, 175, 55);
        doc.rect(m, y, cw, 5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(10, 31, 26);
        doc.text('INSPECCION — 12 PUNTOS DE VERIFICACION', m + 3, y + 3.5);
        y += 7;

        var semKeys = Object.keys(SEMAFORO_LABELS);
        var rh = 5.5;

        semKeys.forEach(function (key, i) {
          var col = i % 2 === 0 ? 0 : 1;
          var rowIdx = Math.floor(i / 2);
          var rx = m + col * (cw / 2);
          var ry = y + rowIdx * rh;

          if (rowIdx % 2 === 0) {
            doc.setFillColor(13, 41, 33);
          } else {
            doc.setFillColor(10, 31, 26);
          }
          doc.rect(rx, ry, cw / 2, rh, 'F');

          var val = sem[key] || 'pendiente';
          var dotC = val === 'verde' ? [52, 211, 153] : val === 'amarillo' ? [245, 158, 11] : val === 'rojo' ? [239, 68, 68] : [100, 100, 100];
          doc.setFillColor(dotC[0], dotC[1], dotC[2]);
          doc.circle(rx + 4, ry + rh / 2, 1.5, 'F');

          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(168, 197, 184);
          doc.text(SEMAFORO_LABELS[key], rx + 8, ry + rh / 2 + 1);
        });

        y += Math.ceil(semKeys.length / 2) * rh + 4;

        // ── OBSERVACIONES ──
        if (v.notas_verificador) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(212, 175, 55);
          doc.text('OBSERVACIONES DEL PERITO', m, y + 4);
          y += 7;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(168, 197, 184);
          var lines = doc.splitTextToSize(v.notas_verificador, cw);
          doc.text(lines, m, y);
          y += lines.length * 3.5 + 4;
        }

        // ── FECHAS ──
        var fEmision = v.aprobado_at ? new Date(v.aprobado_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pendiente';
        var fVigencia = v.vigencia_certificado ? new Date(v.vigencia_certificado).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
        var tier = v.tier === 'basico' ? 'Escudo' : v.tier === 'verificado' ? 'Escudo Pro' : 'Escudo Total';

        doc.setFontSize(7); doc.setTextColor(107, 143, 123);
        doc.text('Emitido: ' + fEmision + '  |  Vigencia: ' + fVigencia + '  |  Plan: ' + tier, m, y + 3);
        y += 6;

        // ── DISCLAIMER ──
        doc.setFontSize(6); doc.setTextColor(80, 100, 90);
        var disc = 'Este reporte es un servicio informativo. Alabol Car Broker no es una autoridad legal ni pericial. Margen de error inherente. No sustituye una verificacion oficial. alabolcar.com.mx';
        var discLines = doc.splitTextToSize(disc, cw);
        doc.text(discLines, m, y);

        // ── FOOTER ──
        doc.setFillColor(212, 175, 55);
        doc.rect(0, H - 10, W, 10, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(10, 31, 26);
        doc.text('Verificable en: ' + SITE_URL + '/certificado/' + s(v.folio) + '  |  alabolcar.com.mx  |  WhatsApp: +52 55 6866 7571', W / 2, H - 4, { align: 'center' });

        // Save
        doc.save('Alabol-Verificacion-' + v.folio + '.pdf');
        if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; }

      }).catch(function (err) {
        alert('Error: ' + (err.message || 'No se pudo generar'));
        if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; }
      });

    } catch (e) {
      alert('Error: ' + e.message);
      if (btn) { btn.disabled = false; btn.textContent = 'DESCARGAR REPORTE PDF'; }
    }
  }

  window.CertificadoPDF = {
    downloadCertificado: downloadCertificado
  };

})();
