# Seguridad y cumplimiento

## Qué hace el panel
- **Sin secretos en el código.** Solo la clave pública de Supabase; nunca `service_role`. Los secretos de n8n y LetsBot viven en sus credenciales, no aquí.
- **Acceso por RLS.** Cada asesor ve solo sus leads; los administradores ven todo. El navegador no puede borrar leads ni su historial.
- **Content Security Policy** estricta: scripts solo del propio sitio y de jsDelivr; conexiones solo al proyecto de Supabase; sin iframes ni formularios externos.
- **Integridad de la librería (SRI)**: supabase-js 2.49.4 fijada por versión y hash.
- **Sesión**: cierre automático tras 30 min sin actividad; al salir se borran los datos de la pantalla.
- **Sin indexar**: `robots.txt` y `noindex`. Sin analítica ni cookies de terceros.

## Datos personales (LFPDPPP, México)
- El panel muestra datos personales de prospectos (nombre, WhatsApp, interés). Uso interno exclusivo del asesor asignado y su gerente.
- El aviso de privacidad y el consentimiento se recaban en la landing (`consentimiento_at`). La baja del cliente (`opt_out`, llega con la migración de lectura del cliente) se respeta: el panel la marca y el motor no le vuelve a escribir.
- WhatsApp (Meta): solo plantillas aprobadas fuera de la ventana de 24 h; se respeta la baja inmediata.

## Pendientes en Supabase (dashboard)
- Activar **Leaked password protection** (Authentication → Policies/Passwords).
- Confirmación de correo obligatoria activada (necesaria para ligar cuentas por correo).
- Aplicar `supabase/mv_panel_seguridad.sql` (quita permisos sobrantes a `anon`/`authenticated` y permite leer mensajes propios).
- Aplicar `supabase/mv_rol_negocio.sql` (rol negocio de solo lectura por agencia; sin acceso a conversaciones).
- Antes de dar acceso a otras agencias: pasar `agencia` (texto) a una tabla de agencias con id.

## Reportar un problema
Escribir al dueño del proyecto. No abrir issues públicos con datos de clientes.
