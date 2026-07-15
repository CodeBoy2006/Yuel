import { registerCollectorStatusResponder } from '../src/content/collectorStatus';
import { startReadingRecordingControl } from '../src/content/recordingControl';
import { registerSavedSelectionFeedback } from '../src/content/savedSelectionFeedback';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    const recordingControl = startReadingRecordingControl();
    const stopReportingStatus = registerCollectorStatusResponder(() => ({
      url: window.location.href,
      collecting: recordingControl.collecting,
    }));
    const stopSavedSelectionFeedback = registerSavedSelectionFeedback();

    window.addEventListener('pagehide', () => {
      stopSavedSelectionFeedback();
      stopReportingStatus();
      recordingControl.stop();
    }, { once: true });
  },
});
