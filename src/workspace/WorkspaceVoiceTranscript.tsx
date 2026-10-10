import { useEffect, useRef, useState } from 'react';
import { ArrowDown, AudioLines } from 'lucide-react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

/** Read the same incremental captions that the existing voice engine supplies. */
export function WorkspaceVoiceTranscript() {
  const entries = useVoiceModeStore(state => state.liveCaptionEntries);
  const status = useVoiceModeStore(state => state.status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const follow = () => {
    followingRef.current = true; setFollowing(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };
  useEffect(() => {
    if (followingRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries]);
  return <section className="ws-voice-transcript" aria-label="Live voice transcript">
    <header><span><AudioLines aria-hidden="true" /> Live transcript</span><small>Saved to your chat</small></header>
    <div ref={scrollRef} className="ws-voice-transcript-scroll" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation transcript" tabIndex={0}
      onScroll={event => {
        const node = event.currentTarget;
        const next = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        followingRef.current = next; setFollowing(next);
      }}>
      {entries.length ? entries.map(entry => <div key={entry.id} className="ws-voice-caption" data-role={entry.role} data-caption-id={entry.id}>
        <span>{entry.role === 'user' ? 'You' : 'Arc'}</span><p>{entry.text}</p>
      </div>) : <p className="ws-voice-transcript-empty">{status === 'connecting' ? 'Your transcript will appear here once connected.' : 'Your words and Arc’s replies will appear here as you talk.'}</p>}
    </div>
    {!following && <button type="button" className="ws-voice-follow" onClick={follow}><ArrowDown aria-hidden="true" /> Latest transcript</button>}
  </section>;
}
