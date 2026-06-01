"""
Scraper para automoviles-usados.com → Supabase inventario (Alabol Car Broker)
Extrae todos los autos del catálogo y los sube a la tabla inventario.

Uso:
    python scraper_automoviles.py              # Scrape completo
    python scraper_automoviles.py --dry-run    # Solo muestra datos, no sube nada
"""

import re
import sys
import json
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# ─── Configuración Supabase ───
SUPABASE_URL = "https://rgnunjngtsgqgvplawfr.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbnVuam5ndHNncWd2cGxhd2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODcxMjksImV4cCI6MjA4ODE2MzEyOX0.8gd4XNoBI2mwbV54cORvVGOmJVwdzEidti38AcsqhB8"

# ─── Configuración del sitio ───
BASE_URL = "https://www.automoviles-usados.com"
AGENCIA_ID = "automoviles-usados-cdmx"
CIUDAD = "CDMX"
ORIGEN = "scraping"

# ─── Headers para parecer navegador normal ───
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
}

# ─── Mapeo de marcas conocidas ───
MARCAS_CONOCIDAS = [
    "Dodge", "Ford", "Porsche", "Hyundai", "Chevrolet", "Jeep", "BMW", "JAC",
    "Mini", "Chery", "Chirey", "Toyota", "Mercedes Benz", "Mercedes-Benz",
    "Kia", "Nissan", "Tesla", "Jaguar", "Mitsubishi", "Lincoln", "Audi",
    "Cadillac", "Volkswagen", "Honda", "Mazda", "Volvo", "Seat", "Renault",
    "Peugeot", "Suzuki", "Subaru", "Land Rover", "Range Rover", "Infiniti",
    "Acura", "Lexus", "Genesis", "Buick", "GMC", "RAM", "Chrysler", "Fiat",
    "Alfa Romeo",
]


def extraer_marca_modelo_anio(titulo: str) -> dict:
    """Extrae marca, modelo y año del título del auto."""
    titulo = titulo.strip()

    # Extraer año (4 dígitos al final o en medio)
    anio_match = re.search(r'\b(19|20)\d{2}\b', titulo)
    anio = int(anio_match.group()) if anio_match else None

    # Extraer marca
    marca = None
    titulo_upper = titulo.upper()
    for m in sorted(MARCAS_CONOCIDAS, key=len, reverse=True):
        if m.upper() in titulo_upper:
            marca = m
            break

    # El modelo es lo que queda después de quitar marca y año
    modelo = titulo
    if marca:
        # Quitar marca del título (case insensitive)
        modelo = re.sub(re.escape(marca), '', modelo, flags=re.IGNORECASE).strip()
    if anio:
        modelo = modelo.replace(str(anio), '').strip()

    # Limpiar espacios extra y guiones sueltos
    modelo = re.sub(r'\s+', ' ', modelo).strip(' -')

    # Si no encontró marca, intentar tomar la primera palabra
    if not marca:
        partes = titulo.split()
        if partes:
            marca = partes[0]
            modelo = ' '.join(partes[1:])
            if anio:
                modelo = modelo.replace(str(anio), '').strip(' -')

    return {"marca": marca or "Desconocida", "modelo": modelo or titulo, "anio": anio}


def extraer_precio(texto: str) -> float | None:
    """Extrae precio numérico de texto como '$449,900.00' o '$1,300,000.00'."""
    # Normalizar: quitar saltos de línea y espacios múltiples entre $ y números
    texto_norm = re.sub(r'\$\s+', '$', texto)
    # Buscar patrón PRECIO: $X,XXX,XXX.XX primero (más confiable)
    precio_match = re.search(r'PRECIO\s*:?\s*\$\s*([\d,]+(?:\.\d{2})?)', texto_norm, re.IGNORECASE)
    if precio_match:
        return float(precio_match.group(1).replace(',', ''))
    # Buscar todos los precios con $ y tomar el mayor razonable
    matches = re.findall(r'\$([\d,]+(?:\.\d{2})?)', texto_norm)
    if matches:
        valores = [float(m.replace(',', '')) for m in matches]
        # Filtrar precios razonables para autos (>= $50,000 MXN)
        razonables = [v for v in valores if v >= 50000]
        if razonables:
            return max(razonables)
        # Si no hay ninguno razonable, tomar el mayor > 10k
        mayores = [v for v in valores if v >= 10000]
        if mayores:
            return max(mayores)
    return None


def extraer_kilometraje(texto: str) -> int | None:
    """Extrae kilometraje de texto como '44,000 km'."""
    match = re.search(r'([\d,]+)\s*km', texto, re.IGNORECASE)
    if match:
        return int(match.group(1).replace(',', ''))
    return None


