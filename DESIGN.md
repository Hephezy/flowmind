# FlowMind design system

The implementation follows the specification’s flat dark workspace design.

| Token             | Value                    |
| ----------------- | ------------------------ |
| Background        | `#080808`                |
| Surface           | `#111111`                |
| Alternate surface | `#1a1a1a`                |
| Accent            | `#00d4ff`                |
| Primary text      | `#f0f0f0`                |
| Border            | `rgba(255,255,255,.075)` |
| Positive          | `#7de3b0`                |
| Attention         | `#eabf74`                |
| Destructive       | `#ee8d91`                |

Syne is used for headings and DM Sans for body text. Font files are bundled through Fontsource. The UI uses Lucide SVG icons and initial-based avatars; it does not depend on external avatar services. There are no gradients or shadows.

The desktop layout uses a fixed sidebar, workspace header, responsive stat cards, and a two-column dashboard. At tablet widths, content collapses into single columns where needed. The mobile navigation opens through a menu control; the action board scrolls horizontally to retain usable card widths. List tables retain columns through horizontal scrolling when necessary.

Dialogs support Escape and focus containment. Buttons have focus-visible outlines, form controls have labels, toggles expose switch semantics, and action status also has a select control so drag-and-drop is not the only interaction. Motion is disabled when reduced motion is requested. PDF export uses the browser’s print/save-to-PDF flow and a print-specific stylesheet.

The demo labels sample meetings and processing. Recording/provider credentials are never pretended to be live. The landing page includes product illustrations and the specified pricing, with no invented customer testimonials.
