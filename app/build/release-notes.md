## Anchor 1.1.0

A better deal for gamers, a smarter Boost, a much lighter Anchor in the background, and fixes for Debloat.

### For gamers

- **Every Performance tweak was checked against how Windows really behaves.** The ones that did nothing now work: reducing animations applies instantly, and transparency and instant menus no longer need a sign-out. Disabling fullscreen optimizations now sets everything it needs to. The Multi-Plane Overlay switch is gone, because Windows 11 24H2 and later ignore it.
- **Switching a tweak off puts back exactly what you had.** Anchor saves your settings before it changes them, and Revert all restores them, including your power plan. Before, reverting could leave things different from how they started, like turning Game Mode off.
- **Each tweak says what it really affects:** FPS, Smoothness, Input latency or Desktop only. Only the ones that help games are marked Recommended.
- **Your graphics card's real video memory.** Integrated graphics like Intel HD 630 used to show a made-up 1 GB. Anchor now reads the real figure from the graphics driver and shows it at the top of the GPU card.
- **GPU scheduling only appears if your graphics card supports it,** and the "Restart your PC" banner only shows when a restart is actually needed.
- **No more duplicate Ultimate Performance plans.** Unlocking it again no longer adds another copy, and a button removes the extra ones earlier versions created, keeping the one you use.

### Lighter in the background

- **Only one Anchor runs at a time.** Opening it again brings up the window you already have, so there's no second tray icon.
- **About a third of the memory in the tray:** roughly 290 MB instead of 870 MB. Background helpers close when they're not needed, and the window is released a minute after you close it to the tray. Opening Anchor loads it again in a second or two.

### Fixes and improvements

- **Debloat is fast and works for more people.** There's no restore point to wait for any more. Apps Windows won't let you remove are no longer listed, and removal also works when you sign in to Anchor with a different administrator account.
- **Boost does more and shows it neatly.** After cleaning up, it lowers the priority of background apps that are hogging the CPU, so what you're using comes first and the PC runs cooler. Nothing is closed. When memory is running short, it also frees it up from idle background apps; when there's plenty free, it leaves memory alone and tells you so. One row on Home shows what was cleaned, how much RAM was freed and how many apps were calmed, with Details for the full lists.
- **Confirmation windows always open in the middle of the window**, instead of far down a long page.
