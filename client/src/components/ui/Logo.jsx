// App logo — uses the existing favicon.svg.
// To swap in a different logo, replace /public/favicon.svg or
// change the src below to e.g. "/logo.png".
export function Logo({ className = '' }) {
  return (
    <img
      src="/favicon.svg"
      alt="The Lab"
      className={className}
    />
  );
}
