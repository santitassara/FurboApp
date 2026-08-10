const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const partidosRoutes = require('./routes/partidosRoutes');
const manejadorErrores = require('./middlewares/manejadorErrores');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/partidos', partidosRoutes);

app.use(manejadorErrores);

module.exports = app;
