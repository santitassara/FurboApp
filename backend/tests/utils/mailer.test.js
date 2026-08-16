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
});
