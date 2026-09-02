import { OFFICIAL_SOURCE_HOSTS, officialSourceCatalog } from "@/lib/official-sources";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fuentes" };

export default function AdminSourcesPage() {
  const hosts = Array.from(OFFICIAL_SOURCE_HOSTS);
  return (
    <>
      <header className="admin-head">
        <p className="eyebrow">JERARQUÍA DE VERDAD</p>
        <h1>Fuentes oficiales</h1>
        <p className="admin-lede">
          El catálogo que el agente puede consultar y la lista de dominios permitidos. Ninguna
          respuesta fiscal se apoya en algo que no esté aquí: un blog o una gestoría nunca son
          fuente jurídica.
        </p>
      </header>

      <section className="admin-block">
        <h2>Catálogo consultable</h2>
        <div className="admin-scroller">
          <table>
            <thead><tr><th>Autoridad</th><th>Documento</th><th>Materia</th></tr></thead>
            <tbody>
              {officialSourceCatalog.map((source) => (
                <tr key={source.url}>
                  <td><span className="tag">{source.authority}</span></td>
                  <td>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                    <small className="cell-sub mono">{source.url}</small>
                  </td>
                  <td className="mono cell-text">{source.keywords.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-block">
        <h2>Dominios permitidos</h2>
        <p className="admin-lede">
          El adaptador rechaza cualquier descarga fuera de esta lista, incluida una redirección
          que salga de ella.
        </p>
        <ul className="host-list">
          {hosts.map((host) => <li key={host} className="mono">{host}</li>)}
        </ul>
      </section>

      <section className="admin-block">
        <h2>Hechos normativos verificados</h2>
        <div className="admin-scroller">
          <table>
            <thead><tr><th>Hecho</th><th>Vigencia</th><th>Estado</th></tr></thead>
            <tbody>
              <tr>
                <td>Modelo 037 suprimido; la operativa censal se concentra en el modelo 036</td>
                <td className="mono">desde 03/02/2025</td>
                <td><span className="tag tag--active">Verificado</span></td>
              </tr>
              <tr>
                <td>El modelo 036 recoge la titularidad real de personas jurídicas</td>
                <td className="mono">desde 03/02/2025</td>
                <td><span className="tag tag--active">Verificado</span></td>
              </tr>
              <tr>
                <td>Exención del IAE: personas físicas y entidades con INCN inferior a 1.000.000 €, más los dos primeros períodos impositivos</td>
                <td className="mono">vigente</td>
                <td><span className="tag tag--active">Verificado</span></td>
              </tr>
              <tr>
                <td>Capital mínimo de la SL: 1 €, con reserva legal y responsabilidad solidaria hasta 3.000 €</td>
                <td className="mono">vigente</td>
                <td><span className="tag tag--active">Verificado</span></td>
              </tr>
              <tr>
                <td>Inscripción de empresa en la Seguridad Social y Código de Cuenta de Cotización</td>
                <td className="mono">por confirmar</td>
                <td><span className="tag tag--pending">Sin verificar</span></td>
              </tr>
              <tr>
                <td>Formas jurídicas tramitables por CIRCE mediante DUE</td>
                <td className="mono">por confirmar</td>
                <td><span className="tag tag--pending">Sin verificar</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
