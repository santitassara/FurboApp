const { crearDbDeTest } = require('../helpers/testDb');

const mockDb = crearDbDeTest();
jest.mock('../../src/config/db', () => ({ db: mockDb }));

const { inicializarHabilidades } = require('../../src/services/ratingService');
const { CAMPOS_HABILIDAD } = require('../../src/services/usuariosService');

describe('inicializarHabilidades', () => {
  test('distributes rating by position weights', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 20, pegada: 15, tocaPase: 20, gambeta: 15, marcaDefensa: 15, fisico: 15 };
    const puntajeEscalado = 70;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // Weighted: each skill = puntajeEscalado * (peso / totalPeso)
    // Total = 100, so skills = 70 * (weight/100)
    expect(result.velocidad).toBeCloseTo(14); // 70 * 0.20
    expect(result.pegada).toBeCloseTo(10.5); // 70 * 0.15
  });

  test('works with decimal weights summing to 1 (PESOS_POSICION format)', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 0.225, pegada: 0.275, tocaPase: 0.125, gambeta: 0.25, marcaDefensa: 0.05, fisico: 0.075 };
    const puntajeEscalado = 80;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // Total = 1.0, so skills = 80 * weight
    expect(result.velocidad).toBeCloseTo(18); // 80 * 0.225
    expect(result.pegada).toBeCloseTo(22); // 80 * 0.275
    expect(result.tocaPase).toBeCloseTo(10); // 80 * 0.125
    expect(result.gambeta).toBeCloseTo(20); // 80 * 0.25
    expect(result.marcaDefensa).toBeCloseTo(4); // 80 * 0.05
    expect(result.fisico).toBeCloseTo(6); // 80 * 0.075
  });

  test('uses 0 for missing weight fields', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 50, pegada: 50 }; // missing other fields
    const puntajeEscalado = 60;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    expect(result.velocidad).toBeCloseTo(30); // 60 * 0.5
    expect(result.pegada).toBeCloseTo(30); // 60 * 0.5
    expect(result.tocaPase).toBe(0);
    expect(result.gambeta).toBe(0);
    expect(result.marcaDefensa).toBe(0);
    expect(result.fisico).toBe(0);
  });

  test('returns all 6 CAMPOS_HABILIDAD fields', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 100 };
    const puntajeEscalado = 50;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    for (const campo of CAMPOS_HABILIDAD) {
      expect(result).toHaveProperty(campo);
      expect(typeof result[campo]).toBe('number');
    }
  });

  test('rounds to 2 decimal places', () => {
    const usuario = { velocidad: null, pegada: null, tocaPase: null, gambeta: null, marcaDefensa: null, fisico: null };
    const pesos = { velocidad: 33, pegada: 33, tocaPase: 34 }; // totals to 100
    const puntajeEscalado = 100;
    const result = inicializarHabilidades(usuario, pesos, puntajeEscalado);
    // 100 * 33/100 = 33, 100 * 34/100 = 34
    expect(result.velocidad).toBe(33);
    expect(result.pegada).toBe(33);
    expect(result.tocaPase).toBe(34);
  });
});