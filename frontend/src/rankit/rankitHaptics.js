import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

const fallback = pattern => {
  try { navigator.vibrate?.(pattern); } catch { /* web önizlemede sessiz kal */ }
};

export const rankitHaptics = {
  select: () => Haptics.selectionChanged().catch(() => fallback(8)),
  impact: () => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => fallback(14)),
  success: () => Haptics.notification({ type: NotificationType.Success }).catch(() => fallback([12, 35, 18])),
};
