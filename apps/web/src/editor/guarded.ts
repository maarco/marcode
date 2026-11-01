/**
 * try/catch/finally as a function. The React Compiler cannot lower a
 * `try` with both `catch` and `finally`, which would leave the component
 * unmemoized; this keeps the handlers compilable.
 */
export async function guarded(
  run: () => Promise<void>,
  onError: (error: unknown) => void,
  onDone: () => void,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    onError(error);
  } finally {
    onDone();
  }
}
