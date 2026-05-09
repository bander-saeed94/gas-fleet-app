import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import XYCanvas from "../components/XYCanvas";
import { useFleetStore } from "../store/store";

describe("XYCanvas", () => {
  beforeEach(() => {
    useFleetStore.setState({
      stations: [],
      nextId: 1,
      result: null,
      visibleTrucks: new Set(),
    });
  });

  test("clicking the canvas adds a station with the prompted demand", () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("1500");

    render(<XYCanvas width={400} height={300} />);
    const svg = screen.getByTestId("xy-canvas");

    // Background rect carries data-bg=1; click event handler reads target.
    const bg = svg.querySelector('[data-bg="1"]') as SVGRectElement;
    fireEvent.click(bg, { clientX: 200, clientY: 150 });

    expect(promptSpy).toHaveBeenCalled();
    const stations = useFleetStore.getState().stations;
    expect(stations).toHaveLength(1);
    expect(stations[0].demand).toBe(1500);
  });

  test("rejects non-positive demand silently", () => {
    vi.spyOn(window, "prompt").mockReturnValue("0");
    render(<XYCanvas width={400} height={300} />);
    const svg = screen.getByTestId("xy-canvas");
    const bg = svg.querySelector('[data-bg="1"]') as SVGRectElement;
    fireEvent.click(bg, { clientX: 100, clientY: 100 });
    expect(useFleetStore.getState().stations).toHaveLength(0);
  });
});
