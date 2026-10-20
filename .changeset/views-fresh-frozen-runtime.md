---
"@smthrs/views": patch
"@smthrs/ui": patch
---

A generated view can no longer read another view's props, change what another view renders, or emit what the render
guard refuses by building an element by hand.

- `PresentationRealm` loads the bundle into a fresh QuickJS runtime for every render and interaction and closes it
  after the call. A view used to reach an internal component by calling a subset component, such as Radix's `Slot`
  through `Button({ asChild: true })`, wrap its `render`, and capture the next view's props. Each call now costs a
  bundle load, about 50 ms with the real bundle.
- `Presentation.install` deeply freezes `require` and every module behind it, so a view that sets
  `Children.toArray`, `Card.x` or `event.x` fails with a `TypeError` instead of leaving a mailbox for another view.
- New `Presentation.guardRenderer` patches React's static renderer so every element it emits passes the new
  `Presentation.guardHost`, on a frozen copy of its props. A hand-built `{ $$typeof, type: "script" }`, an element
  changed after a constructor checked it, or a getter that answers the guard and the renderer differently is now
  refused. `install` refuses a bundle whose renderer skips the guard. The realm's HTML stays untrusted: the docs now
  say so, and the frame sanitizer keeps a regression case for what a forged element would emit.
- `@smthrs/ui` builds its presentation bundle through `guardRenderer` and regenerates it with the new realm half.
