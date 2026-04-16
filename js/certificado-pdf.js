// =============================================
// CERTIFICADO PDF — ALABOL CAR BROKER
// jsPDF + QRCode generation
// =============================================

(function () {
  'use strict';

  var SUPABASE_URL = 'https://rgnunjngtsgqgvplawfr.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbnVuam5ndHNncWd2cGxhd2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODcxMjksImV4cCI6MjA4ODE2MzEyOX0.8gd4XNoBI2mwbV54cORvVGOmJVwdzEidti38AcsqhB8';
  var BUCKET = 'verificaciones';
  var SITE_URL = 'https://alabolcar.com.mx';

  var _sb = null;
  function getSb() {
    if (_sb) return _sb;
    if (window.supabaseClient) { _sb = window.supabaseClient; return _sb; }
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
      window.supabaseClient = _sb;
      return _sb;
    }
    return null;
  }

  var SEMAFORO_LABELS = {
    documentos_completos: 'Documentos completos',
    vin_valido: 'NIV valido y consistente',
    vin_no_remarcado: 'NIV sin indicios de remarcado',
    placas_vigentes: 'Placas vigentes',
    sin_reporte_robo: 'Sin reporte de robo',
    factura_original: 'Factura original o endoso correcto',
    tarjeta_circulacion: 'Tarjeta de circulacion valida',
    chip_repuve: 'Chip REPUVE presente y legible',
    numero_motor: 'Numero de motor legible',
    condicion_exterior: 'Condicion exterior aceptable',
    pintura_original: 'Pintura sin indicios de reparacion',
    estructura_integra: 'Estructura sin soldaduras sospechosas'
  };

  var FOTO_NAMES = {
    niv_tablero: 'NIV Tablero',
    niv_chasis: 'NIV Chasis',
    numero_motor: 'Motor',
    chip_repuve: 'REPUVE',
    tarjeta_circulacion: 'Tarjeta Circ.',
    factura: 'Factura'
  };

  /**
   * Load image as base64 from URL
   */
  function loadImageAsBase64(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  /**
   * Generate QR code as data URL
   */
  function generateQR(text) {
    return new Promise(function (resolve) {
      if (typeof QRCode === 'undefined') {
        resolve(null);
        return;
      }
      var container = document.createElement('div');
      container.style.display = 'none';
      document.body.appendChild(container);

      var qr = new QRCode(container, {
        text: text,
        width: 200,
        height: 200,
        colorDark: '#0a1f1a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });

      setTimeout(function () {
        var canvas = container.querySelector('canvas');
        var dataUrl = canvas ? canvas.toDataURL('image/png') : null;
        document.body.removeChild(container);
        resolve(dataUrl);
      }, 100);
    });
  }

  /**
   * Generate PDF certificate
   * @param {object} verificacion - Full verificacion row from Supabase
   */
  function generateCertificado(verificacion) {
    var doc = new jspdf.jsPDF('p', 'mm', 'a4');
    var pageW = 210;
    var margin = 15;
    var contentW = pageW - margin * 2;
    var y = margin;

    var resultado = verificacion.resultado_final || 'pendiente';
    var isApproved = resultado === 'aprobado' || resultado === 'aprobado_con_observaciones';

    // ── HEADER ──
    doc.setFillColor(10, 31, 26);
    doc.rect(0, 0, pageW, 45, 'F');

    // Gold line
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.8);
    doc.line(margin, 42, pageW - margin, 42);

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(212, 175, 55);
    doc.text('CERTIFICADO DE CONFIANZA VEHICULAR', pageW / 2, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(168, 197, 184);
    doc.text('Alabol Car Broker — El Tinder de los Autos — alabolcar.com.mx', pageW / 2, 26, { align: 'center' });

    // Folio
    doc.setFontSize(12);
    doc.setTextColor(212, 175, 55);
    doc.text('Folio: ' + (verificacion.folio || ''), pageW / 2, 36, { align: 'center' });

    y = 52;

    // ── WATERMARK (if not approved) ──
    if (!isApproved) {
      doc.setFontSize(60);
      doc.setTextColor(239, 68, 68, 30);
      doc.text('NO APROBADO', pageW / 2, 160, { align: 'center', angle: 45 });
    }

    // ── RESULTADO ──
    var resultColor = resultado === 'aprobado' ? [16, 185, 129] :
                      resultado === 'aprobado_con_observaciones' ? [245, 158, 11] :
                      [239, 68, 68];
    var resultLabel = resultado === 'aprobado' ? 'APROBADO' :
                      resultado === 'aprobado_con_observaciones' ? 'APROBADO CON OBSERVACIONES' :
                      'NO APROBADO';

    doc.setFillColor(resultColor[0], resultColor[1], resultColor[2]);
    doc.roundedRect(margin, y, contentW, 12, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('DICTAMEN: ' + resultLabel, pageW / 2, y + 8, { align: 'center' });
    y += 18;

    // ── DATOS DEL VEHICULO ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(212, 175, 55);
    doc.text('DATOS DEL VEHICULO', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);

    var vehicleData = [
      ['NIV:', verificacion.vin || 'N/A'],
      ['Marca:', verificacion.marca || 'N/A'],
      ['Modelo:', verificacion.modelo || 'N/A'],
      ['Ano:', String(verificacion.anio || 'N/A')],
      ['Color:', verificacion.color || 'N/A'],
      ['Placas:', verificacion.placas || 'N/A'],
      ['Estado:', verificacion.estado_registro || 'N/A'],
      ['Propietario:', verificacion.nombre_solicitante || 'N/A']
    ];

    var col1X = margin;
    var col2X = margin + contentW / 2;

    for (var i = 0; i < vehicleData.length; i++) {
      var x = i % 2 === 0 ? col1X : col2X;
      if (i % 2 === 0 && i > 0) y += 5;
      doc.setFont('helvetica', 'bold');
      doc.text(vehicleData[i][0], x, y);
      doc.setFont('helvetica', 'normal');
      doc.text(' ' + vehicleData[i][1], x + 22, y);
    }
    y += 10;

    // ── SEMÁFORO ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(212, 175, 55);
    doc.text('SEMAFORO DE VERIFICACION', margin, y);
    y += 6;

    var semaforo = verificacion.semaforo || {};
    var semaforoKeys = Object.keys(SEMAFORO_LABELS);
    var rowH = 6;

    // Table header
    doc.setFillColor(10, 31, 26);
    doc.rect(margin, y, contentW, rowH, 'F');
    doc.setFontSize(8);
    doc.setTextColor(212, 175, 55);
    doc.text('Punto de Verificacion', margin + 2, y + 4);
    doc.text('Estado', pageW - margin - 15, y + 4);
    y += rowH;

    semaforoKeys.forEach(function (key, idx) {
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y, contentW, rowH, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
      doc.text(SEMAFORO_LABELS[key], margin + 2, y + 4);

      var valor = semaforo[key] || 'pendiente';
      var dotColor = valor === 'verde' ? [16, 185, 129] :
                     valor === 'amarillo' ? [245, 158, 11] :
                     valor === 'rojo' ? [239, 68, 68] : [180, 180, 180];

      doc.setFillColor(dotColor[0], dotColor[1], dotColor[2]);
      doc.circle(pageW - margin - 10, y + 3, 2, 'F');

      var valorLabel = valor === 'verde' ? 'OK' : valor === 'amarillo' ? 'OBS' : valor === 'rojo' ? 'ALERTA' : '-';
      doc.setFontSize(7);
      doc.text(valorLabel, pageW - margin - 6, y + 4);

      y += rowH;
    });

    y += 6;

    // ── FECHAS ──
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);

    var fechaEmision = verificacion.aprobado_at ? new Date(verificacion.aprobado_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Pendiente';
    var fechaVigencia = verificacion.vigencia_certificado ? new Date(verificacion.vigencia_certificado).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';

    doc.text('Fecha de emision: ' + fechaEmision, margin, y);
    y += 4;
    doc.text('Vigencia: ' + fechaVigencia, margin, y);
    y += 4;
    doc.text('Tier: ' + (verificacion.tier || '').toUpperCase(), margin, y);
    y += 8;

    // ── NOTAS ──
    if (verificacion.notas_verificador) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(212, 175, 55);
      doc.text('OBSERVACIONES:', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      var lines = doc.splitTextToSize(verificacion.notas_verificador, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 4 + 6;
    }

    // ── FOOTER ──
    var footerY = 280;
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 4, pageW - margin, footerY - 4);

    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('Certificado emitido por Alabol Car Broker — verificable en ' + SITE_URL + '/certificado/' + verificacion.folio, pageW / 2, footerY, { align: 'center' });
    doc.text('Vigencia: 30 dias. Soporte: contacto@alabolcar.com.mx | WhatsApp: +52 55 6866 7571', pageW / 2, footerY + 4, { align: 'center' });

    return doc;
  }

  /**
   * Generate and download the certificate PDF
   */
  function downloadCertificado(folio) {
    return getSb()
      .from('verificaciones')
      .select('*')
      .eq('folio', folio)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) {
          throw new Error('Verificacion no encontrada');
        }

        var verificacion = res.data[0];

        // Generate QR
        return generateQR(SITE_URL + '/certificado/' + folio).then(function (qrDataUrl) {
          var doc = generateCertificado(verificacion);

          // Add QR to top right
          if (qrDataUrl) {
            doc.addImage(qrDataUrl, 'PNG', 165, 48, 30, 30);
          }

          doc.save('Certificado-' + folio + '.pdf');
          return doc;
        });
      });
  }

  /**
   * Generate PDF blob and upload to Supabase Storage
   */
  function uploadCertificado(folio) {
    return getSb()
      .from('verificaciones')
      .select('*')
      .eq('folio', folio)
      .limit(1)
      .then(function (res) {
        if (res.error || !res.data || !res.data.length) throw new Error('No encontrado');
        var verificacion = res.data[0];

        return generateQR(SITE_URL + '/certificado/' + folio).then(function (qrDataUrl) {
          var doc = generateCertificado(verificacion);
          if (qrDataUrl) doc.addImage(qrDataUrl, 'PNG', 165, 48, 30, 30);

          var blob = doc.output('blob');
          var path = folio + '/certificado.pdf';

          return getSb().storage
            .from(BUCKET)
            .upload(path, blob, { contentType: 'application/pdf', upsert: true })
            .then(function (uploadRes) {
              if (uploadRes.error) throw uploadRes.error;

              var urlRes = getSb().storage.from(BUCKET).getPublicUrl(path);
              var publicUrl = urlRes.data ? urlRes.data.publicUrl : '';

              // Update verificacion with PDF URL
              return getSb()
                .from('verificaciones')
                .update({ certificado_url: publicUrl })
                .eq('folio', folio)
                .then(function () { return publicUrl; });
            });
        });
      });
  }

  // Expose
  window.CertificadoPDF = {
    generateCertificado: generateCertificado,
    downloadCertificado: downloadCertificado,
    uploadCertificado: uploadCertificado
  };

})();
