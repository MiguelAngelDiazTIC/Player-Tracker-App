import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("muestra las seis secciones en la barra lateral", () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const labels = within(nav)
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(labels).toEqual([
      "Tabla",
      "Scrims y 10mans",
      "Calendario",
      "Dashboard",
      "Revisión semanal",
      "Ajustes",
    ]);
  });

  it("abre en la Tabla", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Tabla",
    );
    expect(screen.getByRole("button", { name: "Tabla" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("cambia de sección al pulsar en la barra lateral", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Dashboard" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dashboard",
    );
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Tabla" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("se puede recorrer y activar con el teclado", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Tabla" })).toHaveFocus();

    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Scrims y 10mans",
    );
  });
});
