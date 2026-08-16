const nodemailer = require('nodemailer');

let advertenciaEmitida = false;

function tieneConfigSmtp() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(
    SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && Number.isInteger(Number(SMTP_PORT))
  );
}

function advertirSiConfigInvalida() {
  if (!tieneConfigSmtp() && !advertenciaEmitida) {
    console.warn('SMTP no configurado o inválido: los recordatorios de partido no se enviarán por mail');
    advertenciaEmitida = true;
  }
}

function verificarConfigSmtp() {
  advertirSiConfigInvalida();
}

async function enviarMail({ to, subject, html }) {
  if (!tieneConfigSmtp()) {
    advertirSiConfigInvalida();
    return;
  }

  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporte.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

module.exports = { enviarMail, verificarConfigSmtp };
