/** Resolve persisted kind before either adapter claims. Each adapter still
 * validates current owner/entitlements after its atomic lease claim. */
export function cloudRunDispatch(ports: {
  kind(id: string): Promise<unknown>;
  chat(id: string): Promise<boolean>;
  app(id: string): Promise<boolean>;
  appEnabled: boolean;
}) {
  return async (id: string): Promise<boolean> => {
    const kind = await ports.kind(id);
    if (kind === null) return false; // Deleted after candidate selection.
    if (kind === 'chat') return await ports.chat(id);
    if (kind === 'app') {
      if (!ports.appEnabled) return false;
      return await ports.app(id);
    }
    throw new Error('Unsupported persisted cloud run kind');
  };
}
