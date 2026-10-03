import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/surfaces";

interface HelpPanelProps {
  onShowTutorial: () => void;
}

/** Vuelve a enseñar el tutorial del primer arranque. */
export function HelpPanel({ onShowTutorial }: HelpPanelProps) {
  return (
    <Card title="Primeros pasos">
      <p className="text-ink/70 text-sm">
        El recorrido que viste al instalar la app: cómo empezar y qué hay en
        cada sección.
      </p>
      <div>
        <Button onClick={onShowTutorial}>Ver el tutorial</Button>
      </div>
    </Card>
  );
}
