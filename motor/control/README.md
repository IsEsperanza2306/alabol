# Panel · Motor de Ventas

Panel web del Motor de Ventas: cartera activa por etapa, lectura del cliente (calor, ruta y guía), línea de tiempo del tratamiento y métricas de seguimiento.

- Sitio estático (GitHub Pages): `index.html`, `styles.css`, `app.js`. Sin build.
- Datos: Supabase (tablas `mv_*`). El navegador usa solo la **clave pública (publishable)**; lo que cada usuario ve lo decide RLS en la base (`mv_es_mio`, `mv_soy_admin`).
- Acceso: usuarios de Supabase Auth ligados a un asesor (`mv_asesores.user_id`) o administradores (`mv_admins`). Al entrar con un correo confirmado, la cuenta se liga sola a su asesor si el correo coincide.
- Demostración sin login y con datos ficticios: `?demo=1` (administrador), `?demo=1&rol=negocio`, `?demo=1&rol=asesor`.

## Vistas por rol (el rol lo decide la base con `mv_mi_rol()` y RLS)
- **Administrador** (`mv_admins`): Control del motor (decisiones sugeridas, indicadores, embudo visita → venta, desempeño por asesor, origen, modelos, alertas de cumplimiento y tracking), Vista del negocio y Cartera activa.
- **Negocio** (`mv_negocio_miembros`, dueño o gerente de la agencia): resumen en una frase, 4 indicadores, lo que requiere atención hoy, su equipo con semáforo, motivos de pérdida. Solo lectura y sin acceso a conversaciones.
- **Asesor** (`mv_asesores.user_id`): su cartera activa con guía, PMAN, tareas y línea de tiempo.

## Alta de un negocio
`insert into mv_negocio_miembros (user_id, agencia) select id, '<agencia>' from auth.users where lower(email)=lower('<correo>');` (requiere `supabase/mv_rol_negocio.sql`).

## Alta de un asesor
1. Crear el usuario en Supabase → Authentication → Users (invitar por correo).
2. Poner ese correo en `mv_asesores.email`. Al primer inicio de sesión queda ligado.

## Configuración de Supabase Auth
- Site URL y Redirect URLs: agregar la URL del panel en GitHub Pages (para el enlace por correo).
- Ver `SECURITY.md`.
