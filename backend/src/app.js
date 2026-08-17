const path = require('node:path');
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const partidosRoutes = require('./routes/partidosRoutes');
const gruposRoutes = require('./routes/gruposRoutes');
const manejadorErrores = require('./middlewares/manejadorErrores');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/grupos/:grupoId/partidos', partidosRoutes);
app.use('/api/grupos', gruposRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use(manejadorErrores);

module.exports = app;
