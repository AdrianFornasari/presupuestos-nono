import { useSyncExternalStore } from 'react';
import { getUpdateNotice, subscribeUpdateNotice } from './foregroundUpdate';

export default function PwaUpdateNotice() {
  const message = useSyncExternalStore(subscribeUpdateNotice, getUpdateNotice);
  return message ? <p className="pwa-update-notice" role="status" aria-live="polite">{message}</p> : null;
}
