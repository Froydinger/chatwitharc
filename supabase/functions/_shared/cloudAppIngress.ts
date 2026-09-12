type OwnedRecord = { id: string; user_id: string } | null;
export type CloudAppIngressPorts = {
  session(id: string, ownerId: string): Promise<OwnedRecord>;
  project(id: string, ownerId: string): Promise<OwnedRecord>;
  boost(ownerId: string): Promise<boolean>;
};
export class CloudAppIngressError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Admission uses fresh trusted records. Worker and publication repeat these
 * checks because access may change after acceptance. No project source is read. */
export async function authorizeCloudAppSubmission(
  input: { enabled: boolean; ownerId: string; sessionId: string; request: Record<string, unknown> },
  ports: CloudAppIngressPorts,
): Promise<string> {
  if (!input.enabled) throw new CloudAppIngressError(503, 'Cloud App Builder is not enabled.');
  const projectId = input.request.projectId;
  if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    || Object.prototype.hasOwnProperty.call(input.request, 'currentFiles')) {
    throw new CloudAppIngressError(400, 'Save an owned project before starting a cloud app run.');
  }
  const [session, project, boost] = await Promise.all([
    ports.session(input.sessionId, input.ownerId), ports.project(projectId, input.ownerId), ports.boost(input.ownerId),
  ]);
  if (!session || session.id !== input.sessionId || session.user_id !== input.ownerId
    || !project || project.id !== projectId || project.user_id !== input.ownerId) {
    throw new CloudAppIngressError(404, 'App project or chat not found.');
  }
  if (boost !== true) throw new CloudAppIngressError(403, 'App Builder requires Boost.');
  return projectId;
}
