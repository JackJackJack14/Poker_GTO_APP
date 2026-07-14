import { useState } from 'react';

export function HotkeyLegend() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 left-4 z-40 rounded-lg border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-1.5 text-[10px] font-semibold text-gold shadow-lg backdrop-blur-sm hover:bg-zinc-800"
        title="แสดงปุ่มลัด"
      >
        ⌨ Hotkeys
      </button>
    );
  }

  return (
    <aside className="fixed bottom-4 left-4 z-40 w-52 rounded-xl border border-zinc-700/60 bg-zinc-950/92 p-3 text-[10px] leading-relaxed text-zinc-400 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-widest text-gold">
          Grinding Mode
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded px-1 text-zinc-500 hover:text-zinc-300"
          aria-label="ซ่อนปุ่มลัด"
        >
          −
        </button>
      </div>

      <p className="mb-1.5 font-semibold text-zinc-300">ไพ่ (พิมพ์เลยได้)</p>
      <ul className="mb-2 space-y-0.5 pl-1">
        <li>
          <kbd className="text-gold">AsKd</kbd> → เลือกไพ่ติดกัน
        </li>
        <li>
          <kbd className="text-zinc-300">a k q j t</kbd> = A K Q J T
        </li>
        <li>
          <kbd className="text-zinc-300">s h d c</kbd> = ♠ ♥ ♦ ♣
        </li>
        <li className="text-zinc-500">ไม่ต้องคลิกช่อง — ระบบโฟกัสช่องว่างให้อัตโนมัติ</li>
      </ul>

      <p className="mb-1.5 font-semibold text-zinc-300">Action (เลือกเก้าอี้)</p>
      <ul className="mb-2 space-y-0.5 pl-1">
        <li>
          <kbd className="rounded bg-zinc-800 px-1 text-gold">f</kbd> Fold
        </li>
        <li>
          <kbd className="rounded bg-zinc-800 px-1 text-gold">c</kbd> Check / Call
        </li>
        <li>
          <kbd className="rounded bg-zinc-800 px-1 text-gold">r</kbd> โฟกัส Bet/Raise
        </li>
        <li>
          <kbd className="rounded bg-zinc-800 px-1 text-gold">1-6</kbd> โฟกัส Bet เก้าอี้
        </li>
      </ul>

      <p className="text-[9px] text-zinc-500">
        คลิกแผงควบคุมเก้าอี้เพื่อเลือกตำแหน่งก่อนกด f/c/r
      </p>
    </aside>
  );
}
