import Link from 'next/link';
export default function NotFound() { return <section className="page-width empty-state"><h1>Let’s find another way.</h1><p>This page isn’t part of the customer marketplace.</p><Link href="/" className="button button-primary">Back to home</Link></section>; }
