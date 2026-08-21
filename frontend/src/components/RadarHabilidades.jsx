import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

export default function RadarHabilidades({ perfil }) {
  if (!perfil) return null;

  const data = [
    { name: 'Velocidad', value: perfil.velocidad ?? 0 },
    { name: 'Pegada', value: perfil.pegada ?? 0 },
    { name: 'Toca Pase', value: perfil.tocaPase ?? 0 },
    { name: 'Gambeta', value: perfil.gambeta ?? 0 },
    { name: 'Marca Defensa', value: perfil.marcaDefensa ?? 0 },
    { name: 'Físico', value: perfil.fisico ?? 0 },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-cancha-800/60 p-6">
      <h2 className="mb-6 text-sm font-bold uppercase tracking-wide text-pasto-500">Habilidades</h2>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} margin={{ top: 20, right: 80, bottom: 20, left: 80 }}>
          <PolarGrid stroke="rgba(255, 255, 255, 0.1)" />
          <PolarAngleAxis dataKey="name" stroke="rgba(255, 255, 255, 0.6)" tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} stroke="rgba(255, 255, 255, 0.3)" />
          <Radar name="Habilidades" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
