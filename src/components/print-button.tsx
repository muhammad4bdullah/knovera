"use client";

export function PrintButton() {
  return <button className="button button-primary" onClick={() => window.print()}>Print or save PDF</button>;
}
