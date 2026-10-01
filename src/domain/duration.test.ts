import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration";

describe("parseDuration", () => {
  it.each([
    ["6H49min", 409],
    ["8H9min", 489],
    ["9H", 540],
    ["3H30min", 210],
    ["6h49", 409],
    ["6 h 05 min", 365],
    ["6:49", 409],
    ["45min", 45],
    ["7,5", 450],
    ["8", 480],
  ])("entiende %s", (text, minutes) => {
    expect(parseDuration(text)).toEqual({ ok: true, value: minutes });
  });

  it.each(["", "  ", "X", "x", "-"])("trata %j como sin dato", (text) => {
    expect(parseDuration(text)).toEqual({ ok: true, value: null });
  });

  it.each(["mucho", "6H75min", "6:99", "h30", "-3"])("rechaza %s", (text) => {
    expect(parseDuration(text).ok).toBe(false);
  });
});

describe("formatDuration", () => {
  it.each([
    [409, "6h49"],
    [540, "9h"],
    [365, "6h05"],
    [45, "0h45"],
  ])("escribe %i minutos como %s", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });

  it("es reversible con parseDuration", () => {
    for (const minutes of [0, 45, 210, 409, 489, 540]) {
      expect(parseDuration(formatDuration(minutes))).toEqual({
        ok: true,
        value: minutes,
      });
    }
  });
});