def extraer_vin(texto: str) -> str | None:
    """Extrae VIN/Número de serie (17 caracteres alfanuméricos)."""
    match = re.search(r'\b[A-HJ-NPR-Z0-9]{17}\b', texto, re.IGNORECASE)
    return match.group().upper() if match else None


def detectar_transmision(texto: str) -> str | None:
    """Detecta tipo de transmisión del texto."""
    texto_lower = texto.lower()
    if 'automática' in texto_lower or 'automatica' in texto_lower or 'aut.' in texto_lower:
        return 'Automática'
    if 'manual' in texto_lower or 'estándar' in texto_lower or 'estandar' in texto_lower:
        return 'Manual'
    if 'cvt' in texto_lower:
        return 'CVT'
    return None


def detectar_combustible(titulo: str, texto_completo: str = '') -> str:
    """Detecta tipo de combustible. Prioriza el título sobre el texto completo."""
    titulo_lower = titulo.lower()
    # Primero buscar en el título (más confiable)
    if 'eléctric' in titulo_lower or 'electric' in titulo_lower or '100% eléctric' in titulo_lower:
        return 'eléctrico'
    if 'phev' in titulo_lower or 'híbrid' in titulo_lower or 'enchufable' in titulo_lower:
        return 'híbrido'
    if 'diesel' in titulo_lower or 'diésel' in titulo_lower:
        return 'diesel'
    # Si tiene V6, V8, HEMI, Turbo, EcoBoost — es gasolina seguro
    if any(w in titulo_lower for w in ['v6', 'v8', 'hemi', 'turbo', 'ecoboost', 'cgi', 'tsi']):
        return 'gasolina'
    # Marcas/modelos que son eléctricos por naturaleza
    if any(w in titulo_lower for w in ['tesla', 'model s', 'model 3', 'model x', 'model y']):
        return 'eléctrico'
    # NO buscar "totalmente eléctrica" en texto completo — a menudo se refiere a
    # ventanas/seguros eléctricos, no al motor. Solo confiar en el título.
    return 'gasolina'


def detectar_traccion(texto: str) -> str:
    """Detecta tipo de tracción."""
    texto_lower = texto.lower()
    if '4x4' in texto_lower or 'awd' in texto_lower or '4wd' in texto_lower:
        return '4x4'
    if 'fwd' in texto_lower:
        return '4x2'
    return '4x2'


def detectar_tipo_vehiculo(texto: str) -> str:
    """Detecta tipo de vehículo."""
    texto_lower = texto.lower()
    if any(w in texto_lower for w in ['suv', 'tucson', 'tiggo', 'cayenne', 'cherokee', 'wrangler', 'explorer', 'escape', 'outlander', 'x3', 'q3', 'e-tron', 'sequoia', 'mkx', 'mkc', 'durango', 'escalade', 'sei4']):
        return 'SUV'
    if any(w in texto_lower for w in ['pickup', 'f-150', 'f150', 'cabina']):
        return 'pickup'
    if any(w in texto_lower for w in ['van', 'transit', 'sedona', 'traverse']):
        return 'van'
    if any(w in texto_lower for w in ['coupe', 'coupé', 'f-type', 'deportivo']):
        return 'coupe'
    if any(w in texto_lower for w in ['hb', 'hatchback', 'march', 'cooper']):
        return 'hatchback'
    return 'sedan'


def obtener_links_autos() -> list[dict]:
    """Obtiene todos los links de autos de la página principal."""
    print(f"Scrapeando pagina principal: {BASE_URL}")
    resp = fetch_con_reintentos(BASE_URL)
    soup = BeautifulSoup(resp.text, 'html.parser')

    autos = []
    # Buscar todos los links que apuntan a páginas de autos
    for link in soup.find_all('a', href=True):
        href = link['href']
        # Filtrar solo links de autos (tienen formato /nombre-del-auto-año/)
        if re.match(r'^/[\w\-]+-\d{4}/?$', href) or re.match(r'^https?://www\.automoviles-usados\.com/[\w\-]+-\d{4}', href):
            url = urljoin(BASE_URL, href)
            # Buscar imagen asociada
            img = link.find('img')
            foto_principal = None
            if img and img.get('src'):
                foto_principal = urljoin(BASE_URL, img['src'])

            if url not in [a['url'] for a in autos]:
                autos.append({
                    'url': url,
                    'foto_principal': foto_principal
                })

    print(f"  Encontrados {len(autos)} autos en la página principal")
    return autos


