# UI & Experience Direction

This guide gives the visual design team concrete direction for evolving the shared components located under `packages/web/components/ui`. Focus on building a polished, premium look with a cohesive system that engineering can implement incrementally.

## Brand Pillars

1. **Precision minimalism** — crisp typography, generous whitespace, restrained color.
1. **Tactile depth** — layered surfaces, soft gradients, and controlled glassmorphism.
1. **Calm motion** — 150–220 ms transitions with custom bezier curves for ease.

## Tokenization (Source of Truth)

Define tokens in `packages/web/app/globals.css` so Tailwind’s CSS variables stay authoritative.

| Category | Guidance |
| --- | --- |
| Color | Expand `--primary`, `--accent`, and neutrals to include rich mid-tones. Maintain WCAG AA contrast for text. |
| Radius | Use `--radius` for base components, but introduce `--radius-pill` (`40px`) for buttons and badges that need pill shapes. |
| Shadow | Add `--shadow-soft`, `--shadow-focus`, `--shadow-overlay` vars for layered depth; reference via `shadow-[var(--shadow-soft)]` classes. |
| Motion | Store transition curves as CSS vars (`--ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1)`) and apply to components through Tailwind’s arbitrary values (`transition-[box-shadow] duration-200 ease-[var(--ease-emphasized)]`). |

## Component Checklist

### Button (`packages/web/components/ui/button.tsx`)

- **Variants**: Keep `default`, `secondary`, etc., but add `tonal`, `subtle`, and `glow` to cover marketing needs.
- **States**: Document hover/pressed states with light translation (`translate-y-[1px]`) and tinted shadows.
- **Icons**: Specify spacing for leading/trailing icons (8 px) and add guidelines for `icon`-only buttons.

### Input (`packages/web/components/ui/input.tsx`)

- **Density**: Offer `compact` height (40 px) and `comfortable` (48 px) options to match different forms.
- **Focus treatment**: Use dual focus rings (inner accent + outer subtle) for accessibility and premium feel.
- **Prefix/Suffix**: Provide optional slots for icons or inline actions; document padding adjustments.

### Card (`packages/web/components/ui/card.tsx`)

- **Surface tiers**: Define `base`, `elevated`, and `featured` tiers with progressive shadows and gradient outlines.
- **Padding scale**: Standardize to multiples of the spacing unit (e.g., 24 px header, 20 px content).
- **Interactive states**: Cards used as buttons should get hover lifts and `focus-visible` outlines with `outline-offset: 4px`.

### Badge (`packages/web/components/ui/badge.tsx`)

- **Tone mapping**: Map semantic statuses (success, info, warning) to tonal color pairs with 90% background opacity and 30% border opacity.
- **Letterspacing**: Slight positive tracking (+2%) and uppercase text for pill badges to increase legibility.

## Experience Walkthroughs

1. **Landing hero**: Provide two hero variations (light/dark) with responsive typography lockups and call-to-action groups (primary + tertiary button).
1. **Product narrative cards**: Use `Card` variants to stage three-step flows, each with iconography and supporting copy. Show how cards behave on hover and on touch devices.
1. **Form flows**: Document multi-step form layout, showing error, success, and disabled states on inputs and buttons.

## Delivery Process

1. **Audit** (Day 1–2): Capture screenshots of current components, annotate pain points, and log them in the design board.
1. **Token proposal** (Day 3): Update `globals.css` along with a short Loom walkthrough that explains the palette and motion choices.
1. **Component redesign** (Day 4–5): Refresh `Button`, `Input`, `Card`, and `Badge` with Figma components, including state variants and responsive specs.
1. **Experience mocks** (Day 6–7): Apply updated components to at least two real screens (landing + core flow) to validate hierarchy changes.
1. **Developer handoff** (Day 7): Attach specs + Zeplin/Figma measurements, list implementation tasks referencing file paths, and open follow-up tickets for engineering.

Document progress in this file as decisions evolve, keeping the engineering team aligned with the visual direction.
