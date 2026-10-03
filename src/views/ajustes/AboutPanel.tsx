import { useState } from "react";
import { APP_LOGO_URL, APP_NAME } from "../../app/brand";
import {
  APP_CONTACT_EMAIL,
  APP_COPYRIGHT,
  APP_LICENSE_NAME,
  APP_REPOSITORY_URL,
  APP_VERSION,
  LEGAL_NOTICES,
  loadLicenseText,
  loadThirdPartyNotices,
} from "../../app/legal";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Card, Notice } from "../../components/ui/surfaces";

interface LegalText {
  title: string;
  /** `null` mientras se carga. */
  text: string | null;
  failed: boolean;
}

/** Versión, autor, licencia y avisos legales de la app. */
export function AboutPanel() {
  const [shown, setShown] = useState<LegalText | null>(null);

  function show(title: string, load: () => Promise<string>) {
    setShown({ title, text: null, failed: false });
    load()
      .then((text) => ({ title, text, failed: false }))
      .catch(() => ({ title, text: null, failed: true }))
      .then((next) => {
        // Si entretanto se cerró o se abrió otro texto, este no lo pisa.
        setShown((current) => (current?.title === title ? next : current));
      });
  }

  return (
    <Card title={`Acerca de ${APP_NAME}`}>
      <div className="flex items-center gap-4">
        <img
          src={APP_LOGO_URL}
          alt=""
          className="shadow-pill size-12 shrink-0 rounded-sm"
        />
        <div className="min-w-0">
          <p className="text-lg leading-tight font-bold">
            {APP_NAME}{" "}
            <span className="text-ink/70 font-mono text-sm font-normal">
              versión {APP_VERSION}
            </span>
          </p>
          <p className="text-ink/70 text-sm">{APP_COPYRIGHT}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {LEGAL_NOTICES.map(({ title, text }) => (
          <div key={title} className="flex flex-col gap-1">
            <dt className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
              {title}
            </dt>
            <dd className="text-sm">{text}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-1">
        <p className="text-ink/70 text-xs font-semibold tracking-wide uppercase">
          Contacto y código fuente
        </p>
        <p className="font-mono text-sm break-all select-all">
          {APP_CONTACT_EMAIL}
        </p>
        <p className="font-mono text-sm break-all select-all">
          {APP_REPOSITORY_URL}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            show(`Licencia (${APP_LICENSE_NAME})`, loadLicenseText)
          }
        >
          Ver la licencia
        </Button>
        <Button
          onClick={() => show("Licencias de terceros", loadThirdPartyNotices)}
        >
          Licencias de terceros
        </Button>
      </div>

      {shown ? (
        <Dialog
          title={shown.title}
          size="3xl"
          onClose={() => setShown(null)}
          actions={
            <Button variant="primary" onClick={() => setShown(null)}>
              Cerrar
            </Button>
          }
        >
          {shown.failed ? (
            <Notice tone="danger">No se pudo abrir el texto.</Notice>
          ) : shown.text === null ? (
            <p role="status">Abriendo…</p>
          ) : (
            <pre
              // Con foco, para poder desplazar el texto con el teclado.
              tabIndex={0}
              aria-label={shown.title}
              className="bg-surface/60 border-ink/10 text-ink relative max-h-[60vh] overflow-auto rounded-md border p-4 font-mono text-xs whitespace-pre-wrap"
            >
              {shown.text}
            </pre>
          )}
        </Dialog>
      ) : null}
    </Card>
  );
}
