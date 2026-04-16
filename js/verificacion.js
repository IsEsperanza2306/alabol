// =============================================
// VERIFICACIÓN VEHICULAR — LÓGICA DEL WIZARD
// Alabol Car Broker
// =============================================

(function () {
  'use strict';

  var STORAGE_KEY = 'alabol_verificacion_draft';
  var BUCKET = 'verificaciones';
  var PHOTO_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  var _submitting = false;

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Supabase client — uses config.js initialization
  var _sb = null;
  function getSb() {
    if (_sb) return _sb;
    if (window.supabaseClient) { _sb = window.supabaseClient; return _sb;
    }
    return null;
  }

  // Fotos requeridas con instrucciones
  var REQUIRED_PHOTOS = [
    {
      key: 'niv_tablero',
      name: 'NIV en tablero',
      instruction: 'Fotografia macro del NIV grabado bajo el parabrisas, lado conductor. Iluminacion lateral, sin flash directo. El numero debe ser completamente legible.',
      icon: 'fa-barcode'
    },
    {
      key: 'niv_chasis',
      name: 'NIV en chasis',
      instruction: 'Fotografia del NIV estampado en el chasis, rueda delantera izquierda. Incluir area circundante del metal para verificar ausencia de soldaduras o cortes.',
      icon: 'fa-car'
    },
    {
      key: 'numero_motor',
      name: 'Numero de motor',
      instruction: 'Fotografia del numero grabado en el bloque del motor. Limpiar area antes de fotografiar.',
      icon: 'fa-gears'
    },
    {
      key: 'chip_repuve',
      name: 'Chip REPUVE',
      instruction: 'Fotografia del chip/calcomania REPUVE en parabrisas. El folio debe ser legible. Incluir holograma completo.',
      icon: 'fa-microchip'
    },
    {
      key: 'tarjeta_circulacion',
      name: 'Tarjeta de circulacion',
      instruction: 'Ambas caras de la tarjeta de circulacion, en superficie plana, sin reflejos.',
      icon: 'fa-id-card'
    },
    {
      key: 'factura',
      name: 'Factura o carta factura',
      instruction: 'Documento completo legible. Si es carta factura, incluir ambas caras.',
      icon: 'fa-file-invoice'
    }
  ];

  var ESTADOS_MEXICO = [
    'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas',
    'Chihuahua','Ciudad de Mexico','Coahuila','Colima','Durango','Estado de Mexico',
    'Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacan','Morelos','Nayarit',
    'Nuevo Leon','Oaxaca','Puebla','Queretaro','Quintana Roo','San Luis Potosi',
    'Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatan','Zacatecas'
  ];

  var TIERS = {
    basico: { nombre: 'Escudo', precio: 299, features: ['Verificacion del numero de serie (NIV)', 'Consulta en registros oficiales de robo', 'Revision fotografica por perito especializado', 'Dictamen con resultado y certificado'] },
    verificado: { nombre: 'Escudo Pro', precio: 499, features: ['Todo lo del Escudo', 'Consulta de historial con aseguradoras', 'Revision de siniestros previos', 'Reporte de gravamenes y adeudos'] },
    plus: { nombre: 'Escudo Total', precio: 799, features: ['Todo lo del Escudo Pro', 'Historial completo del vehiculo (incluye importados)', 'Revision documental profunda por perito', 'Vigencia extendida (60 dias)', 'Prioridad en verificacion (12 hrs)'] }
  };

  // State
  var state = {
    paso: 1,
    folio: null,
    vin: '',
    marca: '',
    modelo: '',
    anio: '',
    color: '',
    placas: '',
    estado_registro: '',
    nombre_titular: '',
    nombre: '',
    email: '',
    telefono: '',
    es_listing: false,
    tier: 'basico',
    vinValidation: null,
    nhtsaData: null,
    repuveData: null,
    photos: {}, // { key: { blob: null, preview: '', uploaded: false, storagePath: '' } }
    supabaseId: null
  };

  var debounceTimer = null;

  // ── HELPERS ──

  function g(id) { return document.getElementById(id); }

  function saveDraft() {
    var toSave = Object.assign({}, state);
    // Don't save blobs to localStorage
    var photosClean = {};
    Object.keys(state.photos).forEach(function (k) {
      photosClean[k] = {
        preview: state.photos[k].preview || '',
        uploaded: state.photos[k].uploaded || false,
        storagePath: state.photos[k].storagePath || ''
      };
    });
    toSave.photos = photosClean;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) { /* localStorage full or unavailable */ }
  }

  function loadDraft() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(function (k) {
          if (k in state) state[k] = parsed[k];
        });
        return true;
      }
    } catch (e) { /* corrupt data */ }
    return false;
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function compressImage(file, cb, onError) {
    var reader = new FileReader();
    reader.onerror = function () {
      if (onError) onError('No se pudo leer el archivo');
    };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () {
        if (onError) onError('No se pudo procesar la imagen. Intenta con otro formato.');
      };
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var maxDim = 1600;
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          cb(blob, canvas.toDataURL('image/jpeg', 0.8));
        }, 'image/jpeg', 0.8);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── WIZARD NAVIGATION ──

  function showStep(n) {
    state.paso = n;
    for (var i = 1; i <= 3; i++) {
      var el = g('step-' + i);
      if (el) el.classList.toggle('active', i === n);
    }
    // Update progress dots
    for (var j = 1; j <= 3; j++) {
      var dot = g('dot-' + j);
      if (dot) {
        dot.classList.toggle('active', j === n);
        dot.classList.toggle('done', j < n);
      }
      var line = g('line-' + j);
      if (line) line.classList.toggle('done', j < n);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveDraft();
  }

  function nextStep() {
    if (state.paso === 1 && !validateStep1()) return;
    if (state.paso === 2 && !validateStep2()) return;
    if (state.paso < 3) showStep(state.paso + 1);
  }

  function prevStep() {
    if (state.paso > 1) showStep(state.paso - 1);
  }

  // ── SMART SCAN ──

  function scanDocument(input) {
    var file = input.files && input.files[0];
    if (!file) return;

    var statusEl = g('scan-status');
    var resultEl = g('scan-result');
    var uploadEl = g('scan-dropzone');
    if (statusEl) statusEl.style.display = 'block';
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
    if (uploadEl) uploadEl.style.display = 'none';

    // Show preview
    var reader = new FileReader();
    reader.onload = function (e) {
      var previewImg = g('scan-preview-img');
      if (previewImg) previewImg.src = e.target.result;

      // Compress for API
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var maxDim = 1200;
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var base64 = canvas.toDataURL('image/jpeg', 0.85);

        // Call OCR function
        fetch('/.netlify/functions/ocr-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer client' },
          body: JSON.stringify({ image: base64, type: 'tarjeta_circulacion' })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          var progressEl = g('scan-progress');
          if (!data.success) {
            if (progressEl) progressEl.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i> ' + (data.error || 'No se pudo leer');
            if (resultEl) {
              resultEl.style.display = 'block';
              resultEl.innerHTML = '<div class="scan-fail"><i class="fas fa-info-circle"></i> No pudimos leer la tarjeta automaticamente. Llena los datos manualmente.</div>';
            }
            if (uploadEl) uploadEl.style.display = 'flex';
            return;
          }

          var d = data.data;
          if (progressEl) progressEl.innerHTML = '<i class="fas fa-check-circle" style="color:var(--emerald)"></i> Documento leido con exito';

          // Pre-fill fields
          if (d.vin) { g('inp-vin').value = d.vin; onVinInput(); }
          if (d.marca) g('inp-marca').value = d.marca;
          if (d.modelo) g('inp-modelo').value = d.modelo;
          if (d.anio) g('inp-anio').value = d.anio;
          if (d.color) g('inp-color').value = d.color;
          if (d.placas) g('inp-placas').value = d.placas;
          if (d.nombre_titular) g('inp-titular').value = d.nombre_titular;
          if (d.estado) {
            // Try to match estado in dropdown
            var sel = g('inp-estado');
            for (var i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value.toLowerCase().indexOf(d.estado.toLowerCase()) !== -1) {
                sel.selectedIndex = i; break;
              }
            }
          }

          // Show what was extracted
          var fieldsHtml = '';
          if (d.vin) fieldsHtml += '<div><strong>NIV:</strong> ' + d.vin + '</div>';
          if (d.marca) fieldsHtml += '<div><strong>Marca:</strong> ' + d.marca + '</div>';
          if (d.modelo) fieldsHtml += '<div><strong>Modelo:</strong> ' + d.modelo + '</div>';
          if (d.anio) fieldsHtml += '<div><strong>Ano:</strong> ' + d.anio + '</div>';
          if (d.color) fieldsHtml += '<div><strong>Color:</strong> ' + d.color + '</div>';
          if (d.placas) fieldsHtml += '<div><strong>Placas:</strong> ' + d.placas + '</div>';
          if (d.nombre_titular) fieldsHtml += '<div><strong>Titular:</strong> ' + d.nombre_titular + '</div>';
          if (d.estado) fieldsHtml += '<div><strong>Estado:</strong> ' + d.estado + '</div>';

          if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.innerHTML =
              '<div class="scan-success">' +
              '<div class="scan-title"><i class="fas fa-check-circle"></i> Datos extraidos — verifica que esten correctos</div>' +
              '<div class="scan-fields">' + fieldsHtml + '</div>' +
              (d.confianza ? '<div style="margin-top:8px;font-size:10px;color:var(--green-muted)">Confianza: ' + d.confianza + '</div>' : '') +
              '</div>';
          }

          saveDraft();
        })
        .catch(function (err) {
          var progressEl = g('scan-progress');
          if (progressEl) progressEl.innerHTML = '<i class="fas fa-times-circle" style="color:var(--danger)"></i> Error: ' + err.message;
          if (uploadEl) uploadEl.style.display = 'flex';
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ── STEP 1: DATOS DEL VEHICULO ──

  function validateStep1() {
    if (!window.VinValidator) {
      showAlert('error', 'Error', 'El validador de NIV no cargo correctamente. Recarga la pagina.');
      return false;
    }
    var vin = (g('inp-vin').value || '').trim().toUpperCase();
    state.vin = vin;
    state.marca = (g('inp-marca').value || '').trim();
    state.modelo = (g('inp-modelo').value || '').trim();
    state.anio = parseInt(g('inp-anio').value, 10) || '';
    state.color = (g('inp-color').value || '').trim();
    state.placas = (g('inp-placas').value || '').trim().toUpperCase();
    state.estado_registro = g('inp-estado').value || '';
    state.nombre_titular = (g('inp-titular').value || '').trim();
    state.nombre = (g('inp-nombre').value || '').trim();
    state.email = (g('inp-email').value || '').trim();
    state.telefono = (g('inp-telefono').value || '').trim();
    state.es_listing = g('chk-listing') ? g('chk-listing').checked : false;

    // Validaciones
    if (!vin) { showAlert('error', 'NIV requerido', 'Ingresa el Numero de Identificacion Vehicular'); return false; }
    var vinResult = window.VinValidator.validateFormat(vin);
    if (!vinResult.valid) { showAlert('error', 'NIV invalido', vinResult.error); return false; }
    if (!state.marca) { showAlert('error', 'Marca requerida', 'Ingresa la marca del vehiculo'); return false; }
    if (!state.modelo) { showAlert('error', 'Modelo requerido', 'Ingresa el modelo del vehiculo'); return false; }
    if (!state.anio || state.anio < 1990 || state.anio > new Date().getFullYear() + 1) {
      showAlert('error', 'Ano invalido', 'Ingresa un ano entre 1990 y ' + (new Date().getFullYear() + 1)); return false;
    }
    if (!state.placas) { showAlert('error', 'Placas requeridas', 'Ingresa las placas actuales del vehiculo'); return false; }
    if (!state.estado_registro) { showAlert('error', 'Estado requerido', 'Selecciona el estado donde esta emplacado'); return false; }
    if (!state.nombre) { showAlert('error', 'Nombre requerido', 'Ingresa el nombre del propietario'); return false; }
    if (!state.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) {
      showAlert('error', 'Email invalido', 'Ingresa un correo electronico valido'); return false;
    }
    if (!state.telefono || state.telefono.length < 10) {
      showAlert('error', 'Telefono invalido', 'Ingresa un numero de WhatsApp de al menos 10 digitos'); return false;
    }

    // Check VIN checksum warning (no bloquea, pero alerta)
    var checksumResult = window.VinValidator.validateChecksum(vin);
    state.vinValidation = checksumResult;
    if (!checksumResult.valid) {
      showAlert('warning', 'Alerta de checksum', checksumResult.error + '. Puedes continuar, pero esto sera revisado.');
    }

    // Check NHTSA discrepancies
    if (state.nhtsaData && state.nhtsaData.success) {
      var comparison = window.VinValidator.compareWithNhtsa(
        { marca: state.marca, modelo: state.modelo, anio: state.anio },
        state.nhtsaData.data
      );
      if (!comparison.match) {
        showAlert('warning', 'Discrepancia detectada', comparison.discrepancies.join('. '));
      }
    }

    return true;
  }

  function onVinInput() {
    var vin = (g('inp-vin').value || '').trim().toUpperCase();
    var indicator = g('vin-status');

    if (vin.length < 17) {
      if (indicator) indicator.innerHTML = vin.length > 0
        ? '<span class="vin-partial"><i class="fas fa-keyboard"></i> ' + vin.length + '/17 caracteres</span>'
        : '';
      return;
    }

    // Validate format
    var formatResult = window.VinValidator.validateFormat(vin);
    if (!formatResult.valid) {
      if (indicator) indicator.innerHTML = '<span class="vin-error"><i class="fas fa-times-circle"></i> ' + formatResult.error + '</span>';
      return;
    }

    // Checksum
    var checksumResult = window.VinValidator.validateChecksum(vin);
    state.vinValidation = checksumResult;

    if (checksumResult.valid) {
      if (indicator) indicator.innerHTML = '<span class="vin-ok"><i class="fas fa-check-circle"></i> NIV valido — checksum correcto</span>';
    } else {
      if (indicator) indicator.innerHTML = '<span class="vin-warn"><i class="fas fa-exclamation-triangle"></i> ' + checksumResult.error + '</span>';
    }

    // Country detection
    var country = window.VinValidator.detectCountry(vin);
    var countryEl = g('vin-country');
    if (countryEl) countryEl.textContent = 'Origen: ' + country;

    // NHTSA decode (debounced)
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { decodeVin(vin); }, 500);
  }

  function decodeVin(vin) {
    var nhtsaEl = g('nhtsa-result');
    if (nhtsaEl) nhtsaEl.innerHTML = '<span class="nhtsa-loading"><i class="fas fa-spinner fa-spin"></i> Consultando base de datos NHTSA...</span>';

    window.VinValidator.decodeNhtsa(vin).then(function (result) {
      state.nhtsaData = result;
      saveDraft();

      if (!result.success) {
        if (nhtsaEl) nhtsaEl.innerHTML = '<span class="nhtsa-error"><i class="fas fa-info-circle"></i> ' + result.error + '</span>';
        return;
      }

      var d = result.data;
      // Auto-fill fields
      if (d.make && !g('inp-marca').value) g('inp-marca').value = d.make;
      if (d.model && !g('inp-modelo').value) g('inp-modelo').value = d.model;
      if (d.year && !g('inp-anio').value) g('inp-anio').value = d.year;

      if (nhtsaEl) {
        nhtsaEl.innerHTML =
          '<div class="nhtsa-decoded">' +
          '<div class="nhtsa-title"><i class="fas fa-database"></i> Datos decodificados del NIV</div>' +
          '<div class="nhtsa-grid">' +
          '<div><strong>Marca:</strong> ' + (d.make || 'N/A') + '</div>' +
          '<div><strong>Modelo:</strong> ' + (d.model || 'N/A') + '</div>' +
          '<div><strong>Ano:</strong> ' + (d.year || 'N/A') + '</div>' +
          '<div><strong>Tipo:</strong> ' + (d.bodyClass || 'N/A') + '</div>' +
          '<div><strong>Motor:</strong> ' + (d.engineDisplacement ? d.engineDisplacement + 'L' : 'N/A') + ' ' + (d.engineCylinders ? d.engineCylinders + ' cil.' : '') + '</div>' +
          '<div><strong>Combustible:</strong> ' + (d.fuelType || 'N/A') + '</div>' +
          '<div><strong>Transmision:</strong> ' + (d.transmissionStyle || 'N/A') + '</div>' +
          '<div><strong>Fabricante:</strong> ' + (d.manufacturer || 'N/A') + '</div>' +
          '</div></div>';
      }
    });

    // REPUVE status
    window.VinValidator.checkRepuve(vin).then(function (result) {
      state.repuveData = result;
      var repuveEl = g('repuve-result');
      if (repuveEl) {
        repuveEl.innerHTML =
          '<div class="repuve-status">' +
          '<i class="fas fa-shield-halved"></i> REPUVE: ' + result.message +
          ' <a href="' + result.url + '" target="_blank" rel="noopener">Consultar aqui <i class="fas fa-external-link-alt"></i></a>' +
          '</div>';
      }
    });
  }

  // ── STEP 2: FOTOS ──

  function validateStep2() {
    var uploaded = 0;
    var missing = [];
    REQUIRED_PHOTOS.forEach(function (photo) {
      if (state.photos[photo.key] && state.photos[photo.key].preview) {
        uploaded++;
      } else {
        missing.push(photo.name);
      }
    });

    // Permitir avanzar sin todas, pero avisar
    if (uploaded === 0) {
      showAlert('error', 'Al menos una foto', 'Sube al menos una foto para continuar. Las demas las puedes agregar despues.');
      return false;
    }

    if (missing.length > 0) {
      showAlert('warning', 'Fotos pendientes', 'Faltan ' + missing.length + ' fotos. Podras subirlas mas adelante. El verificador las revisara cuando esten completas.');
    }
    return true;
  }

  function handlePhotoSelect(key, input) {
    var file = input.files && input.files[0];
    if (!file) return;

    if (file.size > PHOTO_MAX_SIZE) {
      showAlert('error', 'Archivo muy grande', 'El archivo excede 10MB. Intenta con una foto de menor resolucion.');
      input.value = '';
      return;
    }

    if (!file.type.match(/^image\/(jpeg|png|heic|heif)$/)) {
      showAlert('error', 'Formato no valido', 'Solo se aceptan archivos JPG, PNG o HEIC.');
      input.value = '';
      return;
    }

    var slot = g('photo-slot-' + key);
    if (slot) slot.classList.add('uploading');

    compressImage(file, function (blob, preview) {
      state.photos[key] = {
        blob: blob,
        preview: preview,
        uploaded: false,
        storagePath: ''
      };

      // Update UI
      var imgEl = g('photo-preview-' + key);
      var statusEl = g('photo-status-' + key);
      if (imgEl) { imgEl.src = preview; imgEl.style.display = 'block'; }
      if (statusEl) statusEl.innerHTML = '<span class="photo-ready"><i class="fas fa-check"></i> Lista</span>';
      if (slot) { slot.classList.remove('uploading'); slot.classList.add('has-photo'); }
      updatePhotoCounter();
      saveDraft();
    }, function (errorMsg) {
      if (slot) slot.classList.remove('uploading');
      showAlert('error', 'Error de imagen', errorMsg);
      input.value = '';
    });
  }

  function removePhoto(key) {
    delete state.photos[key];
    var imgEl = g('photo-preview-' + key);
    var statusEl = g('photo-status-' + key);
    var slot = g('photo-slot-' + key);
    var input = g('photo-input-' + key);
    if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
    if (statusEl) statusEl.innerHTML = '<span class="photo-pending"><i class="fas fa-camera"></i> Pendiente</span>';
    if (slot) slot.classList.remove('has-photo');
    if (input) input.value = '';
    updatePhotoCounter();
    saveDraft();
  }

  function updatePhotoCounter() {
    var count = 0;
    REQUIRED_PHOTOS.forEach(function (p) {
      if (state.photos[p.key] && state.photos[p.key].preview) count++;
    });
    var counter = g('photo-counter');
    if (counter) counter.textContent = count + ' / ' + REQUIRED_PHOTOS.length + ' fotos';
    var bar = g('photo-progress-bar');
    if (bar) bar.style.width = Math.round((count / REQUIRED_PHOTOS.length) * 100) + '%';
  }

  // ── STEP 3: TIER + PAGO ──

  function selectTier(tier) {
    state.tier = tier;
    document.querySelectorAll('.tier-card').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.tier === tier);
    });
    var totalEl = g('pago-total');
    if (totalEl) totalEl.textContent = '$' + TIERS[tier].precio + ' MXN';
    saveDraft();
  }

  // ── UPLOAD FOTOS A SUPABASE STORAGE ──

  function uploadAllPhotos(folio) {
    var promises = [];

    REQUIRED_PHOTOS.forEach(function (photo) {
      var photoData = state.photos[photo.key];
      if (!photoData || !photoData.blob || photoData.uploaded) {
        // Already uploaded or no blob (loaded from draft)
        return;
      }

      var path = folio + '/' + photo.key + '.jpg';
      var promise = getSb().storage
        .from(BUCKET)
        .upload(path, photoData.blob, {
          contentType: 'image/jpeg',
          upsert: true
        })
        .then(function (res) {
          if (res.error) throw res.error;
          state.photos[photo.key].uploaded = true;
          state.photos[photo.key].storagePath = path;
          return path;
        });

      promises.push(promise);
    });

    return Promise.all(promises);
  }

  // ── SUBMIT ──

  // Convierte base64 data URL a Blob
  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var raw = atob(parts[1]);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Reconstruye blobs de fotos desde previews base64 (para drafts restaurados)
  function rebuildPhotoBlobs() {
    var rebuilt = 0;
    REQUIRED_PHOTOS.forEach(function (p) {
      var photo = state.photos[p.key];
      if (photo && photo.preview && !photo.blob) {
        try {
          photo.blob = dataUrlToBlob(photo.preview);
          rebuilt++;
        } catch (e) { /* preview corrupta, se pedira resubir */ }
      }
    });
    return rebuilt;
  }

  function submitVerificacion() {
    if (_submitting) return;
    _submitting = true;
    try {
    // Guard: Supabase
    if (!getSb()) {
      showAlert('error', 'Error de conexion', 'No se pudo conectar con el servidor. Recarga la pagina.');
      _submitting = false;
      return;
    }

    // Reconstruir blobs de fotos si vienen de un draft restaurado
    rebuildPhotoBlobs();

    var submitBtn = g('btn-submit');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...'; }

    // 1. Create row in Supabase to get folio
    var insertData = {
      vin: state.vin,
      marca: state.marca,
      modelo: state.modelo,
      anio: state.anio || null,
      color: state.color,
      placas: state.placas,
      estado_registro: state.estado_registro,
      nombre_solicitante: state.nombre,
      nombre_titular: state.nombre_titular || null,
      email_solicitante: state.email,
      telefono_solicitante: state.telefono,
      tier: state.tier,
      pago_monto: TIERS[state.tier].precio,
      es_listing: state.es_listing,
      vin_checksum_valido: state.vinValidation ? state.vinValidation.valid : null,
      nhtsa_data: state.nhtsaData && state.nhtsaData.data ? state.nhtsaData.data : {},
      repuve_status: state.repuveData ? state.repuveData.status : 'pendiente',
      estatus: 'pendiente_pago',
      paso_actual: 3
    };

    getSb()
      .from('verificaciones')
      .insert(insertData)
      .select('id, folio')
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data || !res.data[0] || !res.data[0].folio) throw new Error('No se genero el folio. Intenta de nuevo.');
        var row = res.data[0];
        state.supabaseId = row.id;
        state.folio = row.folio;

        // 2. Upload photos
        return uploadAllPhotos(row.folio).then(function (paths) {
          // 3. Update row with photo paths
          var fotosJson = {};
          REQUIRED_PHOTOS.forEach(function (p) {
            if (state.photos[p.key]) {
              fotosJson[p.key] = state.photos[p.key].storagePath || (row.folio + '/' + p.key + '.jpg');
            }
          });

          return getSb()
            .from('verificaciones')
            .update({ fotos: fotosJson })
            .eq('id', row.id);
        });
      })
      .then(function (res) {
        if (res && res.error) throw res.error;
        clearDraft();
        showConfirmation();
      })
      .catch(function (err) {
        _submitting = false;
        var errorMsg = (err && err.message) ? err.message : 'Ocurrio un error. Intenta de nuevo.';
        showAlert('error', 'Error al enviar', errorMsg);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-lock"></i> Confirmar y Pagar'; }
      });
    } catch (syncErr) {
      _submitting = false;
      showAlert('error', 'Error inesperado', syncErr.message || 'Error desconocido');
    }
  }

  function showConfirmation() {
    var container = g('wizard-container');
    if (!container) return;

    container.innerHTML =
      '<div class="confirmation-screen">' +
      '<div class="confirm-icon"><i class="fas fa-heart"></i></div>' +
      '<h2>Tu background check esta en camino</h2>' +
      '<p class="confirm-folio">Folio: <strong>' + esc(state.folio) + '</strong></p>' +
      '<p class="confirm-text">Recibimos toda la info de tu soltero sobre ruedas. ' +
      'Te enviaremos el enlace de pago por WhatsApp al <strong>' + esc(state.telefono) + '</strong> ' +
      'y por correo a <strong>' + esc(state.email) + '</strong>. Una vez pagado, nuestro verificador hace su magia.</p>' +
      '<div class="confirm-tier">' +
      '<span class="tier-badge tier-' + state.tier + '">' + TIERS[state.tier].nombre + '</span>' +
      '<span class="tier-price">$' + TIERS[state.tier].precio + ' MXN</span>' +
      '</div>' +
      '<div class="confirm-next">' +
      '<h3><i class="fas fa-route"></i> Asi sigue la historia</h3>' +
      '<ol>' +
      '<li>Paga con el enlace que te llegara por WhatsApp</li>' +
      '<li>Nuestro verificador revisa tu expediente en 24-48 hrs</li>' +
      '<li>Recibiras tu certificado con green flags (o red flags) por correo y WhatsApp</li>' +
      (state.es_listing ? '<li>Si todo sale bien, tu auto queda listo para hacer match en Alabol</li>' : '') +
      '</ol>' +
      '</div>' +
      '<div class="confirm-actions">' +
      '<a href="/verificacion/" class="btn-secondary"><i class="fas fa-plus"></i> Verificar otro auto</a>' +
      '<a href="/" class="btn-gold"><i class="fas fa-home"></i> Volver al portal</a>' +
      '</div>' +
      '</div>';
  }

  // ── ALERT ──

  function showAlert(type, title, message) {
    if (typeof window.showCustomAlert === 'function') {
      window.showCustomAlert(type, title, message);
    } else {
      alert(title + ': ' + message);
    }
  }

  // ── INIT ──

  function init() {
    var hasDraft = loadDraft();

    // Populate estado dropdown
    var estadoSelect = g('inp-estado');
    if (estadoSelect) {
      ESTADOS_MEXICO.forEach(function (e) {
        var opt = document.createElement('option');
        opt.value = e;
        opt.textContent = e;
        estadoSelect.appendChild(opt);
      });
    }

    // Restore form fields if draft exists
    if (hasDraft) {
      if (g('inp-vin')) g('inp-vin').value = state.vin || '';
      if (g('inp-marca')) g('inp-marca').value = state.marca || '';
      if (g('inp-modelo')) g('inp-modelo').value = state.modelo || '';
      if (g('inp-anio')) g('inp-anio').value = state.anio || '';
      if (g('inp-color')) g('inp-color').value = state.color || '';
      if (g('inp-placas')) g('inp-placas').value = state.placas || '';
      if (g('inp-estado')) g('inp-estado').value = state.estado_registro || '';
      if (g('inp-titular')) g('inp-titular').value = state.nombre_titular || '';
      if (g('inp-nombre')) g('inp-nombre').value = state.nombre || '';
      if (g('inp-email')) g('inp-email').value = state.email || '';
      if (g('inp-telefono')) g('inp-telefono').value = state.telefono || '';
      if (g('chk-listing')) g('chk-listing').checked = state.es_listing;

      // Restore photo previews
      REQUIRED_PHOTOS.forEach(function (p) {
        if (state.photos[p.key] && state.photos[p.key].preview) {
          var imgEl = g('photo-preview-' + p.key);
          var statusEl = g('photo-status-' + p.key);
          var slot = g('photo-slot-' + p.key);
          if (imgEl) { imgEl.src = state.photos[p.key].preview; imgEl.style.display = 'block'; }
          if (statusEl) statusEl.innerHTML = '<span class="photo-ready"><i class="fas fa-check"></i> Lista</span>';
          if (slot) slot.classList.add('has-photo');
        }
      });
      updatePhotoCounter();

      // Restore tier selection
      selectTier(state.tier);

      if (state.vin && state.vin.length === 17) {
        onVinInput();
      }
    }

    // Bind VIN input
    var vinInput = g('inp-vin');
    if (vinInput) {
      vinInput.addEventListener('input', onVinInput);
      vinInput.addEventListener('paste', function () {
        setTimeout(onVinInput, 100);
      });
    }

    // Show correct step
    showStep(hasDraft ? state.paso : 1);
  }

  // Expose public API
  window.Verificacion = {
    init: init,
    nextStep: nextStep,
    prevStep: prevStep,
    selectTier: selectTier,
    handlePhotoSelect: handlePhotoSelect,
    removePhoto: removePhoto,
    submitVerificacion: submitVerificacion,
    scanDocument: scanDocument,
    REQUIRED_PHOTOS: REQUIRED_PHOTOS,
    TIERS: TIERS
  };

})();
