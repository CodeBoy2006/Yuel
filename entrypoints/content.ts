import { registerCollectorStatusResponder } from '../src/content/collectorStatus';
import { startReadingRecordingControl } from '../src/content/recordingControl';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    const recordingControl = startReadingRecordingControl();
    const stopReportingStatus = registerCollectorStatusResponder(() => ({
      url: window.location.href,
      collecting: recordingControl.collecting,
    }));

    window.addEventListener('pagehide', () => {
      stopReportingStatus();
      recordingControl.stop();
    }, { once: true });
  },
});
