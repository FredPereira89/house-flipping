export default function HomePage() {
  return (
    <main className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <section className="surface" style={{ padding: "var(--space-6)" }}>
        <span className="badge badge--brand">Scaffold</span>
        <h1 style={{ marginTop: "var(--space-3)" }}>House Flipping Pipeline</h1>
        <p>
          The Next.js scaffold is up and running. The real leads dashboard
          (filters, hot-lead highlighting, duplicate clustering) lands in a
          later task.
        </p>
      </section>
    </main>
  );
}