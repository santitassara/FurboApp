import CrearGrupoForm from '../components/CrearGrupoForm';
import UnirseGrupoForm from '../components/UnirseGrupoForm';
import { useGrupo } from '../context/GrupoContext';

export default function SeleccionarGrupo() {
  const { errorGrupos } = useGrupo();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="font-display text-3xl leading-none text-white">Elegí tu grupo</h1>
        <p className="mt-2 text-sm text-white/60">Creá un grupo nuevo o unite a uno con un código de invitación.</p>
      </header>
      {errorGrupos && <p className="rounded-lg bg-sancion/20 px-4 py-2 text-sm text-sancion">{errorGrupos}</p>}
      <CrearGrupoForm />
      <UnirseGrupoForm />
    </div>
  );
}
