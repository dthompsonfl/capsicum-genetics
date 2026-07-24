import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card empty-state">
      <span className="eyebrow">Record not found</span>
      <h1>That page or record is unavailable.</h1>
      <p className="lede">
        It may have been removed, the link may be incomplete, or your role may not allow access.
      </p>
      <p>
        <Link className="button" href="/">
          Return home
        </Link>
      </p>
    </section>
  );
}
