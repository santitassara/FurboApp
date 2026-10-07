// Carga el .env del backend antes de que cualquier suite requiera config/firebase.js
// (que necesita FIREBASE_SERVICE_ACCOUNT). Sin esto, las suites que importan
// notificacionesService fallan al arrancar aunque la app corra bien con `npm run dev`.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
