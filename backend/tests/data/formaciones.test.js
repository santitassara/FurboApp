const {
  FORMACIONES_POR_CANTIDAD,
  LINEAS_CAMPO,
  CODIGO_AUTOMATICO,
  CODIGO_LIBRE,
  listarFormaciones,
  resolverLineas,
  capacidadBroad,
} = require('../../src/data/formaciones');

describe('catálogo de formaciones — invariantes', () => {
  it('cada formación suma exactamente la cantidad de jugadores del grupo', () => {
    for (const [cantidadTexto, formaciones] of Object.entries(FORMACIONES_POR_CANTIDAD)) {
      const cantidadJugadores = Number(cantidadTexto);
      for (const formacion of formaciones) {
        const suma = formacion.lineas.reduce((acc, l) => acc + l.cantidad, 0);
        expect(suma + 1).toBe(cantidadJugadores);
      }
    }
  });

  it('ninguna formación mezcla "medio" con "medioContencion"/"medioOfensivo"', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        const keys = formacion.lineas.map((l) => l.key);
        const tieneMedio = keys.includes('medio');
        const tieneSplit = keys.includes('medioContencion') || keys.includes('medioOfensivo');
        expect(tieneMedio && tieneSplit).toBe(false);
      }
    }
  });

  it('si tiene medioContencion también tiene medioOfensivo (y viceversa)', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        const keys = formacion.lineas.map((l) => l.key);
        expect(keys.includes('medioContencion')).toBe(keys.includes('medioOfensivo'));
      }
    }
  });

  it('solo usa keys válidas', () => {
    for (const formaciones of Object.values(FORMACIONES_POR_CANTIDAD)) {
      for (const formacion of formaciones) {
        for (const linea of formacion.lineas) {
          expect(LINEAS_CAMPO).toContain(linea.key);
        }
      }
    }
  });

  it('fútbol 5 y fútbol 11 tienen las cantidades de formaciones esperadas', () => {
    expect(FORMACIONES_POR_CANTIDAD[5]).toHaveLength(5);
    expect(FORMACIONES_POR_CANTIDAD[11]).toHaveLength(15);
  });
});

describe('listarFormaciones', () => {
  it('devuelve las formaciones de fútbol 5 para cantidadJugadores=5', () => {
    const lista = listarFormaciones(5);
    expect(lista.map((f) => f.codigo)).toEqual(
      expect.arrayContaining(['1-2-1', '2-2', '2-1-1', '1-1-2', '3-1'])
    );
  });

  it('devuelve un arreglo vacío para una cantidad sin catálogo (ej. 3)', () => {
    expect(listarFormaciones(3)).toEqual([]);
  });
});

describe('resolverLineas', () => {
  it('sin selección, usa el algoritmo automático parejo', () => {
    const lineas = resolverLineas(5, undefined);
    expect(lineas).toEqual([
      { key: 'defensa', cantidad: 1 },
      { key: 'medio', cantidad: 2 },
      { key: 'delantero', cantidad: 1 },
    ]);
  });

  it('con codigo "automatico" explícito, igual resultado', () => {
    expect(resolverLineas(5, { codigo: CODIGO_AUTOMATICO })).toEqual([
      { key: 'defensa', cantidad: 1 },
      { key: 'medio', cantidad: 2 },
      { key: 'delantero', cantidad: 1 },
    ]);
  });

  it('con un codigo del catálogo, devuelve esas líneas (ignora "lineas" del body)', () => {
    const lineas = resolverLineas(5, { codigo: '2-2', lineas: [{ key: 'delantero', cantidad: 99 }] });
    expect(lineas).toEqual([
      { key: 'defensa', cantidad: 2 },
      { key: 'delantero', cantidad: 2 },
    ]);
  });

  it('rechaza un codigo que no existe para esa cantidad de jugadores', () => {
    expect(() => resolverLineas(5, { codigo: '4-4-2' })).toThrow(/no está disponible/);
    try {
      resolverLineas(5, { codigo: '4-4-2' });
    } catch (error) {
      expect(error.status).toBe(400);
    }
  });

  it('con codigo "libre" válido, devuelve las líneas tal cual', () => {
    const lineas = resolverLineas(5, {
      codigo: CODIGO_LIBRE,
      lineas: [{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }],
    });
    expect(lineas).toEqual([{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }]);
  });

  it('con codigo "libre" cuya suma no coincide, lanza 400', () => {
    expect(() =>
      resolverLineas(5, { codigo: CODIGO_LIBRE, lineas: [{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 3 }] })
    ).toThrow();
  });

  it('con codigo "libre" que mezcla medio con medioOfensivo, lanza error', () => {
    expect(() =>
      resolverLineas(11, {
        codigo: CODIGO_LIBRE,
        lineas: [
          { key: 'defensa', cantidad: 4 },
          { key: 'medio', cantidad: 4 },
          { key: 'medioOfensivo', cantidad: 1 },
          { key: 'delantero', cantidad: 1 },
        ],
      })
    ).toThrow();
  });
});

describe('capacidadBroad', () => {
  it('suma medioContencion + medioOfensivo en "medio"', () => {
    expect(
      capacidadBroad([
        { key: 'defensa', cantidad: 4 },
        { key: 'medioContencion', cantidad: 2 },
        { key: 'medioOfensivo', cantidad: 3 },
        { key: 'delantero', cantidad: 1 },
      ])
    ).toEqual({ arquero: 1, defensa: 4, medio: 5, delantero: 1 });
  });

  it('formación de 2 líneas deja "medio" en 0', () => {
    expect(
      capacidadBroad([{ key: 'defensa', cantidad: 2 }, { key: 'delantero', cantidad: 2 }])
    ).toEqual({ arquero: 1, defensa: 2, medio: 0, delantero: 2 });
  });
});
