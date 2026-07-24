# scanList

Escaneo de códigos de barras, verificación y creación de listas de embarque.

Descripción

scanList es una aplicación móvil (Expo + React Native + TypeScript) para escanear códigos de barras, comprobar ítems y generar listas de embarque que pueden exportarse. Está pensada para uso en almacenes y logística ligera.

Características

- Escaneo de códigos de barras usando la cámara.
- Verificación (check) de ítems escaneados.
- Creación y edición de listas de embarque.
- Exportación/importación básica de datos (usa la librería xlsx).
- Integración con almacenamiento local (AsyncStorage) y manejo de archivos.

Requisitos

- Node.js (v16+ recomendado)
- npm o yarn
- Expo CLI (opcionalmente: instalar globalmente con `npm install -g expo-cli`)

Instalación

1. Clona el repositorio:

   git clone https://github.com/blackSer/scanList.git

2. Instala dependencias:

   npm install

   o

   yarn

Ejecución

- Iniciar la app con Expo:

  npm run start

  o

  yarn start

- Para ejecutar en Android o iOS desde Expo:

  npm run android
  npm run ios

Permisos

La aplicación requiere permisos de cámara y acceso a archivos (para exportar/importar). Asegúrate de dar permisos en el dispositivo/emulador.

Estructura del proyecto

- App.tsx — Entrada principal de la app.
- components/ — Componentes reutilizables.
- assets/ — Recursos estáticos.
- index.ts — Punto de arranque.

Dependencias clave

- expo, expo-camera, expo-file-system, expo-document-picker
- react, react-native
- xlsx — para exportar/importar hojas de cálculo
- @react-native-async-storage/async-storage — almacenamiento local

Desarrollo

- El proyecto está en TypeScript; ejecuta el linter/compilación según tu flujo de trabajo.
- Para cambios grandes, crea una rama nueva y abre un Pull Request.

Contribuciones

Las contribuciones son bienvenidas. Abre un issue o PR describiendo los cambios.

Licencia

Añade un archivo LICENSE si quieres publicar bajo una licencia específica. Actualmente no se incluye una licencia en el repositorio.

Contacto

Repositorio: https://github.com/blackSer/scanList
