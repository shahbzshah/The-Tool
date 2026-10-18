import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="card-paper max-w-md space-y-4 p-8 text-center">
        <h2 className="font-serif text-xl font-semibold">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <Link href="/" className="btn-primary inline-block">
          Back to Hunter
        </Link>
      </div>
    </div>
  );
}
