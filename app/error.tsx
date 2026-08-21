"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="error-page"><span>!</span><h1>The coordination view could not load.</h1><p>No emergency request was lost. Retry the view or return to the operational overview.</p><button onClick={reset}>Retry safely</button><a href="/">Return to overview</a></main>}
