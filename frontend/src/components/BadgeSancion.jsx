export default function BadgeSancion({ sancionado }) {
  if (!sancionado) return null;

  return (
    <span className="rounded-full bg-sancion/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sancion">
      Sancionado
    </span>
  );
}
