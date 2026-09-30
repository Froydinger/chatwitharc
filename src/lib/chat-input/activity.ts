type ActivityStore = {
  setLoading: (value: boolean) => void;
  setGeneratingImage: (value: boolean) => void;
  setSearchingChats: (value: boolean) => void;
  setAccessingMemory: (value: boolean) => void;
  setSearchingWeb: (value: boolean) => void;
  setActiveTask: (value: null) => void;
  setActiveStatusDetails: (value: null) => void;
};

/** Compatibility adapter for the existing foreground/Work activity projections.
 * Owns common terminal cleanup; each attempt settles once. */
export function createComposerActivity(options: {
  work: boolean;
  store: () => ActivityStore;
  getActiveId: () => string | null;
  setActiveId: (id: string | null) => void;
  getCancelled: () => boolean;
  setCancelled: (value: boolean) => void;
  clearController: () => void;
}) {
  const attemptId = crypto.randomUUID();
  let started = false;
  let workAccepted = false;
  let settled = false;
  const requestIsCancelled = () => started ? options.getActiveId() !== attemptId : options.getCancelled();
  const ownsActivity = () => options.work || !started || options.getActiveId() === attemptId;
  const beginRequest = () => {
    if (options.work) { workAccepted = true; options.setCancelled(false); return; }
    if (started) return;
    started = true;
    options.setActiveId(attemptId);
    options.setCancelled(false);
  };
  const setLoading = (value: boolean) => {
    if (value) beginRequest();
    if (ownsActivity()) options.store().setLoading(value);
  };
  const setGeneratingImage = (value: boolean) => { if (ownsActivity()) options.store().setGeneratingImage(value); };
  const setSearchingChats = (value: boolean) => { if (ownsActivity()) options.store().setSearchingChats(value); };
  const setAccessingMemory = (value: boolean) => { if (ownsActivity()) options.store().setAccessingMemory(value); };
  const setSearchingWeb = (value: boolean) => { if (ownsActivity()) options.store().setSearchingWeb(value); };
  const finish = (handedOffToCloudRun: boolean) => {
    if (settled) return;
    settled = true;
    if (!ownsActivity() || (!started && !workAccepted)) return;
    if (!requestIsCancelled() && !handedOffToCloudRun) setLoading(false);
    setSearchingChats(false);
    setAccessingMemory(false);
    setSearchingWeb(false);
    options.store().setActiveTask(null);
    options.store().setActiveStatusDetails(null);
    options.clearController();
    if (options.getActiveId() === attemptId) options.setActiveId(null);
  };
  return { get started() { return started; }, beginRequest, requestIsCancelled, setLoading,
    setGeneratingImage, setSearchingChats, setAccessingMemory, setSearchingWeb, finish };
}
