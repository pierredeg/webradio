import { useState, useCallback } from 'react';

/**
 * Shared hover-tooltip plumbing. An HTML/SVG chart is interactive by nature;
 * every mark in this app gets a tooltip rather than relying on direct labels
 * alone, which are deliberately sparse.
 */
export function useTooltip() {
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content) => {
    setTip({ content, x: event.clientX, y: event.clientY });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  const element = tip ? (
    <div
      className="tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 280),
        top: Math.max(tip.y - 12, 8),
      }}
      role="status"
    >
      {tip.content}
    </div>
  ) : null;

  return { show, hide, element };
}
