import { THEME_CHOICES, THEME_LABELS, useTheme } from "../../app/theme";
import { Segmented } from "../../components/ui/Segmented";
import { Card } from "../../components/ui/surfaces";

/** Modo claro, oscuro o el que tenga el sistema. */
export function AppearancePanel() {
  const { choice, setChoice } = useTheme();
  return (
    <Card title="Apariencia">
      <p className="text-ink/70 text-sm">
        Se guarda en este equipo. También puedes cambiar entre claro y oscuro
        desde el pie de la barra lateral.
      </p>
      <Segmented
        label="Tema"
        value={choice}
        options={THEME_CHOICES.map((value) => ({
          value,
          label: THEME_LABELS[value],
        }))}
        onChange={setChoice}
      />
    </Card>
  );
}
