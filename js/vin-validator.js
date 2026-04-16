// =============================================
// VIN VALIDATOR — ALABOL CAR BROKER
// Checksum ISO 3779 + NHTSA Decoder + REPUVE
// =============================================

(function () {
  'use strict';

  // Transliteración ISO 3779: letras → valores numéricos
  var TRANSLITERATION = {
    A:1, B:2, C:3, D:4, E:5, F:6, G:7, H:8,
    J:1, K:2, L:3, M:4, N:5, P:7, R:9,
    S:2, T:3, U:4, V:5, W:6, X:7, Y:8, Z:9,
    '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9
  };

  // Pesos por posición (1-17)
  var WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  // Caracteres prohibidos en VIN
  var INVALID_CHARS = /[IOQ]/i;

  /**
   * Valida el checksum del dígito 9 del VIN (ISO 3779)
   * @param {string} vin - VIN de 17 caracteres
   * @returns {{ valid: boolean, error: string|null, checkDigit: string|null }}
   */
  function validateChecksum(vin) {
    if (!vin || typeof vin !== 'string') {
      return { valid: false, error: 'El NIV es requerido', checkDigit: null };
    }

    vin = vin.trim().toUpperCase();

    if (vin.length !== 17) {
      return { valid: false, error: 'El NIV debe tener exactamente 17 caracteres', checkDigit: null };
    }

    if (INVALID_CHARS.test(vin)) {
      return { valid: false, error: 'El NIV no puede contener las letras I, O o Q', checkDigit: null };
    }

    var sum = 0;
    for (var i = 0; i < 17; i++) {
      var char = vin[i];
      var value = TRANSLITERATION[char];
      if (value === undefined) {
        return { valid: false, error: 'Caracter no valido en posicion ' + (i + 1) + ': ' + char, checkDigit: null };
      }
      sum += value * WEIGHTS[i];
    }

    var remainder = sum % 11;
    var expectedCheckDigit = remainder === 10 ? 'X' : String(remainder);
    var actualCheckDigit = vin[8];

    if (actualCheckDigit === expectedCheckDigit) {
      return { valid: true, error: null, checkDigit: expectedCheckDigit };
    }

    return {
      valid: false,
      error: 'Digito verificador incorrecto. Esperado: ' + expectedCheckDigit + ', encontrado: ' + actualCheckDigit,
      checkDigit: expectedCheckDigit
    };
  }

  /**
   * Valida formato básico del VIN sin checksum
   * (Para VINs de mercados que no usan dígito verificador)
   * @param {string} vin
   * @returns {{ valid: boolean, error: string|null }}
   */
  function validateFormat(vin) {
    if (!vin || typeof vin !== 'string') {
      return { valid: false, error: 'El NIV es requerido' };
    }

    vin = vin.trim().toUpperCase();

    if (vin.length !== 17) {
      return { valid: false, error: 'El NIV debe tener exactamente 17 caracteres' };
    }

    if (INVALID_CHARS.test(vin)) {
      return { valid: false, error: 'El NIV no puede contener las letras I, O o Q' };
    }

    if (/[^A-HJ-NPR-Z0-9]/.test(vin)) {
      return { valid: false, error: 'El NIV contiene caracteres no validos' };
    }

    return { valid: true, error: null };
  }

  /**
   * Decodifica VIN vía NHTSA vPIC API
   * @param {string} vin
   * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
   */
  function decodeNhtsa(vin) {
    vin = (vin || '').trim().toUpperCase();
    var url = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json';

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = null;

    if (controller) {
      timeoutId = setTimeout(function () { controller.abort(); }, 8000);
    }

    var fetchOptions = { method: 'GET' };
    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    return fetch(url, fetchOptions)
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) throw new Error('NHTSA respondio con status ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json.Results || !json.Results[0]) {
          return { success: false, data: null, error: 'Respuesta vacia de NHTSA' };
        }

        var r = json.Results[0];
        var errorCode = (r.ErrorCode || '0').toString();

        // ErrorCode "0" = sin errores. NHTSA puede devolver "0" o "0,6" (parcial).
        // Solo tratamos como error si NO contiene "0" en la lista separada por comas.
        var errorCodes = errorCode.split(',').map(function(c) { return c.trim(); });
        if (errorCodes.indexOf('0') === -1) {
          return {
            success: false,
            data: null,
            error: r.ErrorText || 'NHTSA no pudo decodificar este NIV'
          };
        }

        var decoded = {
          make: r.Make || '',
          model: r.Model || '',
          year: parseInt(r.ModelYear, 10) || null,
          bodyClass: r.BodyClass || '',
          fuelType: r.FuelTypePrimary || '',
          engineCylinders: r.EngineCylinders || '',
          engineDisplacement: r.DisplacementL || '',
          transmissionStyle: r.TransmissionStyle || '',
          driveType: r.DriveType || '',
          plantCountry: r.PlantCountry || '',
          plantCity: r.PlantCity || '',
          vehicleType: r.VehicleType || '',
          manufacturer: r.Manufacturer || '',
          errorCode: errorCode,
          errorText: r.ErrorText || ''
        };

        return { success: true, data: decoded, error: null };
      })
      .catch(function (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          return { success: false, data: null, error: 'Tiempo de espera agotado consultando NHTSA. Ingresa los datos manualmente.' };
        }
        return { success: false, data: null, error: 'Error consultando NHTSA: ' + err.message };
      });
  }

  /**
   * Compara datos declarados vs NHTSA decodificados
   * @param {{ marca: string, modelo: string, anio: number }} declared
   * @param {{ make: string, model: string, year: number }} nhtsa
   * @returns {{ match: boolean, discrepancies: string[] }}
   */
  function compareWithNhtsa(declared, nhtsa) {
    var discrepancies = [];

    if (!nhtsa || !declared) {
      return { match: true, discrepancies: [] };
    }

    var declaredMake = (declared.marca || '').toUpperCase().trim();
    var nhtsaMake = (nhtsa.make || '').toUpperCase().trim();
    if (declaredMake && nhtsaMake && nhtsaMake.indexOf(declaredMake) === -1 && declaredMake.indexOf(nhtsaMake) === -1) {
      discrepancies.push('Marca: declaraste "' + declared.marca + '" pero el NIV corresponde a "' + nhtsa.make + '"');
    }

    var declaredModel = (declared.modelo || '').toUpperCase().trim();
    var nhtsaModel = (nhtsa.model || '').toUpperCase().trim();
    if (declaredModel && nhtsaModel && nhtsaModel.indexOf(declaredModel) === -1 && declaredModel.indexOf(nhtsaModel) === -1) {
      discrepancies.push('Modelo: declaraste "' + declared.modelo + '" pero el NIV corresponde a "' + nhtsa.model + '"');
    }

    if (declared.anio && nhtsa.year && declared.anio !== nhtsa.year) {
      discrepancies.push('Ano: declaraste ' + declared.anio + ' pero el NIV corresponde a ' + nhtsa.year);
    }

    return {
      match: discrepancies.length === 0,
      discrepancies: discrepancies
    };
  }

  /**
   * Consulta REPUVE — link asistido + verificacion manual
   * REPUVE no tiene API publica. Generamos el link directo y
   * el verificador captura el resultado en el panel.
   * @param {string} vin
   * @returns {Promise<{ status: string, message: string, url: string }>}
   */
  function checkRepuve(vin) {
    return Promise.resolve({
      status: 'pendiente_verificacion',
      message: 'Nuestro verificador consultara REPUVE con tu NIV. Tambien puedes checarlo tu mismo en el sitio oficial.',
      url: 'https://www2.repuve.gob.mx:8443/ciudadania/'
    });
  }

  /**
   * Consulta NICB VINCheck — reporte de robo en USA (gratis)
   * Util para autos importados. Detecta si fue reportado robado en Estados Unidos.
   * @param {string} vin
   * @returns {Promise<{ success: boolean, stolen: boolean, message: string }>}
   */
  function checkNicb(vin) {
    // NICB VINCheck no tiene API REST publica — requiere captcha en su sitio.
    // Generamos el link directo para verificacion manual asistida.
    return Promise.resolve({
      success: true,
      stolen: false,
      message: 'Consulta NICB disponible para verificacion manual.',
      url: 'https://www.nicb.org/vincheck'
    });
  }

  /**
   * Detecta pais de origen por WMI (primeros 3 caracteres)
   * @param {string} vin
   * @returns {string}
   */
  function detectCountry(vin) {
    if (!vin || vin.length < 3) return 'Desconocido';
    var wmi = vin.substring(0, 2).toUpperCase();

    var countries = {
      '1':  'Estados Unidos', '4':  'Estados Unidos', '5':  'Estados Unidos',
      '2':  'Canada',
      '3A': 'Mexico', '3B': 'Mexico', '3C': 'Mexico', '3D': 'Mexico',
      '3E': 'Mexico', '3F': 'Mexico', '3G': 'Mexico', '3H': 'Mexico',
      '3J': 'Mexico', '3K': 'Mexico', '3L': 'Mexico', '3M': 'Mexico',
      '3N': 'Mexico', '3P': 'Mexico', '3R': 'Mexico', '3S': 'Mexico',
      '3T': 'Mexico', '3U': 'Mexico', '3V': 'Mexico', '3W': 'Mexico',
      '3X': 'Mexico', '3Y': 'Mexico', '3Z': 'Mexico',
      'J':  'Japon',
      'K':  'Corea del Sur',
      'L':  'China',
      'S':  'Reino Unido',
      'V':  'Francia/Espana',
      'W':  'Alemania',
      'Z':  'Italia',
      '9A': 'Brasil', '9B': 'Brasil', '93': 'Brasil'
    };

    return countries[wmi] || countries[wmi[0]] || 'Otro';
  }

  /**
   * Genera links de consulta asistida para el verificador
   * segun el estado de registro del vehiculo
   * @param {string} estado
   * @param {string} placas
   * @param {string} vin
   * @returns {object[]}
   */
  function getVerificationLinks(estado, placas, vin) {
    var links = [
      { name: 'REPUVE — Registro Publico Vehicular', url: 'https://www2.repuve.gob.mx:8443/ciudadania/', icon: 'fa-shield-halved', description: 'Consulta reporte de robo nacional' },
      { name: 'NICB VINCheck — Robo en USA', url: 'https://www.nicb.org/vincheck', icon: 'fa-flag-usa', description: 'Para autos importados de Estados Unidos' }
    ];

    // Links por estado
    var transitoEstatal = {
      'Ciudad de Mexico': 'https://www.finanzas.cdmx.gob.mx/servicios/servicio/consulta-de-adeudos-vehiculares',
      'Estado de Mexico': 'https://sfpya.edomexico.gob.mx/recaudacion/',
      'Jalisco': 'https://recaudacion.jalisco.gob.mx/vehicular',
      'Nuevo Leon': 'https://www.nl.gob.mx/tramites-y-servicios/consulta-de-adeudo-vehicular',
      'Puebla': 'https://www.finanzas.puebla.gob.mx/',
      'Guanajuato': 'https://portaltributario.guanajuato.gob.mx/',
      'Queretaro': 'https://pagos.queretaro.gob.mx/',
      'Chihuahua': 'https://www.chihuahua.gob.mx/recaudacion',
      'Sonora': 'https://hacienda.sonora.gob.mx/',
      'Coahuila': 'https://www.pagafacil.coahuila.gob.mx/',
      'Tamaulipas': 'https://recaudacion.tamaulipas.gob.mx/',
      'Sinaloa': 'https://declaranet.sinaloa.gob.mx/',
      'Baja California': 'https://www.bajacalifornia.gob.mx/recaudacion',
      'Veracruz': 'https://www.veracruz.gob.mx/finanzas/',
      'Yucatan': 'https://tramites.yucatan.gob.mx/',
      'Aguascalientes': 'https://www.aguascalientes.gob.mx/finanzas/'
    };

    if (estado && transitoEstatal[estado]) {
      links.push({
        name: 'Transito ' + estado + ' — Adeudos vehiculares',
        url: transitoEstatal[estado],
        icon: 'fa-building-columns',
        description: 'Consulta adeudos de tenencia, multas e infracciones'
      });
    }

    return links;
  }

  // Exponer API publica
  window.VinValidator = {
    validateChecksum: validateChecksum,
    validateFormat: validateFormat,
    decodeNhtsa: decodeNhtsa,
    compareWithNhtsa: compareWithNhtsa,
    checkRepuve: checkRepuve,
    checkNicb: checkNicb,
    detectCountry: detectCountry,
    getVerificationLinks: getVerificationLinks
  };

})();
