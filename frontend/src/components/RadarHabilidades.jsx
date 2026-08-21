import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

const CustomRadarLabel = (props) => {
  const { x, y, value, cx, cy } = props;
  // Posicionar el label dentro del polígono (60% de distancia desde centro hacia punta)
  const offsetX = cx + (x - cx) * 0.6;
  const offsetY = cy + (y - cy) * 0.6;

  return (
    <text
      x={offsetX}
      y={offsetY}
      fill="rgba(255, 255, 255, 0.85)"
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize="16"
      fontWeight="700"
    >
      {value}
    </text>
  );
};

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
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} margin={{ top: 40, right: 100, bottom: 40, left: 100 }}>
          <PolarGrid stroke="rgba(255, 255, 255, 0.1)" radialLines={false} />
          <PolarAngleAxis dataKey="name" stroke="rgba(255, 255, 255, 0.6)" tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Habilidades" dataKey="value" stroke="#22c55e" fill="#22c55e" fillOpacity={0.25} label={<CustomRadarLabel />} isAnimationActive={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
