import { useId } from "react";
import { cx } from "../../lib/cx";

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Selector de pocas opciones a la vista: píldoras dentro de una cápsula. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink/70 mb-2 text-xs font-semibold tracking-wide uppercase">
        {label}
      </legend>
      <div className="border-ink/10 bg-surface/70 shadow-pill inline-flex h-9 items-center gap-1 rounded-full border p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(
                "flex h-full cursor-pointer items-center rounded-full px-3 text-sm whitespace-nowrap",
                "has-focus-visible:outline-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                checked
                  ? "bg-primary text-on-accent font-semibold"
                  : "text-ink/80 hover:bg-ink/5 hover:text-ink font-medium",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
