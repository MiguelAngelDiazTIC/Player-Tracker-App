import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/Button";
import { Labeled, TextInput } from "../../components/ui/fields";
import { Card } from "../../components/ui/surfaces";
import { formatDate, todayIso } from "../../domain/dates";
import {
  daysLeft,
  GOALS_SETTING,
  readGoals,
  sortGoals,
  type Goal,
} from "../../domain/goals";
import { cx } from "../../lib/cx";
import { newId } from "../../lib/id";

function deadlineText(goal: Goal, today: string): string {
  const left = daysLeft(goal, today);
  if (goal.deadline === null || left === null) return "Sin fecha límite";
  const date = formatDate(goal.deadline);
  if (goal.done) return `Fecha límite: ${date}`;
  if (left === 0) return `Vence hoy (${date})`;
  if (left > 0)
    return `${left === 1 ? "Queda 1 día" : `Quedan ${left} días`} (${date})`;
  return `Venció hace ${left === -1 ? "1 día" : `${-left} días`} (${date})`;
}

/** Objetivos del jugador ("llegar a Radiant antes de..."), con su cuenta atrás. */
export function GoalsCard() {
  const { settings, setSetting } = useStore();
  const today = todayIso();
  const goals = sortGoals(readGoals(settings[GOALS_SETTING]));
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");

  const save = (next: Goal[]) => setSetting(GOALS_SETTING, next);

  function addGoal(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (name === "") return;
    save([
      ...goals,
      { id: newId(), title: name, deadline: deadline || null, done: false },
    ]);
    setTitle("");
    setDeadline("");
  }

  return (
    <Card title="Objetivos">
      {goals.length === 0 ? (
        <p className="text-ink/70 text-sm">
          Aún no hay objetivos. Apunta a dónde quieres llegar y, si quieres,
          para cuándo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {goals.map((goal) => {
            const left = daysLeft(goal, today);
            const overdue = !goal.done && left !== null && left < 0;
            return (
              <li key={goal.id} className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary size-4 shrink-0"
                    checked={goal.done}
                    onChange={() =>
                      save(
                        goals.map((other) =>
                          other.id === goal.id
                            ? { ...other, done: !other.done }
                            : other,
                        ),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span
                      className={cx(
                        "block truncate text-sm font-semibold",
                        goal.done && "text-ink/70 line-through",
                      )}
                    >
                      {goal.title}
                    </span>
                    <span className="text-ink/70 block font-mono text-xs">
                      {deadlineText(goal, today)}
                      {overdue ? " · fuera de plazo" : ""}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  aria-label={`Eliminar el objetivo ${goal.title}`}
                  title="Eliminar objetivo"
                  onClick={() =>
                    save(goals.filter((other) => other.id !== goal.id))
                  }
                  className="text-ink/80 hover:bg-danger/25 hover:text-ink active:bg-danger/40 flex size-9 shrink-0 items-center justify-center rounded-md"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={addGoal} className="flex flex-wrap items-end gap-2">
        <Labeled label="Nuevo objetivo" className="min-w-48 flex-1">
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Llegar a Radiant"
          />
        </Labeled>
        <Labeled label="Fecha límite" className="w-40">
          <TextInput
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </Labeled>
        <Button type="submit" disabled={title.trim() === ""}>
          Añadir objetivo
        </Button>
      </form>
    </Card>
  );
}
