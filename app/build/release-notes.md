## Anchor 1.0.1

Fixes for the app icon and Tech Spotlight's Videos tab.

### Fixes

- **The app icon no longer looks garbled.** In 1.0.0 the new logo showed up as scrambled pixels on the taskbar, in the system tray, on the app window and in the installer. It now shows correctly everywhere. If you still see the old icon after updating, Windows is showing a cached copy: sign out and back in, or unpin Anchor from the taskbar and pin it again.
- **Videos no longer go blank when YouTube's feeds fail.** YouTube's video feeds have been failing on and off for many channels. Anchor used to treat that as "no videos" and empty the tab. Now a channel that doesn't answer keeps showing its last videos, and if YouTube doesn't answer at all, you keep the videos you already had.
- **A clear message when there's nothing to show.** If YouTube isn't responding and Anchor has no videos saved yet, the tab says so, instead of telling you to press Refresh.
