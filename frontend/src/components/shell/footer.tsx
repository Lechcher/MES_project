"use client";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-[#161616] text-[#ffffff] py-6">
      <div className="flex flex-col items-center gap-1 px-4">
        <p className="text-sm font-medium">MES Prototype</p>
        <p className="text-xs text-[#8c8c8c]">
          Mock-data prototype — no backend, no network, session clears on
          reload.
        </p>
      </div>
    </footer>
  );
}
