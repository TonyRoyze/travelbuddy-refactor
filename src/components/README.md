# Shared components

- `ui/`: backbone UI primitives and their standard variants, such as buttons,
  inputs, dialogs, comboboxes, and message primitives.
- `custom-ui/`: augmented controls and reusable compositions, such as select
  comboboxes, time pickers, animated delete buttons, avatars, file uploads, and
  feedback states. Keep supporting files beside their components.
- `sections/`: larger composed sections, such as the login form layout, built
  from UI primitives and custom components.

Keep feature-specific components in `src/features/<feature>/`. Import shared
components directly from their folder. The shadcn `ui` alias continues to point
to `@/components/ui` so generated primitives go into the backbone layer.
