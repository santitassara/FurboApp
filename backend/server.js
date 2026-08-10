require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`FurboApp backend escuchando en el puerto ${PORT}`);
});
