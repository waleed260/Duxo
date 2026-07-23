import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CodeInput } from "@/components/CodeInput";

describe("CodeInput", () => {
  it("renders the label", () => {
    render(<CodeInput value="" onChange={() => {}} />);
    expect(screen.getByText("Connection code")).toBeDefined();
  });

  it("shows custom label", () => {
    render(<CodeInput value="" onChange={() => {}} label="Test label" />);
    expect(screen.getByText("Test label")).toBeDefined();
  });

  it("shows error message", () => {
    render(<CodeInput value="" onChange={() => {}} error="Invalid code" />);
    expect(screen.getByText("Invalid code")).toBeDefined();
  });

  it("displays grouped value", () => {
    render(<CodeInput value="12345678" onChange={() => {}} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toContain("1234");
  });

  it("is disabled when disabled prop is set", () => {
    render(<CodeInput value="" onChange={() => {}} disabled />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
