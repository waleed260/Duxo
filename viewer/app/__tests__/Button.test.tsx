import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/Button";

describe("Button", () => {
  it("renders with text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeDefined();
  });

  it("shows loading state", () => {
    render(<Button isLoading>Save</Button>);
    const btn = screen.getByRole("button");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("applies variant classes", () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole("button").className).toContain("bg-accent");

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole("button").className).toContain("text-danger");
  });

  it("fires onClick when clicked", () => {
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(clicked).toBe(true);
  });

  it("does not fire when disabled", () => {
    let clicked = false;
    render(<Button disabled onClick={() => { clicked = true; }}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(clicked).toBe(false);
  });
});
