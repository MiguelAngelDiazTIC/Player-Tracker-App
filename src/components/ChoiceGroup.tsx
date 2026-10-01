import { useId } from "react";
import type { FieldType, FieldValue } from "../domain/fields";
import { cx } from "../lib/cx";
import { choicesFor } from "./choices";

interface ChoiceGroupProps {
  type: FieldType;
  value: FieldValue;
  onCommit: (value: FieldValue) => void;
  label: string;
}

/** Hábito en un formulario: todas las opciones a la vista, como botones de radio. */
export function ChoiceGroup({
  type,
  value,
  onCommit,
  label,
}: ChoiceGroupProps) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-surface/70 mb-2 font-mono text-xs tracking-wide uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choicesFor(type).map((choice) => {
          const checked = choice.value === value;
          const Icon = choice.icon;
          return (
            <label
              key={String(choice.value)}
              className={cx(
                "flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2 text-sm",
                "has-focus-visible:outline-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                checked
                  ? "border-primary bg-primary text-surface font-semibold"
                  : "border-surface/20 bg-surface/5 text-surface/80 hover:bg-surface/10 hover:text-surface",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onCommit(choice.value)}
              />
              <Icon aria-hidden="true" className="size-4" />
              {choice.label.charAt(0).toUpperCase() + choice.label.slice(1)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
