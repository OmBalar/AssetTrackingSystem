import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScanInput } from "@/components/ScanInput";

describe("<ScanInput>", () => {
  it("fires onScan with trimmed value when Enter is pressed", () => {
    const onScan = vi.fn();
    render(<ScanInput onScan={onScan} />);
    const input = screen.getByPlaceholderText(/scan or type/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  C0000101  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScan).toHaveBeenCalledWith("C0000101", { source: "keyboard" });
  });

  it("does not fire on empty submission", () => {
    const onScan = vi.fn();
    render(<ScanInput onScan={onScan} />);
    const input = screen.getByPlaceholderText(/scan or type/i) as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onScan).not.toHaveBeenCalled();
  });

  it("clears input after firing", () => {
    const onScan = vi.fn();
    render(<ScanInput onScan={onScan} />);
    const input = screen.getByPlaceholderText(/scan or type/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "C0000101" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
  });
});