def fetch_con_reintentos(url: str, max_reintentos: int = 3) -> requests.Response:
    """Hace GET con reintentos automáticos."""
    for intento in range(max_reintentos):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            return resp
        except (requests.ConnectionError, requests.Timeout) as e:
            if intento < max_reintentos - 1:
                wait = 3 * (intento + 1)
                print(f"    Reintentando en {wait}s... ({e.__class__.__name__})")
                time.sleep(wait)
            else:
                raise


def scrapear_detalle(url: str) -> dict:
    """Scrapea la página de detalle de un auto."""
    print(f"  Scrapeando: {url}")
    resp = fetch_con_reintentos(url)
    soup = BeautifulSoup(resp.text, 'html.parser')

    # Obtener todo el texto — usar ' ' como separador para unir spans adyacentes
    texto_completo = soup.get_text(separator=' ')
    # Normalizar espacios múltiples
    texto_completo = re.sub(r'\s+', ' ', texto_completo)

    # Título: usar el h1 o el title
    titulo_tag = soup.find('h1') or soup.find('title')
    titulo = titulo_tag.get_text(strip=True) if titulo_tag else url.split('/')[-2]

    # Extraer datos del título
    datos = extraer_marca_modelo_anio(titulo)

    # Precio — extraer del HTML raw sin tags (spans pueden cortar números)
    html_sin_tags = re.sub(r'<[^>]+>', '', str(soup))
    html_sin_tags = re.sub(r'\s+', ' ', html_sin_tags)
    datos['precio_venta'] = extraer_precio(html_sin_tags)
    # Fallback: texto de BS4
    if not datos['precio_venta'] or datos['precio_venta'] < 50000:
        precio_texto = extraer_precio(texto_completo)
        if precio_texto and precio_texto >= 50000:
            datos['precio_venta'] = precio_texto

    # Kilometraje
    datos['kilometraje'] = extraer_kilometraje(texto_completo)

    # VIN
    datos['vin'] = extraer_vin(texto_completo)

    # Transmisión
    datos['transmision'] = detectar_transmision(texto_completo)

    # Combustible — priorizar título sobre texto completo
    datos['combustible'] = detectar_combustible(titulo, texto_completo[:2000])

    # Tracción
    datos['traccion'] = detectar_traccion(titulo + ' ' + texto_completo[:2000])

    # Tipo de vehículo
    datos['tipo_vehiculo'] = detectar_tipo_vehiculo(titulo + ' ' + texto_completo[:2000])

    # Motor - buscar patrones como "V8", "4cil", "2.0", "Turbo"
    motor_match = re.search(r'(V\d|[0-9]\.[0-9]L?|[0-9]cil|HEMI|TwinPower|EcoBoost|Turbo|Super\s*Carg\w+)', titulo, re.IGNORECASE)
    datos['motor'] = motor_match.group() if motor_match else None

    # Fotos - buscar todas las imágenes del contenido
    fotos = []
    for img in soup.find_all('img', src=True):
        src = urljoin(BASE_URL, img['src'])
        if 'cc_images' in src and 'logo' not in src.lower():
            # Convertir thumbnails a versión cache (más grande)
            src = src.replace('/thumb_', '/cache_')
            if src not in fotos:
                fotos.append(src)
    datos['fotos'] = fotos

    # Descripción - tomar el primer bloque de texto sustancial
    descripcion_parts = []
    for p in soup.find_all(['p', 'li']):
        text = p.get_text(strip=True)
        if len(text) > 30 and '$' not in text and 'cookie' not in text.lower():
            descripcion_parts.append(text)
            if len(descripcion_parts) >= 5:
                break
    datos['descripcion'] = ' | '.join(descripcion_parts) if descripcion_parts else None

    return datos


def preparar_registro(datos: dict) -> dict:
    """Prepara el registro para insertar en Supabase."""
    registro = {
        'agencia_id': AGENCIA_ID,
        'marca': datos['marca'],
        'modelo': datos['modelo'],
        'anio': datos['anio'],
        'precio_venta': datos.get('precio_venta', 0) or 0,
        'kilometraje': datos.get('kilometraje', 0) or 0,
        'transmision': datos.get('transmision'),
        'combustible': datos.get('combustible', 'gasolina'),
        'tipo_vehiculo': datos.get('tipo_vehiculo', 'sedan'),
        'traccion': datos.get('traccion', '4x2'),
        'motor': datos.get('motor'),
        'vin': datos.get('vin'),
        'fotos': datos.get('fotos', []),
        'descripcion': datos.get('descripcion'),
        'ciudad': CIUDAD,
        'origen': ORIGEN,
        'estatus': 'disponible',
        'estado_mecanico': 'pendiente',
        'estado_legal': 'pendiente',
    }

    # Generar normalized_tag para búsquedas
    tag_parts = [registro['marca'], registro['modelo'], str(registro['anio'] or '')]
    registro['normalized_tag'] = ' '.join(tag_parts).lower().strip()

    return registro


