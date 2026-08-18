const { generarCodigoInvitacion } = require('../../src/utils/codigoInvitacion');

describe('generarCodigoInvitacion', () => {
  it('arma un código con el nombre en mayúsculas y un sufijo', () => {
    const codigo = generarCodigoInvitacion('Fútbol de los Jueves');
    expect(codigo).toMatch(/^FUTBOLDELO-[A-F0-9]{4}$/);
  });

  it('trunca el nombre a 10 caracteres', () => {
    const codigo = generarCodigoInvitacion('Un Nombre Muy Pero Muy Largo');
    const [slug] = codigo.split('-');
    expect(slug.length).toBeLessThanOrEqual(10);
  });

  it('usa GRUPO si el nombre no deja caracteres alfanuméricos', () => {
    const codigo = generarCodigoInvitacion('!!!');
    expect(codigo.startsWith('GRUPO-')).toBe(true);
  });

  it('genera códigos distintos en llamadas sucesivas', () => {
    const a = generarCodigoInvitacion('Jueves');
    const b = generarCodigoInvitacion('Jueves');
    expect(a).not.toBe(b);
  });
});
