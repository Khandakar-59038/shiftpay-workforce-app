"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-deep"
    >
      Download PDF / Print
    </button>
  );
}
