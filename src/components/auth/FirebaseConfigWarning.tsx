export function FirebaseConfigWarning() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <div className="max-w-md rounded-lg border border-destructive bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold text-destructive">Firebase Not Configured</h1>
        <p className="mt-2 text-muted-foreground">
          Your Firebase environment variables are not set. Please create a <code>.env.local</code> file and add the necessary Firebase configuration to run the application.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Refer to the <code>README.md</code> file for instructions.
        </p>
      </div>
    </div>
  );
}
