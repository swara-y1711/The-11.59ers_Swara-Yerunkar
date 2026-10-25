import React from "react";
import { AudioLines, ShieldCheck } from "lucide-react";

export default function CallerPage({ LiveCall }) {
  return (
    <main className="caller-shell">
      <header className="caller-brand">
        <div className="brand-icon"><AudioLines size={22} /></div>
        <div>
          <strong>CyberMitra</strong>
          <span>Secure call simulation</span>
        </div>
        <small><ShieldCheck size={13} /> Demo / Simulation</small>
      </header>
      <LiveCall role="caller" />
      <footer className="caller-footer">
        This is a simulation. Do not share sensitive personal or financial information.
      </footer>
    </main>
  );
}