def subir_a_supabase(registros: list[dict]) -> dict:
    """Sube registros a Supabase usando la API REST con upsert por VIN."""
    url = f"{SUPABASE_URL}/rest/v1/inventario"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    exitos = 0
    errores = 0
    duplicados = 0

    for reg in registros:
        # Verificar si ya existe por VIN o por marca+modelo+año
        existe = False
        if reg.get('vin'):
            check_url = f"{url}?vin=eq.{reg['vin']}&select=id"
            check_resp = requests.get(check_url, headers=headers, timeout=10)
            if check_resp.ok and check_resp.json():
                existe = True
                duplicados += 1
                print(f"    [DUP] Duplicado (VIN): {reg['marca']} {reg['modelo']} {reg['anio']}")
                continue

        if not existe:
            # Verificar por marca+modelo+año
            check_url = f"{url}?marca=eq.{reg['marca']}&modelo=eq.{reg['modelo']}&anio=eq.{reg['anio']}&select=id"
            check_resp = requests.get(check_url, headers=headers, timeout=10)
            if check_resp.ok and check_resp.json():
                duplicados += 1
                print(f"    [DUP] Duplicado: {reg['marca']} {reg['modelo']} {reg['anio']}")
                continue

        # Insertar
        resp = requests.post(url, headers=headers, json=reg, timeout=15)
        if resp.ok:
            exitos += 1
            print(f"    [OK] Insertado: {reg['marca']} {reg['modelo']} {reg['anio']} - ${reg['precio_venta']:,.0f}")
        else:
            errores += 1
            print(f"    [ERR] Error: {reg['marca']} {reg['modelo']} - {resp.status_code}: {resp.text[:200]}")

    return {"exitos": exitos, "errores": errores, "duplicados": duplicados}


def main():
    dry_run = '--dry-run' in sys.argv

    print("=" * 60)
    print("  ALABOL - Scraper de automoviles-usados.com")
    print("=" * 60)

    if dry_run:
        print("  MODO DRY-RUN: Solo muestra datos, no sube nada\n")
    else:
        print(f"  Destino: Supabase -> tabla inventario\n")

    # Paso 1: Obtener links de todos los autos
    autos_links = obtener_links_autos()

    if not autos_links:
        print("No se encontraron autos. Verifica que el sitio esté accesible.")
        return

    # Paso 2: Scrapear detalle de cada auto
    print(f"\nScrapeando detalle de {len(autos_links)} autos...")
    registros = []

    for i, auto in enumerate(autos_links, 1):
        try:
            datos = scrapear_detalle(auto['url'])
            registro = preparar_registro(datos)

            # Si no tiene fotos del detalle pero sí de la principal, usar esa
            if not registro['fotos'] and auto.get('foto_principal'):
                registro['fotos'] = [auto['foto_principal']]

            registros.append(registro)

            # Pausa entre requests para no saturar el servidor
            if i < len(autos_links):
                time.sleep(1)

        except Exception as e:
            print(f"    [ERR] Error en {auto['url']}: {e}")

    # Paso 3: Mostrar resumen o subir
    print(f"\n{'=' * 60}")
    print(f"  Autos procesados: {len(registros)}")
    print(f"{'=' * 60}\n")

    if dry_run:
        for r in registros:
            print(f"  {r['marca']} {r['modelo']} {r['anio']}")
            print(f"    Precio: ${r['precio_venta']:,.0f} MXN")
            print(f"    Km: {r['kilometraje']:,}")
            print(f"    Transmisión: {r['transmision'] or 'N/A'}")
            print(f"    Combustible: {r['combustible']}")
            print(f"    Tipo: {r['tipo_vehiculo']}")
            print(f"    VIN: {r['vin'] or 'N/A'}")
            print(f"    Fotos: {len(r['fotos'])}")
            print()

        # Guardar JSON para inspección
        with open('scraper_output.json', 'w', encoding='utf-8') as f:
            json.dump(registros, f, ensure_ascii=False, indent=2)
        print(f"Datos guardados en scraper_output.json")
    else:
        print("Subiendo a Supabase...")
        resultado = subir_a_supabase(registros)
        print(f"\n{'=' * 60}")
        print(f"  RESULTADO FINAL")
        print(f"  Insertados: {resultado['exitos']}")
        print(f"  Duplicados: {resultado['duplicados']}")
        print(f"  Errores:    {resultado['errores']}")
        print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
