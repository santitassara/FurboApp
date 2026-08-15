import ResultadoPartido from './ResultadoPartido';

export default function PartidoConEstado({ partido, resultado, children }) {
  if (partido.estado === 'jugado') {
    return <ResultadoPartido partido={partido} resultado={resultado} />;
  }

  if (partido.estado === 'cerrado') {
    return (
      <div className="relative">
        <div className="pointer-events-none blur-sm">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-cancha-900/60">
          <p className="rounded-lg bg-black/70 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
            Esperando resultados
          </p>
        </div>
      </div>
    );
  }

  return children;
}
