const VARIANTES = {
  primario: 'bg-pasto-600 hover:bg-pasto-500 text-white',
  peligro: 'bg-sancion hover:brightness-110 text-white',
  ghost: 'bg-transparent border border-white/20 hover:bg-white/10 text-white',
};

export default function Boton({ variante = 'primario', className = '', children, ...props }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
