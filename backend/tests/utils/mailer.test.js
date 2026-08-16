jest.mock('nodemailer');

describe('mailer.enviarMail', () => {
  const ENV_ORIGINAL = process.env;
  let sendMailMock;
  let createTransportMock;

  beforeEach(() => {
    jest.resetModules();
    
    // Fresh mocks for each test
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));
    
    // Setup nodemailer mock
    const nodemailer = require('nodemailer');
    nodemailer.createTransport = createTransportMock;
    
    process.env = { ...ENV_ORIGINAL };
  });

  afterAll(() => {
    process.env = ENV_ORIGINAL;
  });

  it('no envía y no lanza si falta configuración SMTP', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const { enviarMail } = require('../../src/utils/mailer');

    await expect(
      enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' })
    ).resolves.toBeUndefined();

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('envía el mail cuando la configuración SMTP está completa', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'usuario@test.com';
    process.env.SMTP_PASS = 'secreto';
    process.env.MAIL_FROM = 'FurboApp <no-reply@test.com>';
    const { enviarMail } = require('../../src/utils/mailer');

    await enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario@test.com', pass: 'secreto' },
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'FurboApp <no-reply@test.com>',
      to: 'jugador@mail.com',
      subject: 'Asunto',
      html: '<p>Hola</p>',
    });
  });

  it('no envía y no lanza si SMTP_PORT no es numérico aunque el resto esté configurado', async () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587x';
    process.env.SMTP_USER = 'usuario@test.com';
    process.env.SMTP_PASS = 'secreto';
    const { enviarMail } = require('../../src/utils/mailer');

    await expect(
      enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' })
    ).resolves.toBeUndefined();

    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('mailer.verificarConfigSmtp', () => {
  const ENV_ORIGINAL = process.env;
  let warnSpy;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ENV_ORIGINAL };
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    process.env = ENV_ORIGINAL;
  });

  it('advierte cuando faltan variables de SMTP', () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const { verificarConfigSmtp } = require('../../src/utils/mailer');

    verificarConfigSmtp();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/SMTP no configurado o inválido/);
  });

  it('advierte cuando SMTP_PORT no es numérico aunque el resto esté configurado', () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587x';
    process.env.SMTP_USER = 'usuario@test.com';
    process.env.SMTP_PASS = 'secreto';
    const { verificarConfigSmtp } = require('../../src/utils/mailer');

    verificarConfigSmtp();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/SMTP no configurado o inválido/);
  });

  it('no advierte cuando la configuración SMTP es válida', () => {
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'usuario@test.com';
    process.env.SMTP_PASS = 'secreto';
    const { verificarConfigSmtp } = require('../../src/utils/mailer');

    verificarConfigSmtp();

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('no duplica la advertencia si enviarMail también dispara la comprobación', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const { verificarConfigSmtp, enviarMail } = require('../../src/utils/mailer');

    verificarConfigSmtp();
    await enviarMail({ to: 'jugador@mail.com', subject: 'Asunto', html: '<p>Hola</p>' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
