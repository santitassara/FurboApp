const multer = require('multer');

const TIPOS_PERMITIDOS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!TIPOS_PERMITIDOS[file.mimetype]) {
      const error = new Error('Formato de imagen no soportado. Usá JPG, PNG o WEBP.');
      error.status = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
}).single('foto');

function subirFoto(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      error.message = 'La imagen no puede pesar más de 3MB';
    }
    error.status = error.status || 400;
    next(error);
  });
}

module.exports = { subirFoto, TIPOS_PERMITIDOS };
