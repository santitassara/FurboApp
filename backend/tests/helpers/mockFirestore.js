function crearDocMock({ get, set, update, id = 'id-generado' } = {}) {
  return {
    id,
    get: get || jest.fn(),
    set: set || jest.fn(),
    update: update || jest.fn(),
  };
}

function crearColeccionMock({ get, add, doc } = {}) {
  const coleccion = {
    where: jest.fn(() => coleccion),
    get: get || jest.fn(),
    add: add || jest.fn(),
    doc: jest.fn(() => doc || crearDocMock()),
  };
  return coleccion;
}

module.exports = { crearDocMock, crearColeccionMock };
