export default function Loading() {
  return (
    <section className="card" aria-live="polite" aria-busy="true">
      <span className="eyebrow">Loading</span>
      <h1>Preparing your breeding workspace…</h1>
      <p className="lede">
        The system is retrieving the records and scientific context needed for this screen.
      </p>
    </section>
  );
}
