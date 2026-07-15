export const SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE = 'yuel.savedSelectionFeedback';

export interface SavedSelectionFeedbackMessage {
  type: typeof SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE;
  status: 'saved' | 'failed';
}

export function isSavedSelectionFeedbackMessage(
  value: unknown,
): value is SavedSelectionFeedbackMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SavedSelectionFeedbackMessage>;
  return (
    candidate.type === SAVED_SELECTION_FEEDBACK_MESSAGE_TYPE
    && (candidate.status === 'saved' || candidate.status === 'failed')
  );
}
