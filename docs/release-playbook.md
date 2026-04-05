# Release Playbook

## Objetivo

Generar instalables reales para probar BOTIX como producto:

- Windows: instalador `.exe`
- Android repartidor: `.apk`

## Windows

Ruta de trabajo: `apps/desktop`

Comando:

`npm run dist:desktop`

Salida esperada:

- `apps/desktop/release/BOTIX Setup <version>.exe`

Build remoto viable:

- workflow GitHub Actions: `.github/workflows/desktop-release.yml`
- artifact esperado: `botix-desktop-installer`

Pruebas recomendadas:

1. Instalar en una PC limpia.
2. Iniciar sesion con admin y caja.
3. Crear pedido.
4. Asignar repartidor.
5. Ver reflejo de cambios en Firestore.

## Android

Ruta de trabajo: `apps/driver`

Comando para APK instalable:

`npm run dist:driver:apk`

Comando para Play Store:

`npm run dist:driver:aab`

Salida esperada:

- build EAS con link de descarga del `.apk`

Build remoto alternativo ya preparado:

- workflow GitHub Actions: `.github/workflows/driver-apk.yml`
- artifact esperado: `botix-driver-apk`

Pruebas recomendadas:

1. Instalar APK en telefono Android.
2. Iniciar sesion como repartidor.
3. Ver pedido asignado en tiempo real.
4. Marcar `En camino`.
5. Confirmar escritura en `liveTracking`.
6. Marcar `Entregado`.

## Checklist de bugs

Registrar por cada prueba:

- plataforma
- version instalada
- usuario usado
- paso exacto
- resultado esperado
- resultado real
- coleccion/documento Firebase involucrado

## Limitaciones actuales del entorno local

- `npm` en esta maquina viene fallando con binarios nativos y SSL.
- La configuracion de empaquetado ya esta preparada, pero la generacion real del instalador puede requerir limpiar Node/npm para compilar sin errores externos al codigo.

## Variables Firebase en CI

Los workflows ya quedaron configurados con el proyecto actual `botix-e493b`, por lo que no necesitas cargar secrets solo para probar los builds iniciales.

Si mas adelante quieres reutilizar el pipeline para otros clientes, conviene mover esas variables a secrets o vars del repositorio.

## Camino mas viable hoy

Dado el bloqueo de ejecucion de binarios locales en esta maquina, el camino mas viable para obtener instalables reales es:

1. Subir el repo a GitHub.
2. Cargar los secrets.
3. Ejecutar los workflows manualmente.
4. Descargar el `.exe` y el `.apk` desde Artifacts.
